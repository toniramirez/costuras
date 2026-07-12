import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { formatPeriod, todayISO } from '@/lib/format';
import type { Enums, Tables } from '@/lib/supabase/database.types';

/**
 * Capa de acceso a datos del portal del alumno. SOLO LEE.
 *
 * Todas las consultas van con el cliente de sesión: la RLS ya devuelve
 * exclusivamente las filas del alumno. Igual filtramos por `student_id` de forma
 * explícita — no porque haga falta, sino porque una consulta debe decir en voz
 * alta qué está pidiendo.
 */

export type Cuota = Tables<'monthly_fees'>;
export type Matricula = Tables<'registration_fees'>;
export type Comprobante = Tables<'payment_proofs'>;
export type Recibo = Tables<'payment_receipts'>;

/** Estados en los que la deuda sigue viva. */
const IMPAGAS: ReadonlyArray<Enums<'fee_status'>> = ['pendiente', 'comprobante_pendiente', 'vencida'];

/** Comprobante + enlace temporal para verlo (el bucket `proofs` es privado). */
export type ComprobanteVista = Comprobante & { url: string | null };

export type TipoDeuda = 'cuota' | 'matricula';

/**
 * Cuota y matrícula, con la misma forma.
 *
 * Son dos tablas distintas en la base (períodos vs. inscripción), pero para el
 * alumno son lo mismo: algo que debe o algo que ya pagó. Unificarlas acá evita
 * duplicar toda la pantalla.
 */
export type Deuda = {
  id: string;
  tipo: TipoDeuda;
  concepto: string;
  importeCents: number;
  emitida: string;
  vencimiento: string | null;
  pagadaEl: string | null;
  estado: Enums<'fee_status'>;
  receiptId: string | null;
  /** Último comprobante subido para esta deuda (puede estar rechazado). */
  comprobante: ComprobanteVista | null;
};

export type EstadoDeCuenta = {
  impagas: Deuda[];
  historial: Deuda[];
  recibos: Recibo[];
  totalAdeudadoCents: number;
  /** Vencimiento más próximo entre las impagas. */
  proximoVencimiento: string | null;
};

/** Ordena por fecha ascendente dejando los nulos al final. */
function porVencimiento(a: Deuda, b: Deuda): number {
  return (a.vencimiento ?? '9999-12-31').localeCompare(b.vencimiento ?? '9999-12-31');
}

