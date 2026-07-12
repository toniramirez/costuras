/**
 * Borra TODOS los datos de demostración.
 *
 *   npm run demo:clean
 *
 * Identifica lo cargado por `demo:seed`: prefijo «Demo · » o correo `@demo.local`.
 * Nunca toca datos reales.
 *
 * Corre como `postgres` (vía PAT o cadena de conexión, igual que las migraciones)
 * porque necesita desactivar temporalmente dos cosas:
 *   · el guardia que impide borrar movimientos ligados a un pago — correcto en
 *     operación normal, estorbo cuando se limpia una demo entera;
 *   · los triggers de auditoría, para no dejar el registro lleno de ruido.
 * Ambos se vuelven a habilitar al terminar, dentro de la misma transacción.
 */
import pg from 'pg';

const refApi = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
  /https:\/\/([a-z0-9]+)\.supabase\.co/i,
)?.[1];
const pat = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!refApi || (!pat && !dbUrl)) {
  console.error(
    '\n✗ Necesito NEXT_PUBLIC_SUPABASE_URL y una de estas dos en .env.local:\n' +
      '    SUPABASE_ACCESS_TOKEN   (https://supabase.com/dashboard/account/tokens)\n' +
      '    SUPABASE_DB_URL         (Dashboard → Connect → Session pooler)\n',
  );
  process.exit(1);
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`;

/** Tablas cuyos triggers hay que silenciar durante la limpieza. */
const TABLAS = [
  'students', 'monthly_fees', 'registration_fees', 'payments', 'payment_proofs',
  'recovery_credits', 'rates', 'plans', 'groups', 'financial_movements',
];

const SQL = /* sql */ `
begin;

${TABLAS.map((t) => `alter table public.${t} disable trigger user;`).join('\n')}

-- Todo lo que vamos a borrar, identificado por su marca de demo.
create temp table demo_students on commit drop as
  select id, profile_id from public.students where email like '%@demo.local';

create temp table demo_ids on commit drop as
      select id::text as id from demo_students
union select mf.id::text from public.monthly_fees mf   join demo_students d on d.id = mf.student_id
union select p.id::text  from public.payments p        join demo_students d on d.id = p.student_id
union select rf.id::text from public.registration_fees rf join demo_students d on d.id = rf.student_id
union select rc.id::text from public.recovery_credits rc  join demo_students d on d.id = rc.student_id
union select g.id::text  from public.groups g where g.name like 'Demo · %'
union select pl.id::text from public.plans pl  where pl.name like 'Demo · %'
union select r.id::text  from public.rates r   where r.name  like 'Demo · %';

delete from public.audit_logs where entity_id in (select id from demo_ids);

-- Primero el dinero (el orden importa por las claves foráneas).
delete from public.financial_movements
 where student_id in (select id from demo_students)
    or description like 'Demo · %'
    or workshop_id in (select id from public.workshops where name like 'Demo · %');

delete from public.payment_receipts where student_id in (select id from demo_students);
delete from public.payments         where student_id in (select id from demo_students);

delete from public.notifications
 where profile_id in (select profile_id from demo_students where profile_id is not null);

delete from public.workshops      where name    like 'Demo · %';
delete from public.announcements  where title   like 'Demo · %';
delete from public.communications where subject like 'Demo · %';
delete from public.class_sessions
 where group_id in (select id from public.groups where name like 'Demo · %');

-- Borrar el usuario de Auth arrastra su profile.
delete from auth.users where email like '%@demo.local';

delete from public.students where email like '%@demo.local';
delete from public.groups   where name  like 'Demo · %';
delete from public.rates    where name  like 'Demo · %';
delete from public.plans    where name  like 'Demo · %';

${TABLAS.map((t) => `alter table public.${t} enable trigger user;`).join('\n')}

-- Si no quedó NINGÚN recibo, la numeración vuelve a empezar en 1.
-- Sin esto, después de jugar con la demo el primer recibo real de la academia
-- sería el #26. La correlatividad se respeta igual: nunca se reutiliza un número
-- que exista.
update public.academy_settings
   set receipt_next_number = 1
 where id = 1
   and not exists (select 1 from public.payment_receipts);

commit;
`;

const CONTEO = /* sql */ `
select
  (select count(*) from public.students where email like '%@demo.local')  as alumnas,
  (select count(*) from public.groups   where name  like 'Demo · %')      as grupos,
  (select count(*) from public.plans    where name  like 'Demo · %')      as modalidades,
  (select count(*) from public.workshops where name like 'Demo · %')      as talleres
`;

// ── Conexión (misma lógica que apply-migrations) ────────────────────────────
let ejecutar;
let cerrar = async () => {};

if (dbUrl) {
  const cliente = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  ejecutar = async (sql) => (await cliente.query(sql)).rows;
  cerrar = () => cliente.end();
} else {
  ejecutar = async (sql) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${refApi}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const cuerpo = await r.text();
    if (!r.ok) throw new Error(cuerpo);
    return cuerpo ? JSON.parse(cuerpo) : [];
  };
}

const [antes] = await ejecutar(CONTEO);
console.log(`\n▸ Datos de demostración en ${verde(refApi)}`);
console.log(`  ${antes.alumnas} alumnas · ${antes.grupos} grupos · ${antes.modalidades} modalidades · ${antes.talleres} talleres`);

if (Number(antes.alumnas) === 0 && Number(antes.grupos) === 0) {
  console.log(`\n${verde('✓ No hay nada que borrar.')}\n`);
  await cerrar();
  process.exit(0);
}

await ejecutar(SQL);

const [despues] = await ejecutar(CONTEO);
const limpio =
  Number(despues.alumnas) === 0 &&
  Number(despues.grupos) === 0 &&
  Number(despues.modalidades) === 0 &&
  Number(despues.talleres) === 0;

console.log(
  limpio
    ? `\n${verde('✓ Datos de demostración eliminados.')} Los datos reales quedaron intactos.\n`
    : `\n✗ Quedaron restos: ${JSON.stringify(despues)}\n`,
);

await cerrar();
process.exit(limpio ? 0 : 1);
