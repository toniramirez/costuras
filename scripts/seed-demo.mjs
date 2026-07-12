/**
 * Carga datos de DEMOSTRACIÓN en la base.
 *
 *   npm run demo:seed     · carga
 *   npm run demo:clean    · borra todo lo cargado
 *
 * Todo lo que crea queda marcado con el prefijo «Demo · » (o correos
 * `@demo.local` en los alumnos), así se distingue de un vistazo y se puede
 * eliminar sin tocar datos reales.
 *
 * Usa la clave service_role: saltea la RLS, igual que el servidor. Las funciones
 * de negocio (cuotas, cobros, recuperaciones) se invocan por RPC, así que los
 * datos que quedan son COHERENTES: los pagos generan sus movimientos y recibos
 * de verdad, no filas inventadas.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const paso = (t) => console.log(`  ${verde('✓')} ${t}`);

const P = 'Demo · '; // prefijo identificatorio
const DOMINIO = '@demo.local';

/** Levanta el error de Supabase en vez de seguir con datos a medias. */
const q = async (promesa) => {
  const { data, error } = await promesa;
  if (error) {
    console.error(`\n✗ ${error.message}\n`);
    process.exit(1);
  }
  return data;
};

const hoy = new Date();
const anio = hoy.getFullYear();
const mes = hoy.getMonth() + 1;
const iso = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => iso(new Date(Date.now() - n * 86400000));

console.log('\n▸ Cargando datos de demostración\n');

// ── Modalidades y tarifas ───────────────────────────────────────────────────
const planes = await q(
  sb.from('plans').insert([
    { name: `${P}1 clase semanal`, description: 'Una clase de 2 horas por semana', classes_included: 1, frequency: 'semanal', price_cents: 3_000_000 },
    { name: `${P}2 clases semanales`, description: 'Dos clases de 2 horas por semana', classes_included: 2, frequency: 'semanal', price_cents: 5_200_000 },
  ]).select('id, name'),
);
paso(`${planes.length} modalidades`);

const tarifas = await q(
  sb.from('rates').insert([
    { name: `${P}Marzo a Junio`, plan_id: planes[0].id, valid_from: `${anio}-03-01`, valid_until: `${anio}-06-30`, amount_cents: 3_000_000 },
    { name: `${P}Julio a Diciembre`, plan_id: planes[0].id, valid_from: `${anio}-07-01`, valid_until: `${anio}-12-31`, amount_cents: 3_400_000 },
  ]).select('id, name'),
);
paso(`${tarifas.length} tarifas`);

// ── Grupos ──────────────────────────────────────────────────────────────────
const grupos = await q(
  sb.from('groups').insert([
    { name: `${P}Martes tarde`, weekday: 2, start_time: '15:00', end_time: '17:00', capacity: 8, plan_id: planes[0].id },
    { name: `${P}Miércoles noche`, weekday: 3, start_time: '18:00', end_time: '20:00', capacity: 6, plan_id: planes[0].id },
  ]).select('id, name'),
);
paso(`${grupos.length} grupos`);

// ── Alumnas ─────────────────────────────────────────────────────────────────
const PERSONAS = [
  { nombre: 'Lucía', apellido: 'Fernández', grupo: 0, estado: 'activo' },
  { nombre: 'Marina', apellido: 'Sosa', grupo: 0, estado: 'activo' },
  { nombre: 'Julieta', apellido: 'Ramos', grupo: 0, estado: 'activo' },
  { nombre: 'Carla', apellido: 'Ledesma', grupo: 1, estado: 'activo' },
  { nombre: 'Verónica', apellido: 'Quiroga', grupo: 1, estado: 'activo' },
  { nombre: 'Sofía', apellido: 'Ibarra', grupo: 1, estado: 'pausado' },
];

/**
 * "Lucía" → "lucia".
 * Sin esto el correo sale `lucía.fernández@demo.local` y Supabase Auth lo
 * rechaza: el local-part de un correo tiene que ser ASCII.
 */
const sinTildes = (t) =>
  t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const alumnas = [];
