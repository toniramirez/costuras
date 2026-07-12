/**
 * Aplica las migraciones de Costura AP a un proyecto Supabase real.
 *
 *   npm run db:check   → conecta, verifica y lista pendientes. NO escribe nada.
 *   npm run db:push    → aplica las migraciones pendientes.
 *
 * Acepta DOS formas de conectarse (usa la que tengas configurada en .env.local):
 *
 *   A) SUPABASE_DB_URL     — cadena de conexión PostgreSQL (Session pooler).
 *   B) SUPABASE_ACCESS_TOKEN — Personal Access Token (sbp_…), vía Management API.
 *                              No necesita la contraseña de la base.
 *
 * Compatible con el CLI de Supabase: registra lo aplicado en
 * supabase_migrations.schema_migrations, así que después podés seguir usando
 * `supabase db push` sin que reaplique nada.
 *
 * ── Salvaguardas ────────────────────────────────────────────────────────────
 * 1. El proyecto destino debe coincidir con NEXT_PUBLIC_SUPABASE_URL.
 * 2. Si encuentra tablas de OTRA aplicación (peluquerOS), aborta.
 * Existen porque en este entorno hay un Supabase de producción ajeno, y una
 * migración aplicada ahí por error sería irreversible.
 */
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SOLO_VERIFICAR = process.argv.includes('--check');

/** Tablas que delatan que estaríamos apuntando a la base de peluquerOS. */
const TABLAS_PROHIBIDAS = ['whatsapp_messages', 'appointments', 'tenants', 'professionals'];

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function abortar(mensaje) {
  console.error(`\n${rojo('✗ ABORTADO')}\n  ${mensaje}\n`);
  process.exit(1);
}

const refDesdeApiUrl = (url) => (url ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;

/** project_ref dentro de una cadena de conexión (pooler o directa). */
const refDesdeDbUrl = (url) =>
  url.match(/\/\/postgres\.([a-z0-9]+):/i)?.[1] ??
  url.match(/@db\.([a-z0-9]+)\.supabase\.co/i)?.[1] ??
  null;

// ── Elegir método de conexión ───────────────────────────────────────────────
const dbUrl = process.env.SUPABASE_DB_URL?.trim();
const pat = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const refApi = refDesdeApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

if (!refApi) {
  abortar('Falta NEXT_PUBLIC_SUPABASE_URL en .env.local (o no tiene formato válido).');
}
if (!dbUrl && !pat) {
  abortar(
    'Necesito una de estas dos en .env.local:\n\n' +
      '  SUPABASE_DB_URL       → Dashboard → botón "Connect" → pestaña "Session pooler"\n' +
      '  SUPABASE_ACCESS_TOKEN → https://supabase.com/dashboard/account/tokens  (sbp_…)\n\n' +
      '  Con cualquiera de las dos alcanza.',
  );
}

/**
 * Ejecuta SQL contra el proyecto. Abstrae las dos vías de conexión para que el
 * resto del script no tenga que saber cuál se está usando.
 */
let ejecutar;
let cerrar = async () => {};
let via;

if (dbUrl) {
  const refDb = refDesdeDbUrl(dbUrl);
  if (!refDb) abortar('No pude reconocer el project_ref dentro de SUPABASE_DB_URL.');
  if (refDb !== refApi) {
    abortar(
      `El proyecto de la base NO coincide con el de la API.\n` +
        `  SUPABASE_DB_URL          → ${refDb}\n` +
        `  NEXT_PUBLIC_SUPABASE_URL → ${refApi}\n` +
        `  Estarías escribiendo en el proyecto equivocado.`,
    );
  }

  const cliente = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }, // Supabase exige TLS; la conexión va cifrada.
  });
  await cliente.connect().catch((e) => abortar(`No pude conectar a la base: ${e.message}`));

  ejecutar = async (sql) => (await cliente.query(sql)).rows;
  cerrar = () => cliente.end();
  via = 'conexión directa (Session pooler)';
} else {
  // Management API: el project_ref va explícito en la URL, así que no hay
  // ninguna chance de pegarle a otro proyecto.
  const endpoint = `https://api.supabase.com/v1/projects/${refApi}/database/query`;

  ejecutar = async (sql) => {
    const respuesta = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    const cuerpo = await respuesta.text();
    if (!respuesta.ok) {
      let detalle = cuerpo;
      try {
        detalle = JSON.parse(cuerpo).message ?? cuerpo;
      } catch {}
      const error = new Error(detalle);
      error.status = respuesta.status;
      throw error;
    }
    return cuerpo ? JSON.parse(cuerpo) : [];
  };
  via = 'Management API (Personal Access Token)';
}

