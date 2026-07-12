import type { NextRequest } from 'next/server';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  finDelDia,
  generarCsv,
  inicioDelDia,
  montoCsv,
  respuestaCsv,
  siNo,
  TOPE_EXPORTACION,
  type ColumnaCsv,
} from '@/lib/export';
import { formatDate, formatDateTime, formatPeriod, formatTime, formatWeekday } from '@/lib/format';
import {
  ESTADO_ALUMNO,
  ESTADO_ASISTENCIA,
  ESTADO_CUOTA,
  ESTADO_INSCRIPCION,
} from '@/lib/labels';
import { mapError } from '@/lib/errors';
import type { Enums } from '@/lib/supabase/database.types';

/**
 * GET /api/exportar/<recurso>?<mismos filtros que el listado>
 *
 * Descarga en CSV lo que la administradora está viendo en pantalla. Por eso
 * respeta los MISMOS parámetros de la URL que usan los listados: se exporta lo
 * filtrado, no "todo" (que es lo que nadie quiere).
 *
 * Solo administradora. Se lee con el cliente con sesión, así que además la RLS
 * vuelve a filtrar del lado de la base.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Estados de cuota que significan «debe». */
const IMPAGAS = ['pendiente', 'comprobante_pendiente', 'vencida'] as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Params = URLSearchParams;

/* ── Estados válidos ─────────────────────────────────────────────────────────
   Los mapas de etiquetas ya tienen exactamente las claves del enum de la base,
   así que salen de ahí: si mañana se agrega un estado, aparece solo.

   Un `?estado=cualquier-cosa` en la URL se descarta en vez de mandarse a la
   base. Es lo que hace que el filtro esté además TIPADO: las columnas son enums,
   no texto libre.                                                             */

const ESTADOS_ALUMNO = Object.keys(ESTADO_ALUMNO) as Enums<'student_status'>[];
const ESTADOS_CUOTA = Object.keys(ESTADO_CUOTA) as Enums<'fee_status'>[];
const ESTADOS_ASISTENCIA = Object.keys(ESTADO_ASISTENCIA) as Enums<'attendance_status'>[];
const ESTADOS_INSCRIPCION = Object.keys(ESTADO_INSCRIPCION) as Enums<'workshop_reg_status'>[];
const ESTADOS_PAGO: Enums<'payment_status'>[] = [
  'pendiente',
  'confirmado',
  'anulado',
  'rechazado',
];

function estadoValido<T extends string>(validos: readonly T[], valor: string | null): T | null {
  return valor && (validos as readonly string[]).includes(valor) ? (valor as T) : null;
}

/** Nombre completo a partir de un embebido que puede venir nulo. */
const nombreDe = (p: { first_name: string; last_name: string } | null): string =>
  p ? `${p.last_name}, ${p.first_name}` : '—';

/**
 * Limpia el texto de búsqueda antes de meterlo en un filtro `or` de PostgREST.
 * Las comas y los paréntesis son separadores de su sintaxis: sin esto, un alumno
 * llamado "Pérez, Ana" rompería la consulta.
 */