for (const [i, p] of PERSONAS.entries()) {
  const correo = `${sinTildes(p.nombre)}.${sinTildes(p.apellido)}${DOMINIO}`;

  const { data: usuario, error: errorUsuario } = await sb.auth.admin.createUser({
    email: correo,
    password: `Demo${1000 + i}!`,
    email_confirm: true,
    user_metadata: { full_name: `${p.nombre} ${p.apellido}`, must_change_password: false },
  });

  // Antes ignorábamos este error y la alumna quedaba sin usuario, con
  // profile_id NULL, sin que nadie se enterara.
  if (errorUsuario) {
    console.error(`\n✗ No pude crear el usuario de ${correo}: ${errorUsuario.message}\n`);
    process.exit(1);
  }

  const alumna = await q(
    sb.from('students').insert({
      profile_id: usuario?.user?.id ?? null,
      first_name: p.nombre,
      last_name: p.apellido,
      email: correo,
      phone: `351-5${String(100000 + i * 7919).slice(0, 6)}`,
      status: p.estado,
      start_date: `${anio}-03-01`,
      enrollment_date: `${anio}-03-01`,
      group_id: grupos[p.grupo].id,
      plan_id: planes[0].id,
      rate_id: tarifas[0].id,
      fixed_weekday: grupos[p.grupo].name.includes('Martes') ? 2 : 3,
      admin_notes: 'Alumna de demostración',
    }).select('id, first_name, last_name, profile_id').single(),
  );
  alumnas.push(alumna);
}
paso(`${alumnas.length} alumnas (5 activas, 1 pausada) con usuario`);

// ── Cuotas: se generan con la MISMA función que usa la app ──────────────────
const mesAnterior = mes === 1 ? 12 : mes - 1;
const anioAnterior = mes === 1 ? anio - 1 : anio;

const g1 = await q(sb.rpc('generate_monthly_fees', { p_year: anioAnterior, p_month: mesAnterior }));
const g2 = await q(sb.rpc('generate_monthly_fees', { p_year: anio, p_month: mes }));
paso(`Cuotas generadas: ${(g1?.[0]?.created_count ?? 0) + (g2?.[0]?.created_count ?? 0)}`);

// ── Cobros reales (crean pago + recibo + movimiento) ────────────────────────
const efectivo = await q(sb.from('payment_methods').select('id').eq('code', 'efectivo').single());
const transferencia = await q(sb.from('payment_methods').select('id').eq('code', 'transferencia').single());
const cajaEfectivo = await q(sb.from('cash_accounts').select('id').eq('type', 'efectivo').single());
const cajaBanco = await q(sb.from('cash_accounts').select('id').eq('type', 'banco').single());

const cuotasViejas = await q(
  sb.from('monthly_fees').select('id, student_id')
    .eq('period_year', anioAnterior).eq('period_month', mesAnterior).eq('status', 'pendiente'),
);

// 3 pagadas, el resto queda impaga (para que se vea el listado de deudores).
for (const [i, cuota] of cuotasViejas.slice(0, 3).entries()) {
  await q(
    sb.rpc('settle_monthly_fee', {
      p_fee_id: cuota.id,
      p_method_id: i % 2 === 0 ? efectivo.id : transferencia.id,
      p_cash_account_id: i % 2 === 0 ? cajaEfectivo.id : cajaBanco.id,
      p_paid_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      p_notes: 'Pago de demostración',
    }),
  );
}
paso(`3 cuotas cobradas (con su recibo y su movimiento de caja)`);

// Una alumna sube un comprobante que queda a la espera de revisión.
const pendiente = cuotasViejas[3];
if (pendiente) {
  await q(
    sb.from('payment_proofs').insert({
      student_id: pendiente.student_id,
      monthly_fee_id: pendiente.id,
      // Ruta RELATIVA al bucket (sin el prefijo `proofs/`): es lo que espera
      // createSignedUrl y lo que valida la política de Storage, que mira la
      // primera carpeta de `name`.
      file_path: `${pendiente.student_id}/${pendiente.id}/comprobante-demo.jpg`,
      informed_amount_cents: 3_000_000,
      reference: 'OP-DEMO-4471',
      note: 'Transferencia realizada el viernes',
    }),
  );
  paso('1 comprobante esperando revisión (notifica a la admin)');
}

// ── Asistencia y una recuperación ───────────────────────────────────────────
const clase = await q(
  sb.from('class_sessions').insert({
    group_id: grupos[0].id,
    session_date: haceDias(7),
    start_time: '15:00',
    end_time: '17:00',
    status: 'realizada',
  }).select('id').single(),
);

