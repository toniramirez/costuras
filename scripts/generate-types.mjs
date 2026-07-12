/**
 * Genera src/lib/supabase/database.types.ts a partir de las migraciones,
 * usando un PostgreSQL efímero (PGlite). No necesita proyecto remoto.
 *
 *   node scripts/generate-types.mjs
 *
 * El formato replica el del CLI de Supabase (`supabase gen types typescript`),
 * así que cuando el proyecto real esté conectado se puede regenerar con el CLI
 * y el resultado es intercambiable.
 */
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'lib', 'supabase', 'database.types.ts');

const STUBS = `
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  create schema if not exists auth;
  create schema if not exists storage;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/'); $$;
`;

/** Mapea un tipo de PostgreSQL al tipo TypeScript equivalente. */
function tsType(column, enumNames) {
  const udt = column.udt_name;
  if (column.data_type === 'ARRAY') {
    const inner = udt.replace(/^_/, '');
    return `${tsType({ data_type: '', udt_name: inner }, enumNames)}[]`;
  }
  if (enumNames.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;

  switch (udt) {
    case 'uuid': case 'text': case 'citext': case 'varchar': case 'bpchar':
    case 'date': case 'time': case 'timetz': case 'timestamp': case 'timestamptz':
      return 'string';
    case 'int2': case 'int4': case 'int8': case 'float4': case 'float8': case 'numeric':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json': case 'jsonb': case 'record':
      return 'Json';
    case 'void':
      return 'undefined';
    default:
      return 'string';
  }
}

const db = await PGlite.create({ extensions: { citext } });
await db.exec(STUBS);

const files = (await readdir(join(ROOT, 'supabase', 'migrations')))
  .filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  await db.exec(await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8'));
}

// ── Enums ───────────────────────────────────────────────────────────────────
const enums = await db.query(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
   group by t.typname
   order by t.typname
`);
const enumNames = new Set(enums.rows.map((e) => e.name));

// ── Tablas y vistas ─────────────────────────────────────────────────────────
const relations = await db.query(`
  select c.relname as name, c.relkind as kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
   order by c.relkind, c.relname
`);

// ── Claves foráneas ─────────────────────────────────────────────────────────
// supabase-js las necesita (Relationships) para tipar los selects anidados
// tipo `.select('*, groups(name)')`. Sin esto, la inferencia devuelve `never`.
const fks = await db.query(`
  select
    con.conname as constraint_name,
    cl.relname  as table_name,
    fcl.relname as referenced_relation,
    (select array_agg(a.attname order by u.ord)
       from unnest(con.conkey) with ordinality as u(attnum, ord)
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum) as columns,
    (select array_agg(a.attname order by u.ord)
       from unnest(con.confkey) with ordinality as u(attnum, ord)
       join pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.attnum) as referenced_columns,
    exists (
      select 1 from pg_index i
       where i.indrelid = con.conrelid
         and i.indisunique
         and i.indnatts = array_length(con.conkey, 1)
         and (i.indkey::int2[]) @> con.conkey
         and con.conkey @> (i.indkey::int2[])
    ) as is_one_to_one
  from pg_constraint con
  join pg_class cl  on cl.oid  = con.conrelid
  join pg_class fcl on fcl.oid = con.confrelid
  join pg_namespace n on n.oid = cl.relnamespace
 where con.contype = 'f' and n.nspname = 'public'
 order by cl.relname, con.conname
`);

const fksPorTabla = new Map();
for (const fk of fks.rows) {
  if (!fksPorTabla.has(fk.table_name)) fksPorTabla.set(fk.table_name, []);
  fksPorTabla.get(fk.table_name).push(fk);
}

// ── Funciones (para .rpc() tipado) ──────────────────────────────────────────
const funciones = await db.query(`
  select
    p.proname                as name,
    p.proretset              as returns_set,
    rt.typname               as return_type,
    p.proargnames            as arg_names,
    p.proargmodes            as arg_modes,
    p.pronargs               as n_in_args,
    p.pronargdefaults        as n_defaults,
    (select array_agg(t.typname order by u.ord)
       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as u(oid, ord)
       join pg_type t on t.oid = u.oid) as arg_types
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
 where n.nspname = 'public'
   and p.prokind = 'f'
   and rt.typname <> 'trigger'
   -- Excluye lo que instala una extensión (p. ej. las funciones de citext).
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
 order by p.proname
`);

/** Igual que tsType pero partiendo del nombre del tipo (para args de funciones). */
function tsTypeByName(typname, enums) {
  if (!typname) return 'unknown';
  if (typname.startsWith('_')) return `${tsTypeByName(typname.slice(1), enums)}[]`;
  if (enums.has(typname)) return `Database["public"]["Enums"]["${typname}"]`;
  return tsType({ data_type: '', udt_name: typname }, enums);
}

const columns = await db.query(`
  select table_name, column_name, data_type, udt_name, is_nullable,
         (column_default is not null) as has_default,
         is_generated
    from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position
`);

const byTable = new Map();
for (const col of columns.rows) {
  if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
  byTable.get(col.table_name).push(col);
}

const lines = [];
lines.push('// ⚠️ ARCHIVO GENERADO — no editar a mano.');
lines.push('// Regenerar con:  npm run db:types');
lines.push('// (Con el proyecto Supabase ya conectado también sirve:');
lines.push('//   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts)');
lines.push('');
lines.push('export type Json =');
lines.push('  | string');
lines.push('  | number');
lines.push('  | boolean');
lines.push('  | null');
lines.push('  | { [key: string]: Json | undefined }');
lines.push('  | Json[];');
lines.push('');
lines.push('export type Database = {');
lines.push('  __InternalSupabase: {');
lines.push('    PostgrestVersion: "12";');
lines.push('  };');
lines.push('  public: {');

// Tables
lines.push('    Tables: {');
for (const rel of relations.rows.filter((r) => r.kind === 'r')) {
  const cols = byTable.get(rel.name) ?? [];
  lines.push(`      ${rel.name}: {`);

  lines.push('        Row: {');
  for (const c of cols) {
    const optional = c.is_nullable === 'YES' ? ' | null' : '';
    lines.push(`          ${c.column_name}: ${tsType(c, enumNames)}${optional};`);
  }
  lines.push('        };');

  lines.push('        Insert: {');
  for (const c of cols) {
    // Opcional si es nullable, tiene default o es generada.
    const opt = c.is_nullable === 'YES' || c.has_default || c.is_generated === 'ALWAYS' ? '?' : '';
    const nul = c.is_nullable === 'YES' ? ' | null' : '';
    lines.push(`          ${c.column_name}${opt}: ${tsType(c, enumNames)}${nul};`);
  }
  lines.push('        };');

  lines.push('        Update: {');
  for (const c of cols) {
    const nul = c.is_nullable === 'YES' ? ' | null' : '';
    lines.push(`          ${c.column_name}?: ${tsType(c, enumNames)}${nul};`);
  }
  lines.push('        };');

  // Relationships: sin esto, supabase-js no puede tipar los selects anidados.
  lines.push('        Relationships: [');
  for (const fk of fksPorTabla.get(rel.name) ?? []) {
    lines.push('          {');
    lines.push(`            foreignKeyName: "${fk.constraint_name}";`);
    lines.push(`            columns: [${fk.columns.map((c) => `"${c}"`).join(', ')}];`);
    lines.push(`            isOneToOne: ${fk.is_one_to_one};`);
    lines.push(`            referencedRelation: "${fk.referenced_relation}";`);
    lines.push(`            referencedColumns: [${fk.referenced_columns.map((c) => `"${c}"`).join(', ')}];`);
    lines.push('          },');
  }
  lines.push('        ];');

  lines.push('      };');
}
lines.push('    };');

// Views
lines.push('    Views: {');
for (const rel of relations.rows.filter((r) => r.kind === 'v')) {
  const cols = byTable.get(rel.name) ?? [];
  lines.push(`      ${rel.name}: {`);
  lines.push('        Row: {');
  for (const c of cols) {
    lines.push(`          ${c.column_name}: ${tsType(c, enumNames)} | null;`);
  }
  lines.push('        };');
  lines.push('        Relationships: [];');
  lines.push('      };');
}
lines.push('    };');

// Enums
lines.push('    Enums: {');
for (const e of enums.rows) {
  lines.push(`      ${e.name}: ${e.values.map((v) => `"${v}"`).join(' | ')};`);
}
lines.push('    };');

// Functions (necesario para .rpc() tipado)
lines.push('    Functions: {');
for (const f of funciones.rows) {
  const modos = f.arg_modes;
  const nombres = f.arg_names ?? [];
  const tipos = f.arg_types ?? [];

  const argsEntrada = [];
  const columnasSalida = [];

  if (!modos) {
    // Sin modos declarados => todos los argumentos son de entrada.
    tipos.forEach((tipo, i) => argsEntrada.push({ name: nombres[i] ?? `arg${i}`, type: tipo }));
  } else {
    modos.forEach((modo, i) => {
      const entrada = { name: nombres[i] ?? `arg${i}`, type: tipos[i] };
      if (modo === 'i' || modo === 'b') argsEntrada.push(entrada);
      if (modo === 'o' || modo === 'b' || modo === 't') columnasSalida.push(entrada);
    });
  }

  // Los últimos N argumentos tienen valor por defecto => son opcionales.
  const primerOpcional = argsEntrada.length - (f.n_defaults ?? 0);

  lines.push(`      ${f.name}: {`);
  if (argsEntrada.length === 0) {
    lines.push('        Args: Record<PropertyKey, never>;');
  } else {
    lines.push('        Args: {');
    argsEntrada.forEach((a, i) => {
      const opcional = i >= primerOpcional ? '?' : '';
      lines.push(`          ${a.name}${opcional}: ${tsTypeByName(a.type, enumNames)};`);
    });
    lines.push('        };');
  }

  let retorno;
  if (columnasSalida.length > 0) {
    const campos = columnasSalida
      .map((c) => `${c.name}: ${tsTypeByName(c.type, enumNames)}`)
      .join('; ');
    retorno = `{ ${campos} }`;
  } else {
    retorno = tsTypeByName(f.return_type, enumNames);
  }
  if (f.returns_set) retorno += '[]';

  lines.push(`        Returns: ${retorno};`);
  lines.push('      };');
}
lines.push('    };');

lines.push('    CompositeTypes: {');
lines.push('      [_ in never]: never;');
lines.push('    };');

lines.push('  };');
lines.push('};');
lines.push('');

// Atajos de uso cotidiano.
lines.push('type PublicSchema = Database["public"];');
lines.push('');
lines.push('export type Tables<T extends keyof PublicSchema["Tables"]> =');
lines.push('  PublicSchema["Tables"][T]["Row"];');
lines.push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =');
lines.push('  PublicSchema["Tables"][T]["Insert"];');
lines.push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =');
lines.push('  PublicSchema["Tables"][T]["Update"];');
lines.push('export type Views<T extends keyof PublicSchema["Views"]> =');
lines.push('  PublicSchema["Views"][T]["Row"];');
lines.push('export type Enums<T extends keyof PublicSchema["Enums"]> =');
lines.push('  PublicSchema["Enums"][T];');
lines.push('');

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, lines.join('\n'), 'utf8');
await db.close();

console.log(`✓ Tipos generados en src/lib/supabase/database.types.ts`);
console.log(`  Tablas: ${relations.rows.filter((r) => r.kind === 'r').length}`);
console.log(`  Vistas: ${relations.rows.filter((r) => r.kind === 'v').length}`);
console.log(`  Enums:  ${enums.rows.length}`);