const limpiar = (q: string): string => q.replace(/[,()*%"\\]/g, ' ').trim();

/**
 * Ids de los alumnos cuyo nombre, apellido o DNI coincide con la búsqueda.
 *
 * Buscar por el nombre del alumno en tablas que solo tienen `student_id` obliga
 * a resolverlo primero. Es una consulta más, pero deja el resto tipado y sin
 * filtros sobre tablas embebidas (que son fáciles de escribir mal).
 */
async function idsDeAlumnos(supabase: Supabase, q: string): Promise<string[]> {
  const texto = limpiar(q);
  if (!texto) return [];

  const { data } = await supabase
    .from('students')
    .select('id')
    .or(
      `first_name.ilike.*${texto}*,last_name.ilike.*${texto}*,dni.ilike.*${texto}*,email.ilike.*${texto}*`,
    )
    .limit(TOPE_EXPORTACION);

  return (data ?? []).map((f) => f.id);
}

// ── Alumnos ─────────────────────────────────────────────────────────────────

async function exportarAlumnos(supabase: Supabase, p: Params) {
  let query = supabase
    .from('students')
    .select(
      'first_name, last_name, dni, email, phone, birth_date, address, emergency_contact, emergency_phone, status, enrollment_date, start_date, fixed_weekday, fixed_time, registration_fee_exempt, groups(name), plans(name), rates(name)',
    )
    .order('last_name')
    .order('first_name')
    .limit(TOPE_EXPORTACION);

  const q = p.get('q');
  if (q) {
    const texto = limpiar(q);
    if (texto) {
      query = query.or(
        `first_name.ilike.*${texto}*,last_name.ilike.*${texto}*,dni.ilike.*${texto}*,email.ilike.*${texto}*`,
      );
    }
  }

  const estado = estadoValido(ESTADOS_ALUMNO, p.get('estado'));
  if (estado) query = query.eq('status', estado);

  const grupo = p.get('grupo');
  if (grupo) query = query.eq('group_id', grupo);

  const plan = p.get('plan');
  if (plan) query = query.eq('plan_id', plan);

  // Los archivados quedan fuera salvo que se pidan expresamente.
  if (p.get('archivados') !== 'si') query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;

  type Fila = NonNullable<typeof data>[number];

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Apellido', value: (a) => a.last_name },
    { header: 'Nombre', value: (a) => a.first_name },
    { header: 'DNI', value: (a) => a.dni },
    { header: 'Correo', value: (a) => a.email },
    { header: 'Teléfono', value: (a) => a.phone },
    { header: 'Fecha de nacimiento', value: (a) => formatDate(a.birth_date) },
    { header: 'Dirección', value: (a) => a.address },
    { header: 'Contacto de emergencia', value: (a) => a.emergency_contact },
    { header: 'Teléfono de emergencia', value: (a) => a.emergency_phone },
    { header: 'Estado', value: (a) => ESTADO_ALUMNO[a.status].label },
    { header: 'Grupo', value: (a) => a.groups?.name ?? '—' },
    { header: 'Modalidad', value: (a) => a.plans?.name ?? '—' },
    { header: 'Tarifa', value: (a) => a.rates?.name ?? 'Precio de la modalidad' },
    {
      header: 'Horario fijo',
      value: (a) =>
        a.fixed_weekday === null ? '—' : `${formatWeekday(a.fixed_weekday)} ${formatTime(a.fixed_time)}`,
    },
    { header: 'Inscripción', value: (a) => formatDate(a.enrollment_date) },
    { header: 'Inicio', value: (a) => formatDate(a.start_date) },
    { header: 'Exenta de matrícula', value: (a) => siNo(a.registration_fee_exempt) },
  ];

  return { nombre: 'alumnos', csv: generarCsv(data ?? [], columnas) };
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

async function exportarCuotas(supabase: Supabase, p: Params) {
  let query = supabase
    .from('monthly_fees')
    .select(
      'period_year, period_month, base_amount_cents, manual_adjustment_cents, final_amount_cents, issued_date, due_date, status, paid_date, receipt_number, notes, students(first_name, last_name, dni)',
    )
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(TOPE_EXPORTACION);

  const anio = Number(p.get('anio'));
  if (anio) query = query.eq('period_year', anio);

  const mes = Number(p.get('mes'));
  if (mes) query = query.eq('period_month', mes);

  // «impagas» agrupa los tres estados que significan que la cuota se debe.
  const crudo = p.get('estado');
  if (crudo === 'impagas') {
    query = query.in('status', [...IMPAGAS]);
  } else {
    const estado = estadoValido(ESTADOS_CUOTA, crudo);
    if (estado) query = query.eq('status', estado);
  }

  const alumno = p.get('alumno');
  if (alumno) query = query.eq('student_id', alumno);

  const q = p.get('q');
  if (q) query = query.in('student_id', await idsDeAlumnos(supabase, q));

  const { data, error } = await query;
  if (error) throw error;

  type Fila = NonNullable<typeof data>[number];

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Alumno', value: (c) => nombreDe(c.students) },
    { header: 'DNI', value: (c) => c.students?.dni },
    { header: 'Período', value: (c) => formatPeriod(c.period_year, c.period_month) },
    { header: 'Importe base', value: (c) => montoCsv(c.base_amount_cents) },
    { header: 'Ajuste', value: (c) => montoCsv(c.manual_adjustment_cents) },
    { header: 'Importe final', value: (c) => montoCsv(c.final_amount_cents) },
    { header: 'Emitida', value: (c) => formatDate(c.issued_date) },
    { header: 'Vence', value: (c) => formatDate(c.due_date) },
    { header: 'Estado', value: (c) => ESTADO_CUOTA[c.status].label },
    { header: 'Pagada el', value: (c) => formatDate(c.paid_date) },
    { header: 'Recibo', value: (c) => c.receipt_number },
    { header: 'Notas', value: (c) => c.notes },
  ];

  return { nombre: 'cuotas', csv: generarCsv(data ?? [], columnas) };
}

// ── Pagos ───────────────────────────────────────────────────────────────────

async function exportarPagos(supabase: Supabase, p: Params) {
  let query = supabase
    .from('payments')
    .select(
      'paid_at, amount_cents, status, external_reference, mp_payment_id, mp_status, mp_fee_cents, net_amount_cents, notes, students(first_name, last_name), payment_methods(name), cash_accounts(name)',
    )
    .order('paid_at', { ascending: false })
    .limit(TOPE_EXPORTACION);

  const desde = p.get('desde');
  if (desde) query = query.gte('paid_at', inicioDelDia(desde));

  const hasta = p.get('hasta');
  if (hasta) query = query.lte('paid_at', finDelDia(hasta));

  const estado = estadoValido(ESTADOS_PAGO, p.get('estado'));
  if (estado) query = query.eq('status', estado);

  const metodo = p.get('metodo');
  if (metodo) query = query.eq('method_id', metodo);

  const caja = p.get('caja');
  if (caja) query = query.eq('cash_account_id', caja);

  const alumno = p.get('alumno');
  if (alumno) query = query.eq('student_id', alumno);

  const q = p.get('q');
  if (q) query = query.in('student_id', await idsDeAlumnos(supabase, q));

  const { data, error } = await query;
  if (error) throw error;

  type Fila = NonNullable<typeof data>[number];

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Fecha', value: (r) => formatDateTime(r.paid_at) },
    { header: 'Alumno', value: (r) => nombreDe(r.students) },
    { header: 'Importe', value: (r) => montoCsv(r.amount_cents) },
    { header: 'Medio de pago', value: (r) => r.payment_methods?.name ?? '—' },
    { header: 'Caja', value: (r) => r.cash_accounts?.name ?? '—' },
    { header: 'Estado', value: (r) => r.status },
    { header: 'Referencia', value: (r) => r.external_reference },
    { header: 'ID Mercado Pago', value: (r) => r.mp_payment_id },
    { header: 'Estado Mercado Pago', value: (r) => r.mp_status },
    { header: 'Comisión', value: (r) => (r.mp_fee_cents === null ? '' : montoCsv(r.mp_fee_cents)) },
    {
      header: 'Neto acreditado',
      value: (r) => (r.net_amount_cents === null ? '' : montoCsv(r.net_amount_cents)),
    },
    { header: 'Notas', value: (r) => r.notes },
  ];

  return { nombre: 'pagos', csv: generarCsv(data ?? [], columnas) };
}