console.log(`\n▸ Proyecto destino: ${verde(refApi)}`);
console.log(`  Vía: ${gris(via)}`);

// ── Salvaguarda: ¿es la base de otra aplicación? ────────────────────────────
const existentes = await ejecutar(`
  select table_name from information_schema.tables
   where table_schema = 'public'
     and table_name in (${TABLAS_PROHIBIDAS.map((t) => `'${t}'`).join(', ')})
`).catch((e) => abortar(`No pude consultar la base: ${e.message}`));

if (existentes.length > 0) {
  await cerrar();
  abortar(
    `Esta base contiene tablas de OTRA aplicación: ${existentes.map((r) => r.table_name).join(', ')}\n` +
      `  Parece la base de peluquerOS. No voy a tocarla.`,
  );
}

// ── Registro de migraciones (mismo formato que el CLI de Supabase) ──────────
await ejecutar(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version    text primary key,
    statements text[],
    name       text
  );
`);

const yaAplicadas = await ejecutar(`select version from supabase_migrations.schema_migrations`);
const aplicadas = new Set(yaAplicadas.map((r) => r.version));

const archivos = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
const pendientes = archivos.filter((f) => !aplicadas.has(f.split('_')[0]));

console.log(`  Migraciones totales:   ${archivos.length}`);
console.log(`  Ya aplicadas:          ${aplicadas.size}`);
console.log(`  Pendientes:            ${pendientes.length}\n`);

if (pendientes.length === 0) {
  console.log(verde('✓ La base ya está al día.\n'));
  await cerrar();
  process.exit(0);
}

if (SOLO_VERIFICAR) {
  console.log('Se aplicarían, en este orden:');
  pendientes.forEach((f) => console.log(gris(`  · ${f}`)));
  console.log(`\n${gris('Modo --check: no se escribió nada.')}\n`);
  await cerrar();
  process.exit(0);
}

// ── Aplicación ──────────────────────────────────────────────────────────────
// Cada migración viaja junto con su registro en una sola sentencia: PostgreSQL
// la corre como transacción implícita, así que entra entera o no entra nada.
for (const archivo of pendientes) {
  const version = archivo.split('_')[0];
  const nombre = archivo.replace(/^\d+_/, '').replace(/\.sql$/, '');
  const sql = await readFile(join(MIGRATIONS_DIR, archivo), 'utf8');

  const registro = `
    insert into supabase_migrations.schema_migrations (version, name)
    values ('${version}', '${nombre.replace(/'/g, "''")}');
  `;

  try {
    await ejecutar(`${sql}\n${registro}`);
    console.log(`  ${verde('✓')} ${archivo}`);
  } catch (error) {
    await cerrar();
    abortar(
      `Falló ${archivo}\n  ${error.message}\n` +
        `  Esa migración se revirtió entera (transacción). Las anteriores quedaron aplicadas.`,
    );
  }
}

// ── Resumen ─────────────────────────────────────────────────────────────────
const [resumen] = await ejecutar(`
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE')            as tablas,
    (select count(*) from pg_policies where schemaname in ('public','storage')) as politicas,
    (select count(*) from storage.buckets)                                     as buckets
`);

console.log(`\n${verde('✓ Migraciones aplicadas.')}`);
console.log(`  Tablas:    ${resumen.tablas}`);
console.log(`  Políticas: ${resumen.politicas}`);
console.log(`  Buckets:   ${resumen.buckets}\n`);

await cerrar();
