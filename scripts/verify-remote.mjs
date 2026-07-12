/**
 * Audita el esquema YA APLICADO en el proyecto Supabase real.
 *
 *   npm run db:verify
 *
 * No alcanza con que las migraciones "hayan aplicado OK": esto comprueba contra
 * la base real que la RLS está activa en todas las tablas, que ninguna quedó
 * expuesta, y corre el analizador de seguridad oficial de Supabase.
 */
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
  /https:\/\/([a-z0-9]+)\.supabase\.co/i,
)?.[1];
const pat = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!ref || !pat) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_ACCESS_TOKEN en .env.local');
  process.exit(1);
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

console.log(`\n▸ Auditando proyecto ${verde(ref)}\n`);

// 1. RLS activa en TODAS las tablas de public
const sinRls = await sql(`
  select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
   order by 1
`);
console.log(
  sinRls.length === 0
    ? `  ${verde('✓')} RLS activa en todas las tablas`
    : `  ${rojo('✗')} SIN RLS: ${sinRls.map((r) => r.tabla).join(', ')}`,
);

// 2. Tablas con RLS pero sin ninguna política (quedarían inaccesibles)
const sinPoliticas = await sql(`
  select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname)
   order by 1
`);
console.log(
  sinPoliticas.length === 0
    ? `  ${verde('✓')} Todas las tablas con RLS tienen políticas`
    : `  ${amarillo('!')} Con RLS y sin políticas: ${sinPoliticas.map((r) => r.tabla).join(', ')}`,
);

// 3. anon no debe tener permisos sobre ninguna tabla de public
const permisosAnon = await sql(`
  select table_name, privilege_type
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
   limit 10
`);
console.log(
  permisosAnon.length === 0
    ? `  ${verde('✓')} anon no tiene permisos sobre ninguna tabla`
    : `  ${rojo('✗')} anon TIENE permisos: ${permisosAnon.map((p) => `${p.table_name}:${p.privilege_type}`).join(', ')}`,
);

// 4. Buckets privados (solo 'branding' puede ser público)
const buckets = await sql(`select id, public from storage.buckets order by id`);
const publicosIndebidos = buckets.filter((b) => b.public && b.id !== 'branding');
console.log(
  publicosIndebidos.length === 0
    ? `  ${verde('✓')} Buckets: ${buckets.length} (solo "branding" es público)`
    : `  ${rojo('✗')} Buckets públicos indebidos: ${publicosIndebidos.map((b) => b.id).join(', ')}`,
);

// 5. Funciones SECURITY DEFINER sin search_path fijo (riesgo de secuestro)
const definerInseguras = await sql(`
  select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
     )
   order by 1
`);
console.log(
  definerInseguras.length === 0
    ? `  ${verde('✓')} Todas las SECURITY DEFINER fijan search_path`
    : `  ${rojo('✗')} SECURITY DEFINER sin search_path: ${definerInseguras.map((f) => f.proname).join(', ')}`,
);

// 6. Analizador de seguridad oficial de Supabase
const adv = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, {
  headers: { Authorization: `Bearer ${pat}` },
});

if (adv.ok) {
  const { lints = [] } = await adv.json();
  const graves = lints.filter((l) => l.level === 'ERROR');
  const avisos = lints.filter((l) => l.level === 'WARN');

  console.log(`\n▸ Analizador de seguridad de Supabase`);
  console.log(
    graves.length === 0
      ? `  ${verde('✓')} Sin errores`
      : `  ${rojo('✗')} ${graves.length} error(es):`,
  );
  graves.forEach((l) => console.log(`     · ${l.title} — ${l.detail?.replace(/<[^>]+>/g, '')}`));

  if (avisos.length > 0) {
    console.log(`  ${amarillo('!')} ${avisos.length} advertencia(s):`);
    avisos.forEach((l) => console.log(`     · ${l.title} — ${l.detail?.replace(/<[^>]+>/g, '')}`));
  }
}

console.log('');