// ── Deudores ────────────────────────────────────────────────────────────────

type Deudor = {
  alumno: string;
  dni: string | null;
  telefono: string | null;
  correo: string | null;
  estado: string;
  cuotas: number;
  matriculas: number;
  deudaCents: number;
  masAntigua: string;
};

/**
 * Quién debe y cuánto. Suma cuotas Y matrículas impagas: las dos son deuda.
 * Se arma en memoria porque necesitamos una fila por alumno, no por cuota.
 */
async function exportarDeudores(supabase: Supabase, p: Params) {
  const q = p.get('q');
  const ids = q ? await idsDeAlumnos(supabase, q) : null;

  let cuotas = supabase
    .from('monthly_fees')
    .select(
      'student_id, period_year, period_month, final_amount_cents, due_date, status, students(first_name, last_name, dni, phone, email, status)',
    )
    .in('status', [...IMPAGAS])
    .limit(TOPE_EXPORTACION);

  let matriculas = supabase
    .from('registration_fees')
    .select(
      'student_id, amount_cents, due_date, status, students(first_name, last_name, dni, phone, email, status)',
    )
    .in('status', [...IMPAGAS])
    .limit(TOPE_EXPORTACION);

  if (ids) {
    cuotas = cuotas.in('student_id', ids);
    matriculas = matriculas.in('student_id', ids);
  }

  const [resCuotas, resMatriculas] = await Promise.all([cuotas, matriculas]);
  if (resCuotas.error) throw resCuotas.error;
  if (resMatriculas.error) throw resMatriculas.error;

  const porAlumno = new Map<string, Deudor>();

  const asegurar = (
    studentId: string,
    alumno: {
      first_name: string;
      last_name: string;
      dni: string | null;
      phone: string | null;
      email: string | null;
      status: keyof typeof ESTADO_ALUMNO;
    } | null,
  ): Deudor => {
    const actual = porAlumno.get(studentId);
    if (actual) return actual;

    const nuevo: Deudor = {
      alumno: nombreDe(alumno),
      dni: alumno?.dni ?? null,
      telefono: alumno?.phone ?? null,
      correo: alumno?.email ?? null,
      estado: alumno ? ESTADO_ALUMNO[alumno.status].label : '—',
      cuotas: 0,
      matriculas: 0,
      deudaCents: 0,
      masAntigua: '',
    };
    porAlumno.set(studentId, nuevo);
    return nuevo;
  };

  for (const c of resCuotas.data ?? []) {
    const d = asegurar(c.student_id, c.students);
    d.cuotas += 1;
    d.deudaCents += Number(c.final_amount_cents);

    // La cuota más vieja adeudada: es el dato que dice qué tan grave es.
    const periodo = `${c.period_year}-${String(c.period_month).padStart(2, '0')}`;
    if (!d.masAntigua || periodo < d.masAntigua) d.masAntigua = periodo;
  }

  for (const m of resMatriculas.data ?? []) {
    const d = asegurar(m.student_id, m.students);
    d.matriculas += 1;
    d.deudaCents += Number(m.amount_cents);
  }

  // Primero el que más debe.
  const filas = [...porAlumno.values()].sort((a, b) => b.deudaCents - a.deudaCents);

  const columnas: ReadonlyArray<ColumnaCsv<Deudor>> = [
    { header: 'Alumno', value: (d) => d.alumno },
    { header: 'DNI', value: (d) => d.dni },
    { header: 'Teléfono', value: (d) => d.telefono },
    { header: 'Correo', value: (d) => d.correo },
    { header: 'Estado del alumno', value: (d) => d.estado },
    { header: 'Cuotas adeudadas', value: (d) => d.cuotas },
    { header: 'Matrículas adeudadas', value: (d) => d.matriculas },
    { header: 'Deuda total', value: (d) => montoCsv(d.deudaCents) },
    {
      header: 'Cuota más antigua',
      value: (d) => {
        if (!d.masAntigua) return '—';
        const [anio, mes] = d.masAntigua.split('-').map(Number);
        return formatPeriod(anio, mes);
      },
    },
  ];

  return { nombre: 'deudores', csv: generarCsv(filas, columnas) };
}