const delGrupo1 = alumnas.filter((_, i) => PERSONAS[i].grupo === 0);
await q(
  sb.from('attendance').insert(
    delGrupo1.map((a, i) => ({
      class_session_id: clase.id,
      student_id: a.id,
      group_id: grupos[0].id,
      status: i === 2 ? 'ausente_justificada' : 'presente',
      observation: i === 2 ? 'Avisó con 48 horas de anticipación' : null,
    })),
  ),
);
paso(`${delGrupo1.length} asistencias (una ausencia justificada)`);

const ausencia = await q(
  sb.from('attendance').select('id').eq('class_session_id', clase.id).eq('status', 'ausente_justificada').single(),
);
await q(sb.rpc('issue_recovery_credit', { p_attendance_id: ausencia.id, p_reason: 'Avisó con anticipación' }));
paso('1 crédito de recuperación disponible');

// ── Proyectos ───────────────────────────────────────────────────────────────
const proyectos = await q(
  sb.from('projects').insert([
    { student_id: alumnas[0].id, title: 'Vestido de verano', garment_type: 'Vestido', fabric_type: 'Lino', difficulty: 'intermedio', status: 'en_proceso', start_date: haceDias(30), materials: 'Lino 2 m, cierre invisible, hilo al tono' },
    { student_id: alumnas[1].id, title: 'Camisa clásica', garment_type: 'Camisa', fabric_type: 'Popelina', difficulty: 'inicial', status: 'terminado', start_date: haceDias(60), end_date: haceDias(10), materials: 'Popelina 1,5 m, botones' },
    { student_id: alumnas[3].id, title: 'Pantalón sastrero', garment_type: 'Pantalón', fabric_type: 'Gabardina', difficulty: 'avanzado', status: 'idea' },
  ]).select('id, title'),
);

await q(
  sb.from('project_entries').insert([
    { project_id: proyectos[0].id, title: 'Corte de la tela', body: 'Corté las piezas del delantero y la espalda. Dejé 1,5 cm de margen de costura.', entry_date: haceDias(28) },
    { project_id: proyectos[0].id, title: 'Armado del cuerpo', body: 'Uní los hombros y los laterales. Probé el calce: hay que ajustar la cintura 2 cm.', entry_date: haceDias(14) },
  ]),
);
paso(`${proyectos.length} proyectos (uno terminado, con avances)`);

// ── Taller con lista de espera ──────────────────────────────────────────────
const taller = await q(
  sb.from('workshops').insert({
    name: `${P}Taller de moldería`,
    description: 'Aprendé a trazar tu propio molde base a partir de tus medidas.',
    category: 'Moldería',
    responsible_name: 'Ana Paula',
    event_date: iso(new Date(Date.now() + 21 * 86400000)),
    start_time: '10:00',
    end_time: '13:00',
    capacity: 2,
    price_cents: 1_500_000,
    materials_included: 'Papel de molde, reglas',
    materials_to_bring: 'Tijera, cinta métrica, lápiz',
    location: 'Sede central',
    status: 'inscripcion_abierta',
    cash_account_id: cajaEfectivo.id,
  }).select('id, name').single(),
);

const i1 = await q(sb.rpc('register_to_workshop', { p_workshop_id: taller.id, p_student_id: alumnas[0].id }));
const i2 = await q(sb.rpc('register_to_workshop', { p_workshop_id: taller.id, p_student_id: alumnas[1].id }));
await q(sb.rpc('confirm_workshop_registration', { p_registration_id: i1, p_method_id: efectivo.id, p_cash_account_id: cajaEfectivo.id }));
await q(sb.rpc('confirm_workshop_registration', { p_registration_id: i2, p_method_id: efectivo.id, p_cash_account_id: cajaEfectivo.id }));

// Cupo lleno: esta persona externa cae en lista de espera automáticamente.
await q(
  sb.rpc('register_to_workshop', {
    p_workshop_id: taller.id,
    p_first_name: 'Paula',
    p_last_name: 'Giménez',
    p_phone: '351-5551234',
    p_email: `paula.gimenez${DOMINIO}`,
    p_notes: 'Consultó por Instagram',
  }),
);
paso('1 taller: cupo completo (2 pagados) + 1 en lista de espera');