export async function getEstadoDeCuenta(studentId: string): Promise<EstadoDeCuenta> {
  const supabase = await createClient();

  const [cuotas, matriculas, comprobantes, recibos] = await Promise.all([
    supabase.from('monthly_fees').select('*').eq('student_id', studentId),
    supabase.from('registration_fees').select('*').eq('student_id', studentId),
    supabase
      .from('payment_proofs')
      .select('*')
      .eq('student_id', studentId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('payment_receipts')
      .select('*')
      .eq('student_id', studentId)
      .order('issued_at', { ascending: false }),
  ]);

  if (cuotas.error) throw cuotas.error;
  if (matriculas.error) throw matriculas.error;
  if (comprobantes.error) throw comprobantes.error;
  if (recibos.error) throw recibos.error;

  // Solo interesa el ÚLTIMO comprobante de cada deuda: es el que manda (si está
  // rechazado hay que mostrar el motivo; si está pendiente, que espere).
  // Vienen ordenados por fecha descendente, así que el primero que aparece gana.
  const ultimo = new Map<string, Comprobante>();
  for (const c of comprobantes.data ?? []) {
    const feeId = c.monthly_fee_id ?? c.registration_fee_id;
    if (feeId && !ultimo.has(feeId)) ultimo.set(feeId, c);
  }

  const urls = await urlesFirmadas(supabase, [...ultimo.values()].map((c) => c.file_path));

  const conUrl = (feeId: string): ComprobanteVista | null => {
    const c = ultimo.get(feeId);
    return c ? { ...c, url: urls.get(c.file_path) ?? null } : null;
  };

  // Una matrícula EXENTA e impaga no es una deuda: la academia la eximió. No se
  // muestra ni como deuda ni como pago; cobrarla sería un error.
  const matriculasVisibles = (matriculas.data ?? []).filter(
    (m) => !(m.is_exempt && IMPAGAS.includes(m.status)),
  );

  const deudas: Deuda[] = [
    ...(cuotas.data ?? []).map((c) => ({
      id: c.id,
      tipo: 'cuota' as const,
      concepto: formatPeriod(c.period_year, c.period_month),
      importeCents: Number(c.final_amount_cents),
      emitida: c.issued_date,
      vencimiento: c.due_date,
      pagadaEl: c.paid_date,
      estado: c.status,
      receiptId: c.receipt_id,
      comprobante: conUrl(c.id),
    })),
    ...matriculasVisibles.map((m) => ({
      id: m.id,
      tipo: 'matricula' as const,
      concepto: 'Matrícula',
      importeCents: Number(m.amount_cents),
      emitida: m.issued_date,
      vencimiento: m.due_date,
      pagadaEl: m.paid_date,
      estado: m.status,
      receiptId: m.receipt_id,
      comprobante: conUrl(m.id),
    })),
  ];

  const impagas = deudas.filter((d) => IMPAGAS.includes(d.estado)).sort(porVencimiento);
  const historial = deudas
    .filter((d) => !IMPAGAS.includes(d.estado))
    .sort((a, b) => (b.pagadaEl ?? b.emitida).localeCompare(a.pagadaEl ?? a.emitida));

  return {
    impagas,
    historial,
    recibos: recibos.data ?? [],
    totalAdeudadoCents: impagas.reduce((suma, d) => suma + d.importeCents, 0),
    proximoVencimiento: impagas.find((d) => d.vencimiento)?.vencimiento ?? null,
  };
}

/** Enlaces temporales (1 h) para ver los comprobantes del bucket privado. */
async function urlesFirmadas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (paths.length === 0) return mapa;

  const { data } = await supabase.storage.from('proofs').createSignedUrls(paths, 3600);

  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

// ── Asistencia ──────────────────────────────────────────────────────────────

export type FiltrosAsistencia = {
  estado?: string;
  desde?: string;
  hasta?: string;
};

export type AsistenciaFila = {
  id: string;
  fecha: string;
  grupo: string | null;
  estado: Enums<'attendance_status'>;
  observacion: string | null;
  esRecuperacion: boolean;
};

export type ResumenAsistencia = {
  total: number;
  presentes: number;
  justificadas: number;
  sinJustificar: number;
  recuperaciones: number;
};

/**
 * Historial de asistencias del alumno.
 *
 * El RANGO DE FECHAS se filtra en la base (sobre `class_sessions.session_date`,
 * de ahí el `!inner`). El ESTADO se filtra después, en memoria, y a propósito:
 * el resumen tiene que poder contar todos los estados del mismo período aunque
 * la persona esté mirando solo las ausencias. Un alumno tiene, como mucho, unos
 * cientos de clases: una sola consulta alcanza y evita ordenar por una columna
 * embebida (PostgREST no ordena las filas padre por ellas).
 */
export async function getAsistencia(
  studentId: string,
  filtros: FiltrosAsistencia = {},
): Promise<{ filas: AsistenciaFila[]; resumen: ResumenAsistencia }> {
  const supabase = await createClient();

  let query = supabase
    .from('attendance')
    .select('id, status, observation, is_recovery, class_sessions!inner(session_date), groups(name)')
    .eq('student_id', studentId)
    .limit(1000);

  if (filtros.desde) query = query.gte('class_sessions.session_date', filtros.desde);
  if (filtros.hasta) query = query.lte('class_sessions.session_date', filtros.hasta);

  const { data, error } = await query;
  if (error) throw error;

  const todas: AsistenciaFila[] = (data ?? [])
    .map((a) => ({
      id: a.id,
      fecha: a.class_sessions.session_date,
      grupo: a.groups?.name ?? null,
      estado: a.status,
      observacion: a.observation,
      esRecuperacion: a.is_recovery,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const contar = (estado: Enums<'attendance_status'>) =>
    todas.filter((f) => f.estado === estado).length;

  const resumen: ResumenAsistencia = {
    total: todas.length,
    presentes: contar('presente'),
    justificadas: contar('ausente_justificada'),
    sinJustificar: contar('ausente_sin_justificar'),
    recuperaciones: contar('recuperacion'),
  };

  const filas = filtros.estado ? todas.filter((f) => f.estado === filtros.estado) : todas;

  return { filas, resumen };
}

// ── Recuperaciones ──────────────────────────────────────────────────────────

/** Se avisa "por vencer" con esta anticipación. */
export const DIAS_POR_VENCER = 15;

export type Recuperacion = Tables<'recovery_credits'> & {
  grupo: Pick<Tables<'groups'>, 'name' | 'weekday' | 'start_time' | 'end_time'> | null;
  /** Disponible y con el vencimiento a la vuelta de la esquina. */
  porVencer: boolean;
};

/**
 * Créditos de recuperación del alumno.
 *
 * El orden del enum `recovery_status` (disponible → reservada → utilizada →
 * vencida → cancelada) es justo el orden en el que le sirven al alumno, así que
 * ordenar por `status` alcanza.
 */
export async function getRecuperaciones(studentId: string): Promise<Recuperacion[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recovery_credits')
    .select('*, groups(name, weekday, start_time, end_time)')
    .eq('student_id', studentId)
    .order('status')
    .order('expires_at');

  if (error) throw error;

  const limite = enDias(DIAS_POR_VENCER);

  return (data ?? []).map(({ groups, ...credito }) => ({
    ...credito,
    grupo: groups,
    porVencer: credito.status === 'disponible' && credito.expires_at <= limite,
  }));
}

/** Fecha de hoy + n días, como "YYYY-MM-DD". */
function enDias(dias: number): string {
  const hoy = new Date(`${todayISO()}T00:00:00Z`);
  hoy.setUTCDate(hoy.getUTCDate() + dias);
  return hoy.toISOString().slice(0, 10);
}

// ── Perfil ──────────────────────────────────────────────────────────────────

export type FichaAlumno = Tables<'students'> & {
  groups: Pick<Tables<'groups'>, 'name' | 'weekday' | 'start_time' | 'end_time'> | null;
  plans: Pick<Tables<'plans'>, 'name' | 'price_cents'> | null;
  rates: Pick<Tables<'rates'>, 'name' | 'amount_cents'> | null;
};

export type Perfil = {
  ficha: FichaAlumno;
  /** Enlace temporal a la foto (el bucket `avatars` es privado). */
  avatarUrl: string | null;
  /** Lo que la academia le cobra por mes: la tarifa asignada o el precio de la modalidad. */
  tarifaCents: number | null;
};

export async function getPerfil(studentId: string): Promise<Perfil> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('students')
    .select('*, groups(name, weekday, start_time, end_time), plans(name, price_cents), rates(name, amount_cents)')
    .eq('id', studentId)
    .single();

  if (error) throw error;

  let avatarUrl: string | null = null;
  if (data.avatar_url) {
    const { data: firmada } = await supabase.storage
      .from('avatars')
      .createSignedUrl(data.avatar_url, 3600);
    avatarUrl = firmada?.signedUrl ?? null;
  }

  // Misma regla que `student_monthly_amount_cents()` en la base: manda la tarifa
  // asignada; si no tiene, el precio base de la modalidad.
  const tarifa = data.rates?.amount_cents ?? data.plans?.price_cents ?? null;

  return {
    ficha: data,
    avatarUrl,
    tarifaCents: tarifa === null ? null : Number(tarifa),
  };
}