// ── Asistencia ──────────────────────────────────────────────────────────────

async function exportarAsistencia(supabase: Supabase, p: Params) {
  let query = supabase
    .from('attendance')
    .select(
      'status, is_recovery, observation, recorded_at, students(first_name, last_name), groups(name), class_sessions!inner(session_date, start_time)',
    )
    .limit(TOPE_EXPORTACION);

  // El filtro por fecha es sobre la fecha de la CLASE, no sobre cuándo se cargó.
  const desde = p.get('desde');
  if (desde) query = query.gte('class_sessions.session_date', desde);

  const hasta = p.get('hasta');
  if (hasta) query = query.lte('class_sessions.session_date', hasta);

  const grupo = p.get('grupo');
  if (grupo) query = query.eq('group_id', grupo);

  const estado = estadoValido(ESTADOS_ASISTENCIA, p.get('estado'));
  if (estado) query = query.eq('status', estado);

  const alumno = p.get('alumno');
  if (alumno) query = query.eq('student_id', alumno);

  const q = p.get('q');
  if (q) query = query.in('student_id', await idsDeAlumnos(supabase, q));

  const { data, error } = await query;
  if (error) throw error;

  // PostgREST no ordena la tabla principal por una columna embebida, así que la
  // fecha de clase se ordena acá (el archivo es chico: está topeado).
  const filas = [...(data ?? [])].sort((a, b) =>
    b.class_sessions.session_date.localeCompare(a.class_sessions.session_date),
  );

  type Fila = (typeof filas)[number];

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Fecha de clase', value: (a) => formatDate(a.class_sessions.session_date) },
    { header: 'Hora', value: (a) => formatTime(a.class_sessions.start_time) },
    { header: 'Grupo', value: (a) => a.groups?.name ?? '—' },
    { header: 'Alumno', value: (a) => nombreDe(a.students) },
    { header: 'Asistencia', value: (a) => ESTADO_ASISTENCIA[a.status].label },
    { header: 'Es recuperación', value: (a) => siNo(a.is_recovery) },
    { header: 'Observación', value: (a) => a.observation },
    { header: 'Registrada el', value: (a) => formatDateTime(a.recorded_at) },
  ];

  return { nombre: 'asistencia', csv: generarCsv(filas, columnas) };
}

