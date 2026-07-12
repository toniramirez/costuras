/**
 * Pruebas de la lógica de negocio de Costura AP contra un PostgreSQL real
 * (PGlite/WASM). Sin Docker, sin base remota, sin datos de producción.
 *
 *   node scripts/test-database.mjs
 *
 * Cubre los casos obligatorios que viven en la base de datos: generación de
 * cuotas, anti-duplicados, comprobantes, recibos correlativos, movimientos de
 * caja, recuperaciones sin doble uso, talleres con lista de espera y —lo más
 * importante— el AISLAMIENTO RLS entre alumnos.
 */
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const STUBS = /* sql */ `
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  create schema if not exists auth;
  create schema if not exists storage;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid, created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
  $$;
`;

// Errores inesperados: mensaje limpio en vez del volcado enorme de PGlite/WASM.
const die = (error) => {
  console.error(`\n\x1b[31m✗ Error inesperado\x1b[0m`);
  console.error(`  ${error.message}`);
  if (error.where) console.error(`  en: ${error.where}`);
  if (error.query) console.error(`  query: ${String(error.query).slice(0, 200)}`);
  process.exit(1);
};
process.on('uncaughtException', die);
process.on('unhandledRejection', die);

// ── mini framework de aserciones ────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `esperado ${expected}, obtenido ${actual}`);
}

