/**
 * Valida las migraciones de Costura AP contra un PostgreSQL real (PGlite/WASM),
 * sin necesidad de Docker ni de una base remota.
 *
 *   node scripts/validate-migrations.mjs
 *
 * Levanta un Postgres efímero en memoria, crea stubs mínimos de los esquemas que
 * aporta Supabase (auth / storage) y aplica TODAS las migraciones en orden.
 * Si alguna falla, imprime el error y termina con código 1.
 *
 * Sirve como red de seguridad en CI antes de hacer `supabase db push`.
 */
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

/**
 * Stubs de lo que Supabase provee de fábrica. No pretenden ser fieles: solo lo
 * suficiente para que las migraciones compilen y se validen referencias, tipos,
 * constraints, cuerpos plpgsql y políticas RLS.
 */
const SUPABASE_STUBS = /* sql */ `
  -- Roles que usan las políticas y los GRANT.
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;

  create schema if not exists auth;
  create schema if not exists storage;

  create table if not exists auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at         timestamptz default now()
  );

  -- En Supabase devuelve el sub del JWT. Acá lo leemos de un GUC para poder
  -- simular sesiones en las pruebas.
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create table if not exists storage.buckets (
    id                 text primary key,
    name               text not null,
    public             boolean default false,
    file_size_limit    bigint,
    allowed_mime_types text[],
    created_at         timestamptz default now()
  );

  create table if not exists storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets (id),
    name       text,
    owner      uuid,
    created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;

  -- Devuelve los segmentos de carpeta de una ruta (igual que en Supabase).
  create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
    select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
  $$;
`;

async function main() {
  const db = await PGlite.create({ extensions: { citext } });

  console.log('▸ Preparando stubs de Supabase (auth / storage)…');
  await db.exec(SUPABASE_STUBS);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.error('✗ No se encontraron migraciones en supabase/migrations');
    process.exit(1);
  }

  let failed = 0;

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`  ✓ ${file}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ ${file}`);
      console.error(`    ${error.message}`);
      if (error.hint) console.error(`    hint: ${error.hint}`);
      // Seguimos: así vemos todos los errores de una pasada, no solo el primero.
    }
  }

  if (failed > 0) {
    console.error(`\n✗ ${failed} migración(es) con errores.`);
    await db.close();
    process.exit(1);
  }

  // Resumen de lo que quedó creado: confirma que el esquema realmente existe.
  const tables = await db.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `);
  const policies = await db.query(`select count(*)::int as n from pg_policies where schemaname in ('public','storage')`);
  const functions = await db.query(`
    select count(*)::int as n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  `);
  const buckets = await db.query(`select count(*)::int as n from storage.buckets`);

  console.log(`\n✓ Todas las migraciones aplicaron correctamente.`);
  console.log(`  Tablas:     ${tables.rows.length}`);
  console.log(`  Políticas:  ${policies.rows[0].n}`);
  console.log(`  Funciones:  ${functions.rows[0].n}`);
  console.log(`  Buckets:    ${buckets.rows[0].n}`);
  console.log(`\n  ${tables.rows.map((r) => r.table_name).join(', ')}`);

  await db.close();
}

main().catch((error) => {
  console.error('✗ Error inesperado:', error);
  process.exit(1);
});