// ── Ingresos y gastos ───────────────────────────────────────────────────────

async function exportarMovimientos(supabase: Supabase, p: Params, tipo: 'ingreso' | 'gasto') {
  let query = supabase
    .from('financial_movements')
    .select(
      'movement_date, description, amount_cents, notes, is_reversal, financial_categories(name), cash_accounts(name), payment_methods(name), students(first_name, last_name)',
    )
    .eq('type', tipo)
    .order('movement_date', { ascending: false })
    .limit(TOPE_EXPORTACION);

  const desde = p.get('desde');
  if (desde) query = query.gte('movement_date', desde);

  const hasta = p.get('hasta');
  if (hasta) query = query.lte('movement_date', hasta);

  const categoria = p.get('categoria');
  if (categoria) query = query.eq('category_id', categoria);

  const caja = p.get('caja');
  if (caja) query = query.eq('cash_account_id', caja);

  const metodo = p.get('metodo');
  if (metodo) query = query.eq('payment_method_id', metodo);

  const q = p.get('q');
  if (q) query = query.in('student_id', await idsDeAlumnos(supabase, q));

  const { data, error } = await query;
  if (error) throw error;

  type Fila = NonNullable<typeof data>[number];

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Fecha', value: (m) => formatDate(m.movement_date) },
    { header: 'Categoría', value: (m) => m.financial_categories?.name ?? '—' },
    { header: 'Descripción', value: (m) => m.description },
    { header: 'Importe', value: (m) => montoCsv(m.amount_cents) },
    { header: 'Caja', value: (m) => m.cash_accounts?.name ?? '—' },
    { header: 'Medio de pago', value: (m) => m.payment_methods?.name ?? '—' },
    { header: 'Alumno', value: (m) => (m.students ? nombreDe(m.students) : '') },
    { header: 'Es reverso', value: (m) => siNo(m.is_reversal) },
    { header: 'Notas', value: (m) => m.notes },
  ];

  return {
    nombre: tipo === 'ingreso' ? 'ingresos' : 'gastos',
    csv: generarCsv(data ?? [], columnas),
  };
}

// ── Inscripciones a talleres ────────────────────────────────────────────────