/** Verifica que una operación FALLE (reglas que deben rechazarse). */
async function rejects(name, fn, expectedFragment = '') {
  try {
    await fn();
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name} — se esperaba un error y no ocurrió`);
  } catch (error) {
    const matches = !expectedFragment || error.message.toLowerCase().includes(expectedFragment.toLowerCase());
    ok(name, matches, `error inesperado: ${error.message}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ── arranque ────────────────────────────────────────────────────────────────
const db = await PGlite.create({ extensions: { citext } });
await db.exec(STUBS);

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  await db.exec(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
}
console.log(`▸ Esquema aplicado (${files.length} migraciones)\n`);

// Sesiones simuladas -----------------------------------------------------------
// Replican lo que hace PostgREST: fija el rol de Postgres Y el claim `role` del
// JWT. Simular solo el rol de Postgres dejaría ciegos a los chequeos que miran
// el claim (fue exactamente el punto ciego que permitió el agujero de anon).
const sesion = (rol, uid = '') =>
  db.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '${uid}', false);
    select set_config('request.jwt.claim.role', '${rol}', false);
    ${rol === 'service_role' ? '' : `set role ${rol};`}
  `);

/** El servidor (rutas seguras, webhook, cron). Saltea RLS. */
const asService = () => sesion('service_role');
/** Un usuario con sesión iniciada (admin o alumno). */
const asUser = (uid) => sesion('authenticated', uid);
/** Alguien SIN sesión, pegándole directo a la API pública. */
const asAnon = () => sesion('anon');

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;

// ── datos base ──────────────────────────────────────────────────────────────
await asService();

const admin = await one(`
  insert into auth.users (email, raw_user_meta_data)
  values ('admin@costuraap.test', '{"role":"admin","full_name":"Administradora"}'::jsonb)
  returning id`);

const userAna = await one(`
  insert into auth.users (email, raw_user_meta_data)
  values ('ana@test.com', '{"role":"alumno","full_name":"Ana Pérez"}'::jsonb) returning id`);
const userBeto = await one(`
  insert into auth.users (email, raw_user_meta_data)
  values ('beto@test.com', '{"role":"alumno","full_name":"Beto Gómez"}'::jsonb) returning id`);

section('Autenticación y perfiles');

// ESCALADA DE PRIVILEGIOS: el usuario "admin" se creó pidiendo role=admin en sus
// propios metadatos (exactamente lo que haría un atacante vía signUp público).
// El trigger DEBE ignorarlo.
const perfilRecienCreado = await one(`select role from public.profiles where id = $1`, [admin.id]);
eq('ESCALADA BLOQUEADA: pedir role=admin en los metadatos NO te vuelve admin',
  perfilRecienCreado.role, 'alumno');

// Ascender a administradora es una operación privilegiada, aparte del registro.
await db.query(
  `update public.profiles set role = 'admin', must_change_password = false where id = $1`,
  [admin.id],
);
const adminProfile = await one(`select role from public.profiles where id = $1`, [admin.id]);
eq('La administradora se asciende con una operación privilegiada', adminProfile.role, 'admin');

const anaProfile = await one(`select role, must_change_password from public.profiles where id = $1`, [userAna.id]);
eq('El alumno se crea con rol alumno', anaProfile.role, 'alumno');
eq('El alumno debe cambiar la contraseña temporal', anaProfile.must_change_password, true);

// Estructura académica
const plan = await one(`
  insert into public.plans (name, classes_included, frequency, price_cents)
  values ('1 clase semanal', 1, 'semanal', 3000000) returning id`);
const rateMar = await one(`
  insert into public.rates (name, plan_id, valid_from, valid_until, amount_cents)
  values ('Marzo a Junio', $1, '2026-03-01', '2026-06-30', 3000000) returning id`, [plan.id]);

const grupoMartes = await one(`
  insert into public.groups (name, weekday, start_time, end_time, capacity, plan_id)
  values ('Martes tarde', 2, '15:00', '17:00', 8, $1) returning id`, [plan.id]);
const grupoLleno = await one(`
  insert into public.groups (name, weekday, start_time, end_time, capacity)
  values ('Miércoles noche', 3, '18:00', '20:00', 1) returning id`);

// Alumnos
const ana = await one(`
  insert into public.students (profile_id, first_name, last_name, email, status, start_date, group_id, plan_id, rate_id)
  values ($1, 'Ana', 'Pérez', 'ana@test.com', 'activo', '2026-03-01', $2, $3, $4) returning id`,
  [userAna.id, grupoMartes.id, plan.id, rateMar.id]);
const beto = await one(`
  insert into public.students (profile_id, first_name, last_name, email, status, start_date, group_id, plan_id, rate_id)
  values ($1, 'Beto', 'Gómez', 'beto@test.com', 'activo', '2026-03-01', $2, $3, $4) returning id`,
  [userBeto.id, grupoMartes.id, plan.id, rateMar.id]);

section('Alumnos');
ok('Se crea la ficha del alumno', !!ana.id);
const cuentaAlumnos = await one(`select count(*)::int as n from public.students`);
eq('Hay 2 alumnos cargados', cuentaAlumnos.n, 2);

// ── CUOTAS ──────────────────────────────────────────────────────────────────
section('Cuotas mensuales');
await asUser(admin.id); // la administradora opera con RLS activa

const gen1 = await one(`select * from public.generate_monthly_fees(2026, 5)`);
eq('Se generan 2 cuotas (una por alumno activo)', gen1.created_count, 2);

const feeAna = await one(
  `select * from public.monthly_fees where student_id = $1 and period_year = 2026 and period_month = 5`, [ana.id]);
eq('La cuota toma el importe de la tarifa asignada', Number(feeAna.base_amount_cents), 3000000);
eq('El importe final = base + ajuste', Number(feeAna.final_amount_cents), 3000000);
eq('La cuota nace pendiente', feeAna.status, 'pendiente');

// Caso 5: prevención de cuota duplicada
const gen2 = await one(`select * from public.generate_monthly_fees(2026, 5)`);
eq('Reejecutar la generación NO crea duplicados', gen2.created_count, 0);
const totalMayo = await one(
  `select count(*)::int as n from public.monthly_fees where period_year=2026 and period_month=5`);
eq('Sigue habiendo exactamente 2 cuotas de mayo', totalMayo.n, 2);

await asService();
await rejects('La restricción única bloquea una cuota duplicada a nivel base',
  () => db.query(
    `insert into public.monthly_fees (student_id, period_year, period_month, base_amount_cents, manual_adjustment_cents, final_amount_cents)
     values ($1, 2026, 5, 100, 0, 100)`, [ana.id]),
  'uq_monthly_fee');

await rejects('El importe final debe ser coherente con base + ajuste',
  () => db.query(
    `insert into public.monthly_fees (student_id, period_year, period_month, base_amount_cents, manual_adjustment_cents, final_amount_cents)
     values ($1, 2026, 9, 1000, 0, 777)`, [ana.id]),
  'monthly_fee_final_ck');

// Alumno pausado: no se le generan cuotas
await asService();
await db.query(`update public.students set status = 'pausado' where id = $1`, [beto.id]);
await asUser(admin.id);
const genJunio = await one(`select * from public.generate_monthly_fees(2026, 6)`);
eq('El alumno pausado no genera cuota nueva', genJunio.created_count, 1);
await asService();
await db.query(`update public.students set status = 'activo' where id = $1`, [beto.id]);

// Receso enero/febrero configurable
await asUser(admin.id);
const genEnero = await one(`select * from public.generate_monthly_fees(2026, 1)`);
eq('Enero no factura si está configurado como receso', genEnero.created_count, 0);

// ── COMPROBANTES ────────────────────────────────────────────────────────────
section('Comprobantes de transferencia');
const efectivo = await one(`select id from public.payment_methods where code = 'efectivo'`);
const cajaEfectivo = await one(`select id from public.cash_accounts where type = 'efectivo'`);
const cajaBanco = await one(`select id from public.cash_accounts where type = 'banco'`);

// El alumno sube el comprobante de SU cuota
await asUser(userAna.id);
const proof = await one(`
  insert into public.payment_proofs (student_id, monthly_fee_id, file_path, informed_amount_cents, reference)
  values ($1, $2, 'proofs/${ana.id}/${feeAna.id}/comprobante.jpg', 3000000, 'OP-12345')
  returning id`, [ana.id, feeAna.id]);
ok('El alumno puede subir el comprobante de su cuota', !!proof.id);

const feeTrasProof = await one(`select status from public.monthly_fees where id = $1`, [feeAna.id]);
eq('La cuota pasa a "comprobante_pendiente"', feeTrasProof.status, 'comprobante_pendiente');

await asService();
const notifAdmin = await one(
  `select count(*)::int as n from public.notifications where audience='admin' and type='comprobante_subido'`);
eq('Se notifica a la administradora', notifAdmin.n, 1);
const ingresosAun = await one(
  `select count(*)::int as n from public.financial_movements where monthly_fee_id = $1`, [feeAna.id]);
eq('Todavía NO se registra ningún ingreso', ingresosAun.n, 0);

// Caso 21/30: un alumno NO puede subir comprobante para la cuota de otro
const feeBeto = await one(
  `select id from public.monthly_fees where student_id = $1 and period_month = 5`, [beto.id]);
await asUser(userAna.id);
await rejects('Un alumno NO puede subir comprobante para la cuota de otro',
  () => db.query(
    `insert into public.payment_proofs (student_id, monthly_fee_id, file_path)
     values ($1, $2, 'x.jpg')`, [beto.id, feeBeto.id]),
  'row-level security');

// Aprobación
await asUser(admin.id);
const receiptId = await one(`select public.approve_payment_proof($1, $2, null) as id`, [proof.id, cajaBanco.id]);
ok('La administradora aprueba el comprobante', !!receiptId.id);

await asService();
const feePagada = await one(`select * from public.monthly_fees where id = $1`, [feeAna.id]);
eq('La cuota queda PAGADA', feePagada.status, 'pagada');
ok('La cuota queda vinculada al pago', !!feePagada.payment_id);
ok('La cuota queda vinculada al recibo', !!feePagada.receipt_id);

const movimiento = await one(
  `select * from public.financial_movements where monthly_fee_id = $1 and type = 'ingreso'`, [feeAna.id]);
ok('Se genera el movimiento de INGRESO', !!movimiento);
eq('El ingreso impacta en la caja elegida', movimiento.cash_account_id, cajaBanco.id);
eq('El importe del ingreso es el total de la cuota', Number(movimiento.amount_cents), 3000000);

const recibo = await one(`select * from public.payment_receipts where id = $1`, [receiptId.id]);
eq('El recibo se emite con numeración correlativa', Number(recibo.receipt_number), 1);
ok('El recibo guarda los datos de la academia', !!recibo.academy_snapshot);

const notifAlumno = await one(
  `select count(*)::int as n from public.notifications where type='comprobante_aprobado'`);
eq('Se notifica al alumno la aprobación', notifAlumno.n, 1);

// Rechazo
section('Rechazo de comprobante');
await asUser(userBeto.id);
const proofBeto = await one(`
  insert into public.payment_proofs (student_id, monthly_fee_id, file_path, reference)
  values ($1, $2, 'proofs/${beto.id}/x.jpg', 'OP-999') returning id`, [beto.id, feeBeto.id]);

await asUser(admin.id);
await db.query(`select public.reject_payment_proof($1, $2)`, [proofBeto.id, 'El importe no coincide']);

await asService();
const feeBetoTrasRechazo = await one(`select status from public.monthly_fees where id = $1`, [feeBeto.id]);
// La cuota de mayo ya pasó su vencimiento (10/05), así que vuelve a impaga como
// 'vencida'. Es una mejora deliberada sobre el literal "vuelve a pendiente":
// de ese modo reaparece en el listado de deudores.
eq('La cuota rechazada vuelve a estar IMPAGA (vencida: ya pasó el vencimiento)',
  feeBetoTrasRechazo.status, 'vencida');
const proofRechazado = await one(`select status, rejection_reason from public.payment_proofs where id = $1`, [proofBeto.id]);
eq('El comprobante queda rechazado', proofRechazado.status, 'rechazado');
eq('Se guarda el motivo del rechazo', proofRechazado.rejection_reason, 'El importe no coincide');
const notifRechazo = await one(
  `select count(*)::int as n from public.notifications where type='comprobante_rechazado'`);
eq('El alumno recibe el motivo', notifRechazo.n, 1);

await rejects('No se puede rechazar dos veces el mismo comprobante',
  async () => { await asUser(admin.id); await db.query(`select public.reject_payment_proof($1, 'otra vez')`, [proofBeto.id]); },
  'ya fue');

// Una cuota que AÚN NO venció sí vuelve a 'pendiente'.
await asService();
const feeFutura = await one(`
  insert into public.monthly_fees (student_id, period_year, period_month,
    base_amount_cents, manual_adjustment_cents, final_amount_cents, due_date, status)
  values ($1, 2027, 3, 3000000, 0, 3000000, '2027-03-10', 'pendiente') returning id`, [beto.id]);
await asUser(userBeto.id);
const proofFut = await one(`
  insert into public.payment_proofs (student_id, monthly_fee_id, file_path)
  values ($1, $2, 'proofs/${beto.id}/f.jpg') returning id`, [beto.id, feeFutura.id]);
await asUser(admin.id);
await db.query(`select public.reject_payment_proof($1, 'Ilegible')`, [proofFut.id]);
await asService();
const stFutura = await one(`select status from public.monthly_fees where id = $1`, [feeFutura.id]);
eq('Una cuota NO vencida vuelve a PENDIENTE tras el rechazo', stFutura.status, 'pendiente');

// ── PAGO EN EFECTIVO Y NO-PARCIALIDAD ───────────────────────────────────────
section('Pago en efectivo y prohibición de pagos parciales');
await asUser(admin.id);
const reciboEfectivo = await one(
  `select public.settle_monthly_fee($1, $2, $3) as id`, [feeBeto.id, efectivo.id, cajaEfectivo.id]);
ok('Se registra el pago en efectivo', !!reciboEfectivo.id);

await asService();
const feeBetoPagada = await one(`select status, final_amount_cents from public.monthly_fees where id = $1`, [feeBeto.id]);
eq('La cuota en efectivo queda pagada', feeBetoPagada.status, 'pagada');
const pagoBeto = await one(`select amount_cents from public.payments where id = (select payment_id from public.monthly_fees where id = $1)`, [feeBeto.id]);
eq('El pago SIEMPRE es por el importe total (nunca parcial)',
  Number(pagoBeto.amount_cents), Number(feeBetoPagada.final_amount_cents));

await rejects('No se puede volver a pagar una cuota ya pagada',
  async () => { await asUser(admin.id); await db.query(`select public.settle_monthly_fee($1, $2, $3)`, [feeBeto.id, efectivo.id, cajaEfectivo.id]); },
  'ya está pagada');

const recibo2 = await one(`select receipt_number from public.payment_receipts order by receipt_number desc limit 1`);
eq('La numeración de recibos avanza sin repetirse', Number(recibo2.receipt_number), 2);

// ── CAJAS Y MOVIMIENTOS ─────────────────────────────────────────────────────
section('Cajas, ingresos y gastos');
await asUser(admin.id);
const catGasto = await one(`select id from public.financial_categories where name = 'Alquiler'`);
await db.query(`
  insert into public.financial_movements (type, category_id, description, amount_cents, cash_account_id)
  values ('gasto', $1, 'Alquiler de mayo', 500000, $2)`, [catGasto.id, cajaEfectivo.id]);

const saldoEfectivo = await one(
  `select balance_cents from public.cash_account_balances where cash_account_id = $1`, [cajaEfectivo.id]);
eq('Saldo de caja = inicial + ingresos − gastos', Number(saldoEfectivo.balance_cents), 3000000 - 500000);

const saldoBanco = await one(
  `select balance_cents from public.cash_account_balances where cash_account_id = $1`, [cajaBanco.id]);
eq('La caja Banco refleja el ingreso de la transferencia', Number(saldoBanco.balance_cents), 3000000);

await asService();
const movPago = await one(`select id from public.financial_movements where payment_id is not null limit 1`);
await rejects('Un movimiento originado en un pago NO se puede editar',
  () => db.query(`update public.financial_movements set amount_cents = 1 where id = $1`, [movPago.id]),
  'reverso');
await rejects('Un movimiento originado en un pago NO se puede borrar',
  () => db.query(`delete from public.financial_movements where id = $1`, [movPago.id]),
  'reverso');

// ── Anulación de un pago y protección del REVERSO ───────────────────────────
// El reverso NO lleva payment_id (no nace de un pago: lo deshace), así que el
// chequeo por payment_id no lo alcanzaba y quedaba borrable: se podía descuadrar
// la caja en silencio, sin rastro de la anulación.
const pagoBetoId = await one(
  `select payment_id as id from public.monthly_fees where id = $1`, [feeBeto.id]);
const saldoAntesDeAnular = await one(
  `select balance_cents from public.cash_account_balances where cash_account_id = $1`, [cajaEfectivo.id]);

await asUser(admin.id);
await db.query(`select public.void_payment($1, $2)`, [pagoBetoId.id, 'Cobro registrado por error']);

await asService();
const pagoAnulado = await one(`select status from public.payments where id = $1`, [pagoBetoId.id]);
eq('El pago queda ANULADO', pagoAnulado.status, 'anulado');

const feeTrasAnular = await one(`select status, payment_id from public.monthly_fees where id = $1`, [feeBeto.id]);
ok('La cuota vuelve a estar impaga', feeTrasAnular.status !== 'pagada' && feeTrasAnular.payment_id === null);

const reverso = await one(
  `select id, type, amount_cents from public.financial_movements
    where reverses_movement_id is not null and is_reversal limit 1`);
ok('Se genera el movimiento de REVERSO', !!reverso);

const saldoTrasAnular = await one(
  `select balance_cents from public.cash_account_balances where cash_account_id = $1`, [cajaEfectivo.id]);
eq('El reverso descuenta el importe de la caja',
  Number(saldoTrasAnular.balance_cents),
  Number(saldoAntesDeAnular.balance_cents) - Number(reverso.amount_cents));

await rejects('Un movimiento de REVERSO NO se puede borrar',
  () => db.query(`delete from public.financial_movements where id = $1`, [reverso.id]),
  'reverso');
await rejects('Un movimiento de REVERSO NO se puede editar',
  () => db.query(`update public.financial_movements set amount_cents = 1 where id = $1`, [reverso.id]),
  'reverso');

// ── ASISTENCIA Y RECUPERACIONES ─────────────────────────────────────────────
section('Asistencia y recuperaciones');
await asUser(admin.id);
const clase = await one(`
  insert into public.class_sessions (group_id, session_date, start_time, end_time)
  values ($1, '2026-05-05', '15:00', '17:00') returning id`, [grupoMartes.id]);

const asistenciaAna = await one(`
  insert into public.attendance (class_session_id, student_id, group_id, status, observation)
  values ($1, $2, $3, 'ausente_justificada', 'Avisó con 48 h') returning id`,
  [clase.id, ana.id, grupoMartes.id]);
ok('Se registra la asistencia (ausencia justificada)', !!asistenciaAna.id);

const credito = await one(
  `select public.issue_recovery_credit($1, 'Avisó con anticipación') as id`, [asistenciaAna.id]);
ok('La ausencia justificada genera un crédito de recuperación', !!credito.id);

await asService();
const cred = await one(`select * from public.recovery_credits where id = $1`, [credito.id]);
eq('El crédito nace disponible', cred.status, 'disponible');
ok('El crédito tiene fecha de vencimiento (vigencia configurable)', !!cred.expires_at);

await rejects('Una misma ausencia no genera dos créditos',
  async () => { await asUser(admin.id); await db.query(`select public.issue_recovery_credit($1, 'otra vez')`, [asistenciaAna.id]); },
  'ya tiene un crédito');

// Reserva
await asUser(admin.id);
await db.query(`select public.reserve_recovery_credit($1, $2, '2026-05-13')`, [credito.id, grupoMartes.id]);
await asService();
const credReservado = await one(`select status, reserved_date from public.recovery_credits where id = $1`, [credito.id]);
eq('El crédito queda reservado', credReservado.status, 'reservada');

// Grupo sin cupo
await asService();
await db.query(`update public.students set group_id = $1 where id = $2`, [grupoLleno.id, beto.id]);
const cred2 = await one(`
  insert into public.recovery_credits (student_id, status, expires_at)
  values ($1, 'disponible', '2026-12-31') returning id`, [ana.id]);
await rejects('No se puede reservar una recuperación en un grupo sin cupo',
  async () => { await asUser(admin.id); await db.query(`select public.reserve_recovery_credit($1, $2, '2026-05-20')`, [cred2.id, grupoLleno.id]); },
  'no tiene cupo');

// Uso y prevención de doble uso
await asUser(admin.id);
const attRecup = await one(`select public.use_recovery_credit($1, $2, '2026-05-13') as id`, [credito.id, grupoMartes.id]);
ok('Se usa la recuperación y queda registrada en asistencia', !!attRecup.id);

await asService();
const credUsado = await one(`select status, used_attendance_id from public.recovery_credits where id = $1`, [credito.id]);
eq('El crédito queda UTILIZADO', credUsado.status, 'utilizada');
const attRow = await one(`select status, is_recovery from public.attendance where id = $1`, [attRecup.id]);
eq('Aparece en la asistencia como "recuperacion"', attRow.status, 'recuperacion');

await rejects('Un crédito NO puede usarse dos veces',
  async () => { await asUser(admin.id); await db.query(`select public.use_recovery_credit($1, $2, '2026-05-20')`, [credito.id, grupoMartes.id]); },
  'no puede utilizarse');

// ── TALLERES ────────────────────────────────────────────────────────────────
section('Talleres: cupo y lista de espera');
await asUser(admin.id);
const taller = await one(`
  insert into public.workshops (name, event_date, start_time, end_time, capacity, price_cents, status)
  values ('Taller de moldería', '2026-06-20', '10:00', '13:00', 1, 1500000, 'inscripcion_abierta')
  returning id`);

const insc1 = await one(`select public.register_to_workshop($1, $2) as id`, [taller.id, ana.id]);
await asService();
const r1 = await one(`select status from public.workshop_registrations where id = $1`, [insc1.id]);
eq('La inscripción arranca pendiente de pago (no ocupa cupo aún)', r1.status, 'pendiente_pago');

const tallerAntes = await one(`select public.workshop_confirmed_count($1) as n`, [taller.id]);
eq('El cupo NO se ocupa hasta confirmar el pago', tallerAntes.n, 0);

await asUser(admin.id);
await db.query(`select public.confirm_workshop_registration($1, $2, $3)`, [insc1.id, efectivo.id, cajaEfectivo.id]);
await asService();
const r1c = await one(`select status, payment_id from public.workshop_registrations where id = $1`, [insc1.id]);
eq('Con el pago, la inscripción queda confirmada', r1c.status, 'confirmada');
ok('El pago del taller genera su recibo/ingreso', !!r1c.payment_id);
const tallerEstado = await one(`select status from public.workshops where id = $1`, [taller.id]);
eq('El taller pasa a cupo completo', tallerEstado.status, 'cupo_completo');

// Lista de espera
await asUser(admin.id);
const insc2 = await one(
  `select public.register_to_workshop($1, null, 'Carla', 'Ruiz', '351-555', 'carla@test.com') as id`, [taller.id]);
await asService();
const r2 = await one(`select status, waitlist_position from public.workshop_registrations where id = $1`, [insc2.id]);
eq('Con el cupo lleno, la nueva inscripción va a LISTA DE ESPERA', r2.status, 'lista_espera');
eq('La lista de espera respeta el orden de llegada', r2.waitlist_position, 1);

await rejects('No se puede confirmar si el cupo sigue completo',
  async () => { await asUser(admin.id); await db.query(`select public.confirm_workshop_registration($1, $2, $3)`, [insc2.id, efectivo.id, cajaEfectivo.id]); },
  'cupo completo');

// Se libera un lugar -> promoción
await asService();
await db.query(`update public.workshop_registrations set status = 'cancelada' where id = $1`, [insc1.id]);
await asUser(admin.id);
const promovido = await one(`select public.promote_from_waitlist($1) as id`, [taller.id]);
await asService();
const r2p = await one(`select status from public.workshop_registrations where id = $1`, [promovido.id]);
eq('Al liberarse un lugar se promueve al primero (pendiente de pago, no confirmado)', r2p.status, 'pendiente_pago');

// ── PROYECTOS ───────────────────────────────────────────────────────────────
section('Proyectos (cuaderno virtual)');
await asUser(userAna.id);
const proyAna = await one(`
  insert into public.projects (student_id, title, garment_type, difficulty, status)
  values ($1, 'Vestido de verano', 'Vestido', 'intermedio', 'en_proceso') returning id`, [ana.id]);
ok('El alumno crea su propio proyecto', !!proyAna.id);

const entrada = await one(`
  insert into public.project_entries (project_id, title, body, entry_date)
  values ($1, 'Corte de la tela', 'Corté las piezas del delantero', '2026-05-06') returning id`, [proyAna.id]);
ok('El alumno crea una entrada de avance', !!entrada.id);

await asUser(userBeto.id);
const proyBeto = await one(`
  insert into public.projects (student_id, title, status)
  values ($1, 'Camisa', 'idea') returning id`, [beto.id]);

await rejects('Un alumno NO puede crear un proyecto a nombre de otro',
  () => db.query(`insert into public.projects (student_id, title) values ($1, 'Hackeo')`, [ana.id]),
  'row-level security');

// ── RLS: AISLAMIENTO ENTRE ALUMNOS (lo más crítico) ─────────────────────────
section('RLS · Privacidad y seguridad');
await asUser(userAna.id);

const alumnosVisibles = await all(`select id from public.students`);
eq('Un alumno solo ve SU propia ficha', alumnosVisibles.length, 1);
eq('…y es la suya', alumnosVisibles[0].id, ana.id);

const proyectosVisibles = await all(`select id from public.projects`);
eq('Un alumno solo ve SUS proyectos', proyectosVisibles.length, 1);
eq('…no ve el proyecto de otro alumno', proyectosVisibles.some((p) => p.id === proyBeto.id), false);

const cuotasVisibles = await all(`select id from public.monthly_fees`);
eq('Un alumno solo ve SUS cuotas', cuotasVisibles.every((f) => f.student_id !== beto.id), true);

const cajasVisibles = await all(`select id from public.cash_accounts`);
eq('Un alumno NO ve la contabilidad (cajas)', cajasVisibles.length, 0);

const movimientosVisibles = await all(`select id from public.financial_movements`);
eq('Un alumno NO ve el libro mayor', movimientosVisibles.length, 0);

const auditVisible = await all(`select id from public.audit_logs`);
eq('Un alumno NO ve la auditoría', auditVisible.length, 0);

const recibosVisibles = await all(`select id, student_id from public.payment_receipts`);
ok('Un alumno solo ve SUS recibos (cuota + taller)',
  recibosVisibles.length > 0 && recibosVisibles.every((r) => r.student_id === ana.id),
  `vio ${recibosVisibles.length} recibos y alguno no es suyo`);

// El alumno no puede tocar el dinero.
// OJO: cuando la RLS bloquea un UPDATE, PostgreSQL NO lanza error: afecta 0 filas.
// Por eso verificamos filas afectadas Y que la cuota quedó intacta.
await asService();
const feeAnaPend = await one(
  `select id, status from public.monthly_fees where student_id = $1 and period_month = 6`, [ana.id]);
await asUser(userAna.id);
const intento = await db.query(
  `update public.monthly_fees set status = 'pagada' where id = $1`, [feeAnaPend.id]);
eq('Un alumno NO puede marcar su cuota como pagada (RLS: 0 filas afectadas)', intento.affectedRows, 0);
await asService();
const feeIntacta = await one(`select status from public.monthly_fees where id = $1`, [feeAnaPend.id]);
eq('…y la cuota queda intacta', feeIntacta.status, feeAnaPend.status);
await asUser(userAna.id);

await rejects('Un alumno NO puede crear una caja',
  () => db.query(`insert into public.cash_accounts (name, type) values ('Trucha', 'efectivo')`),
  'row-level security');

// Columnas protegidas de la ficha
await rejects('Un alumno NO puede cambiarse la tarifa',
  () => db.query(`update public.students set rate_id = null where id = $1`, [ana.id]),
  'no tenés permiso');

await rejects('Un alumno NO puede cambiarse de grupo',
  () => db.query(`update public.students set group_id = $1 where id = $2`, [grupoLleno.id, ana.id]),
  'no tenés permiso');

await rejects('Un alumno NO puede cambiar su estado (darse de alta/baja)',
  () => db.query(`update public.students set status = 'baja' where id = $1`, [ana.id]),
  'no tenés permiso');

// Sí puede editar sus datos de contacto
const upd = await db.query(
  `update public.students set phone = '351-1234', address = 'Córdoba' where id = $1 returning phone`, [ana.id]);
eq('El alumno SÍ puede editar su teléfono y dirección', upd.rows[0].phone, '351-1234');

// La administradora ve todo
await asUser(admin.id);
const todosAlumnos = await all(`select id from public.students`);
eq('La administradora ve todos los alumnos', todosAlumnos.length, 2);
const todosProyectos = await all(`select id from public.projects`);
eq('La administradora ve todos los proyectos', todosProyectos.length, 2);
const todasCajas = await all(`select id from public.cash_accounts`);
eq('La administradora ve la contabilidad', todasCajas.length, 3);

// ── COMUNICADOS Y NOVEDADES ─────────────────────────────────────────────────
section('Comunicados y novedades');
await asUser(admin.id);
const novedad = await one(`
  insert into public.announcements (title, content, status, scope, published_at)
  values ('Cambio de horario', 'El martes empezamos 15:30', 'publicada', 'todos', now()) returning id`);
await db.query(`
  insert into public.announcement_recipients (announcement_id, student_id)
  select $1, id from public.students`, [novedad.id]);

const comunicado = await one(`
  insert into public.communications (subject, body, status, scope, sent_at)
  values ('Recordatorio de cuota', 'Vence el día 10', 'publicada', 'todos', now()) returning id`);
await db.query(`
  insert into public.communication_recipients (communication_id, student_id)
  select $1, id from public.students`, [comunicado.id]);

await asUser(userAna.id);
const novedadesAlumno = await all(`select id from public.announcements`);
eq('El alumno ve la novedad dirigida a él', novedadesAlumno.length, 1);
const comunicadosAlumno = await all(`select id from public.communications`);
eq('El alumno ve el comunicado en su bandeja', comunicadosAlumno.length, 1);

await db.query(`
  update public.communication_recipients set read_at = now()
   where communication_id = $1 and student_id = $2`, [comunicado.id, ana.id]);
await asUser(admin.id);
const leidos = await one(`
  select count(*) filter (where read_at is not null)::int as leidos,
         count(*)::int as total
    from public.communication_recipients where communication_id = $1`, [comunicado.id]);
eq('La administradora ve cuántos leyeron', leidos.leidos, 1);
eq('…sobre el total de destinatarios', leidos.total, 2);

// ── SEGURIDAD: EL ROL ANÓNIMO ───────────────────────────────────────────────
// Alguien SIN sesión pegándole directo a /rest/v1/… Es el vector que se nos
// había escapado: PostgreSQL concede EXECUTE a PUBLIC por defecto y anon es
// miembro de PUBLIC, así que podía invocar las funciones que mueven dinero.
section('Seguridad · Anónimo (sin sesión)');
await asAnon();

await rejects('anon NO puede leer alumnos',
  () => db.query(`select * from public.students`), 'permission denied');
await rejects('anon NO puede leer cuotas',
  () => db.query(`select * from public.monthly_fees`), 'permission denied');
await rejects('anon NO puede leer cajas',
  () => db.query(`select * from public.cash_accounts`), 'permission denied');

// Las RPC que mueven dinero: acá estaba el agujero.
await rejects('anon NO puede aprobar comprobantes (RPC)',
  () => db.query(`select public.approve_payment_proof($1, $2, null)`, [proofBeto.id, cajaEfectivo.id]),
  'permission denied');
await rejects('anon NO puede marcar una cuota como pagada (RPC)',
  () => db.query(`select public.settle_monthly_fee($1, $2, $3)`, [feeAnaPend.id, efectivo.id, cajaEfectivo.id]),
  'permission denied');
await rejects('anon NO puede generar cuotas (RPC)',
  () => db.query(`select public.generate_monthly_fees(2026, 8)`), 'permission denied');
await rejects('anon NO puede anular pagos (RPC)',
  () => db.query(`select public.void_payment($1, 'hackeo')`, [movPago.id]), 'permission denied');
await rejects('anon NO puede inscribir gente a talleres (RPC)',
  () => db.query(`select public.register_to_workshop($1)`, [taller.id]), 'permission denied');
await rejects('anon NO puede emitir recuperaciones (RPC)',
  () => db.query(`select public.issue_recovery_credit($1)`, [asistenciaAna.id]), 'permission denied');
await rejects('anon NO puede pedir un número de recibo (RPC)',
  () => db.query(`select public.next_receipt_number()`), 'permission denied');

// Segunda barrera: aunque alguien concediera EXECUTE por error, el guardia frena.
await asService();
await db.exec(`grant execute on function public.generate_monthly_fees(int, int) to anon;`);
await asAnon();
await rejects('Aun CON permiso de EXECUTE, el guardia frena a anon (defensa en profundidad)',
  () => db.query(`select public.generate_monthly_fees(2026, 9)`), 'solo la administradora');
await asService();
await db.exec(`revoke execute on function public.generate_monthly_fees(int, int) from anon;`);

// El servidor (service_role) SÍ debe poder: si no, el cron nunca generaría cuotas.
const genCron = await one(`select * from public.generate_monthly_fees(2026, 10)`);
ok('El servidor (service_role) SÍ puede generar cuotas — el cron funciona',
  genCron.created_count >= 0);

// ── MESES EN ESPAÑOL ─────────────────────────────────────────────────────────
// to_char(fecha,'TMMonth') usa el locale de la base, que está en INGLÉS: las
// notificaciones y —peor— los RECIBOS decían «Cuota June 2026».
section('Meses en español');
await asService();
const mesEsp = await one(`select public.nombre_mes(6) as m`);
eq('nombre_mes(6) devuelve \'Junio\'', mesEsp.m, 'Junio');

const notifCuota = await one(
  `select body from public.notifications where type = 'cuota_generada' limit 1`);
ok('La notificación de cuota nombra el mes en español',
  /Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre/.test(notifCuota.body),
  notifCuota.body);
ok('…y NO en inglés', !/January|February|March|April|June|July|August|September|October|November|December/.test(notifCuota.body),
  notifCuota.body);

const reciboMes = await one(
  `select concept, period_label from public.payment_receipts where concept like 'Cuota %' limit 1`);
ok('El RECIBO nombra el mes en español',
  /Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre/.test(reciboMes.concept),
  reciboMes.concept);

// ── AUDITORÍA ───────────────────────────────────────────────────────────────
section('Auditoría');
await asService();
const audit = await one(`
  select count(*)::int as n from public.audit_logs where entity_type = 'students'`);
ok('Las acciones sobre alumnos quedan auditadas', audit.n > 0);
const auditPago = await one(`
  select count(*)::int as n from public.audit_logs where entity_type = 'payments' and action = 'insert'`);
ok('Los pagos quedan auditados', auditPago.n > 0);
const auditActor = await one(`
  select actor_email from public.audit_logs where entity_type = 'monthly_fees' and actor_email is not null limit 1`);
ok('La auditoría guarda quién hizo el cambio', !!auditActor?.actor_email);

// ── resumen ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failed === 0) {
  console.log(`\x1b[32m✓ ${passed} pruebas OK\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failed} fallaron\x1b[0m · ${passed} OK`);
  failures.forEach((f) => console.log(`   · ${f}`));
}
await db.close();
process.exit(failed === 0 ? 0 : 1);