// ── Novedad (con FLYER) y comunicado ────────────────────────────────────────
const novedad = await q(
  sb.from('announcements').insert({
    title: `${P}Taller de moldería · Sábado 20`,
    content:
      'Abrimos las inscripciones para el taller de moldería. Aprendé a trazar tu molde base a partir de tus propias medidas. Cupos limitados.',
    status: 'publicada',
    scope: 'todos',
    priority: 'alta',
    is_pinned: true,
    published_at: new Date().toISOString(),
  }).select('id').single(),
);

// La academia publica flyers, no párrafos. Generamos uno para que el inicio de
// la alumna se vea como se va a ver de verdad.
const flyer = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#faf8f6"/>
  <circle cx="540" cy="1180" r="420" fill="#8c6a5d" opacity="0.06"/>
  <text x="540" y="300" text-anchor="middle" font-family="Georgia,serif" font-size="42" fill="#8c6a5d" letter-spacing="14">COSTURA AP</text>
  <line x1="380" y1="350" x2="700" y2="350" stroke="#c9a227" stroke-width="2"/>
  <text x="540" y="520" text-anchor="middle" font-family="Georgia,serif" font-size="96" fill="#2b2522">Taller de</text>
  <text x="540" y="630" text-anchor="middle" font-family="Georgia,serif" font-size="96" fill="#2b2522">moldería</text>
  <text x="540" y="760" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="34" fill="#7a716b">Trazá tu molde base a partir</text>
  <text x="540" y="810" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="34" fill="#7a716b">de tus propias medidas</text>
  <rect x="330" y="900" width="420" height="96" rx="48" fill="#8c6a5d"/>
  <text x="540" y="962" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="38" font-weight="bold" fill="#faf8f6">SÁBADO 20 · 10 h</text>
  <text x="540" y="1090" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="#7a716b">Cupos limitados · Sede central</text>
</svg>`;

const { default: sharp } = await import('sharp');
const flyerPng = await sharp(Buffer.from(flyer)).png().toBuffer();
const rutaFlyer = `${novedad.id}/flyer.png`;

const { error: errorFlyer } = await sb.storage
  .from('announcements')
  .upload(rutaFlyer, flyerPng, { contentType: 'image/png', upsert: true });

if (!errorFlyer) {
  await q(sb.from('announcements').update({ image_path: rutaFlyer }).eq('id', novedad.id).select('id').single());
  paso('1 flyer subido al bucket de novedades');
}
await q(
  sb.from('announcement_recipients').insert(
    alumnas.map((a) => ({ announcement_id: novedad.id, student_id: a.id })),
  ),
);

const comunicado = await q(
  sb.from('communications').insert({
    subject: `${P}Recordatorio de vencimiento`,
    body: 'Les recordamos que la cuota vence el día 10 de cada mes. Pueden abonar en efectivo o por transferencia.',
    status: 'publicada',
    scope: 'todos',
    priority: 'normal',
    sent_at: new Date().toISOString(),
  }).select('id').single(),
);
await q(
  sb.from('communication_recipients').insert(
    alumnas.map((a, i) => ({
      communication_id: comunicado.id,
      student_id: a.id,
      read_at: i < 2 ? new Date().toISOString() : null, // dos ya lo leyeron
    })),
  ),
);
paso('1 novedad fijada + 1 comunicado (2 de 6 leídos)');

// ── Gastos ──────────────────────────────────────────────────────────────────
const catAlquiler = await q(sb.from('financial_categories').select('id').eq('name', 'Alquiler').single());
const catMateriales = await q(sb.from('financial_categories').select('id').eq('name', 'Materiales').single());

await q(
  sb.from('financial_movements').insert([
    { type: 'gasto', category_id: catAlquiler.id, description: `${P}Alquiler del salón`, amount_cents: 25_000_000, cash_account_id: cajaEfectivo.id, movement_date: haceDias(15) },
    { type: 'gasto', category_id: catMateriales.id, description: `${P}Compra de telas e hilos`, amount_cents: 4_800_000, cash_account_id: cajaEfectivo.id, movement_date: haceDias(9) },
  ]),
);
paso('2 gastos');

console.log(`\n${verde('✓ Datos de demostración cargados.')}`);
console.log(`  Todo lo creado lleva el prefijo «${P}» o el correo «${DOMINIO}».`);
console.log(`  Para borrarlo:  ${verde('npm run demo:clean')}\n`);
console.log(`  Podés entrar como alumna con:  lucia.fernandez${DOMINIO}  /  Demo1000!\n`);