async function exportarInscripciones(supabase: Supabase, p: Params) {
  let query = supabase
    .from('workshop_registrations')
    .select(
      'status, waitlist_position, amount_cents, registered_at, notes, external_first_name, external_last_name, external_email, external_phone, students(first_name, last_name, email, phone), workshops(name, event_date)',
    )
    .order('registered_at', { ascending: false })
    .limit(TOPE_EXPORTACION);

  const taller = p.get('taller');
  if (taller) query = query.eq('workshop_id', taller);

  const estado = estadoValido(ESTADOS_INSCRIPCION, p.get('estado'));
  if (estado) query = query.eq('status', estado);

  const desde = p.get('desde');
  if (desde) query = query.gte('registered_at', inicioDelDia(desde));

  const hasta = p.get('hasta');
  if (hasta) query = query.lte('registered_at', finDelDia(hasta));

  // Un taller admite alumnos de la casa y gente de afuera: la búsqueda tiene que
  // encontrar a los dos.
  const q = p.get('q');
  if (q) {
    const texto = limpiar(q);
    if (texto) {
      const ids = await idsDeAlumnos(supabase, q);
      const clausulas = [
        `external_first_name.ilike.*${texto}*`,
        `external_last_name.ilike.*${texto}*`,
        `external_email.ilike.*${texto}*`,
        ...(ids.length > 0 ? [`student_id.in.(${ids.join(',')})`] : []),
      ];
      query = query.or(clausulas.join(','));
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  type Fila = NonNullable<typeof data>[number];

  const participante = (i: Fila): string =>
    i.students
      ? nombreDe(i.students)
      : `${i.external_last_name ?? ''}, ${i.external_first_name ?? ''}`.replace(/^, |, $/, '') ||
        '—';

  const columnas: ReadonlyArray<ColumnaCsv<Fila>> = [
    { header: 'Taller', value: (i) => i.workshops?.name ?? '—' },
    { header: 'Fecha del taller', value: (i) => formatDate(i.workshops?.event_date) },
    { header: 'Participante', value: participante },
    { header: 'Es alumno de la academia', value: (i) => siNo(Boolean(i.students)) },
    { header: 'Correo', value: (i) => i.students?.email ?? i.external_email },
    { header: 'Teléfono', value: (i) => i.students?.phone ?? i.external_phone },
    { header: 'Estado', value: (i) => ESTADO_INSCRIPCION[i.status].label },
    { header: 'Posición en lista de espera', value: (i) => i.waitlist_position },
    { header: 'Importe', value: (i) => montoCsv(i.amount_cents) },
    { header: 'Inscripción', value: (i) => formatDateTime(i.registered_at) },
    { header: 'Notas', value: (i) => i.notes },
  ];

  return { nombre: 'inscripciones', csv: generarCsv(data ?? [], columnas) };
}

// ── Ruta ────────────────────────────────────────────────────────────────────

const RECURSOS = [
  'alumnos',
  'cuotas',
  'pagos',
  'deudores',
  'asistencia',
  'ingresos',
  'gastos',
  'inscripciones',
] as const;

type Recurso = (typeof RECURSOS)[number];

const esRecurso = (valor: string): valor is Recurso =>
  (RECURSOS as readonly string[]).includes(valor);

export async function GET(
  request: NextRequest,
  // `params` es una promesa (App Router). Se tipa a mano y no con el helper
  // global `RouteContext`, que solo existe DESPUÉS de compilar: así
  // `npm run typecheck` funciona también en un clon recién bajado.
  { params }: { params: Promise<{ recurso: string }> },
) {
  // Solo la administradora exporta. `assertAdmin` lanza; en una ruta de API eso
  // se traduce a un 403, no a una redirección.
  try {
    await assertAdmin();
  } catch {
    return Response.json({ error: 'No tenés permiso para exportar datos.' }, { status: 403 });
  }

  const { recurso } = await params;

  if (!esRecurso(recurso)) {
    return Response.json(
      { error: `No sabemos exportar «${recurso}». Recursos válidos: ${RECURSOS.join(', ')}.` },
      { status: 404 },
    );
  }

  try {
    const supabase = await createClient();
    const p = request.nextUrl.searchParams;

    const { nombre, csv } = await (async () => {
      switch (recurso) {
        case 'alumnos':
          return exportarAlumnos(supabase, p);
        case 'cuotas':
          return exportarCuotas(supabase, p);
        case 'pagos':
          return exportarPagos(supabase, p);
        case 'deudores':
          return exportarDeudores(supabase, p);
        case 'asistencia':
          return exportarAsistencia(supabase, p);
        case 'ingresos':
          return exportarMovimientos(supabase, p, 'ingreso');
        case 'gastos':
          return exportarMovimientos(supabase, p, 'gasto');
        case 'inscripciones':
          return exportarInscripciones(supabase, p);
      }
    })();

    return respuestaCsv(nombre, csv);
  } catch (error) {
    console.error(`[exportar] falló la exportación de ${recurso}`, error);
    return Response.json({ error: mapError(error) }, { status: 500 });
  }
}
