import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/format';
import type { Enums, Tables } from '@/lib/supabase/database.types';

/**
 * Capa de acceso a datos de cuotas, matrículas y comprobantes.
 *
 * Los servicios SOLO leen (las escrituras van por server actions) y siempre con
 * el cliente con sesión: la RLS decide qué filas se ven.
 */

export type Cuota = Tables<'monthly_fees'>;
export type Matricula = Tables<'registration_fees'>;
export type Comprobante = Tables<'payment_proofs'>;

/** 20 por página, igual que el componente <Pagination> del kit. */
export const POR_PAGINA = 20;

/**
 * Rango [desde, hasta] para el .range() de Supabase.
 *
 * Es la misma cuenta que `rangoPagina()` de `@/components/ui/pagination`, pero
 * ese módulo es 'use client': una función exportada desde el cliente no se puede
 * invocar en el servidor (React la reemplaza por una referencia). Acá corre en
 * el servidor, así que la calculamos localmente.
 */
function rango(pagina: number): [number, number] {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * POR_PAGINA, p * POR_PAGINA - 1];
}

/** El período que se muestra por defecto: el mes en curso (hora de Córdoba). */
export function periodoActual(): { anio: number; mes: number } {
  const [anio, mes] = todayISO().split('-');
  return { anio: Number(anio), mes: Number(mes) };
}

/** Estados que significan "el alumno todavía debe esta cuota". */
export const ESTADOS_IMPAGOS: Enums<'fee_status'>[] = [
  'pendiente',
  'comprobante_pendiente',
  'vencida',
];

/**
 * PostgREST separa los filtros de `or=(...)` con comas y usa paréntesis:
 * si el texto buscado los trae, rompe la consulta. Los sacamos.
 */
function limpiarBusqueda(q: string): string {
  return q.replace(/[,()*%\\"]/g, ' ').trim();
}

const numero = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// ── Cuotas mensuales ────────────────────────────────────────────────────────

export type AlumnoDeCuota = {
  id: string;
  first_name: string;
  last_name: string;
  group_id: string | null;
  groups: { id: string; name: string } | null;
};

export type FilaCuota = Cuota & { students: AlumnoDeCuota | null };

/** Los filtros llegan como texto desde la URL (searchParams). */
export type FiltrosCuota = {
  anio?: string;
  mes?: string;
  /** Un `fee_status`, o 'deudores' (pendiente + comprobante + vencida). */
  estado?: string;
  /** Un id de grupo, o 'sin' para los alumnos sin grupo. */
  grupo?: string;
  q?: string;
  pagina?: string;
};

const SELECT_CUOTA = '*, students!inner(id, first_name, last_name, group_id, groups(id, name))';

export async function listarCuotas(
  filtros: FiltrosCuota,
): Promise<{ filas: FilaCuota[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('monthly_fees')
    .select(SELECT_CUOTA, { count: 'exact' })
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('created_at', { ascending: true });

  const anio = numero(filtros.anio);
  const mes = numero(filtros.mes);
  if (anio) query = query.eq('period_year', anio);
  if (mes) query = query.eq('period_month', mes);

  if (filtros.estado === 'deudores') {
    query = query.in('status', ESTADOS_IMPAGOS);
  } else if (filtros.estado) {
    query = query.eq('status', filtros.estado as Enums<'fee_status'>);
  }

  // `students!inner` hace que este filtro recorte las cuotas, no solo el embebido.
  if (filtros.grupo === 'sin') {
    query = query.is('students.group_id', null);
  } else if (filtros.grupo) {
    query = query.eq('students.group_id', filtros.grupo);
  }

  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`, {
      referencedTable: 'students',
    });
  }

  const { data, error, count } = await query
    .range(...rango(numero(filtros.pagina) ?? 1))
    .returns<FilaCuota[]>();

  if (error) throw error;
  return { filas: data ?? [], total: count ?? 0 };
}

export type MetricasCuotas = {
  emitidas: number;
  pagadas: number;
  pendientes: number;
  vencidas: number;
  /** Todo lo emitido que sigue impago, en centavos. */
  totalPorCobrar: number;
};

/**
 * Métricas del período (y del grupo, si está filtrado).
 *
 * A propósito NO aplican el filtro de estado ni el buscador: describen el
 * período completo, no el recorte que se está mirando. Si no, "pendientes"
 * siempre sería igual al total de la tabla y la métrica no diría nada.
 */
export async function metricasCuotas(filtros: FiltrosCuota): Promise<MetricasCuotas> {
  const supabase = await createClient();

  type FilaMetrica = { status: Enums<'fee_status'>; final_amount_cents: number };
  const filas: FilaMetrica[] = [];

  const anio = numero(filtros.anio);
  const mes = numero(filtros.mes);

  // Leemos por lotes: la API REST corta en 1000 filas y un total de dinero
  // truncado sería un error grave (silencioso, además).
  for (let desde = 0; ; desde += 1000) {
    let query = supabase
      .from('monthly_fees')
      .select('status, final_amount_cents, students!inner(group_id)');

    if (anio) query = query.eq('period_year', anio);
    if (mes) query = query.eq('period_month', mes);
    if (filtros.grupo === 'sin') query = query.is('students.group_id', null);
    else if (filtros.grupo) query = query.eq('students.group_id', filtros.grupo);

    const { data, error } = await query
      .range(desde, desde + 999)
      .returns<FilaMetrica[]>();

    if (error) throw error;
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }

  const cuenta = (...estados: Enums<'fee_status'>[]) =>
    filas.filter((f) => estados.includes(f.status)).length;

  return {
    emitidas: filas.length,
    pagadas: cuenta('pagada'),
    pendientes: cuenta('pendiente', 'comprobante_pendiente'),
    vencidas: cuenta('vencida'),
    totalPorCobrar: filas
      .filter((f) => ESTADOS_IMPAGOS.includes(f.status))
      .reduce((suma, f) => suma + Number(f.final_amount_cents), 0),
  };
}

/** Los años que tienen cuotas emitidas, para el desplegable de período. */
export async function aniosConCuotas(): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('monthly_fees')
    .select('period_year')
    .order('period_year', { ascending: false });

  if (error) throw error;

  const anios = new Set<number>((data ?? []).map((f) => f.period_year));
  anios.add(periodoActual().anio); // el año en curso siempre está disponible
  return [...anios].sort((a, b) => b - a);
}

/** Grupos para el filtro del listado. */
export async function listarGruposParaFiltro(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('groups').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}

// ── Matrículas ──────────────────────────────────────────────────────────────

export type FilaMatricula = Matricula & {
  students: { id: string; first_name: string; last_name: string } | null;
};

export type FiltrosMatricula = {
  estado?: string;
  q?: string;
  pagina?: string;
};

export async function listarMatriculas(
  filtros: FiltrosMatricula,
): Promise<{ filas: FilaMatricula[]; total: number; impagas: number; totalPorCobrar: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('registration_fees')
    .select('*, students!inner(id, first_name, last_name)', { count: 'exact' })
    .order('issued_date', { ascending: false });

  if (filtros.estado === 'deudores') {
    query = query.in('status', ESTADOS_IMPAGOS);
  } else if (filtros.estado) {
    query = query.eq('status', filtros.estado as Enums<'fee_status'>);
  }

  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`, {
      referencedTable: 'students',
    });
  }

  const [listado, impagas] = await Promise.all([
    query.range(...rango(numero(filtros.pagina) ?? 1)).returns<FilaMatricula[]>(),
    supabase
      .from('registration_fees')
      .select('amount_cents')
      .in('status', ESTADOS_IMPAGOS),
  ]);

  if (listado.error) throw listado.error;
  if (impagas.error) throw impagas.error;

  const deuda = impagas.data ?? [];

  return {
    filas: listado.data ?? [],
    total: listado.count ?? 0,
    impagas: deuda.length,
    totalPorCobrar: deuda.reduce((s, f) => s + Number(f.amount_cents), 0),
  };
}

// ── Comprobantes de transferencia ───────────────────────────────────────────

export type FilaComprobante = Comprobante & {
  students: { id: string; first_name: string; last_name: string } | null;
  monthly_fees: {
    id: string;
    period_year: number;
    period_month: number;
    final_amount_cents: number;
    status: Enums<'fee_status'>;
  } | null;
  registration_fees: {
    id: string;
    amount_cents: number;
    status: Enums<'fee_status'>;
  } | null;
  /** URL temporal (1 h) para ver el archivo del bucket privado `proofs`. */
  archivoUrl: string | null;
};

export type FiltrosComprobante = {
  /** 'pendiente' | 'aprobado' | 'rechazado'. Por defecto, los pendientes. */
  estado?: string;
  q?: string;
  pagina?: string;
};

export async function listarComprobantes(
  filtros: FiltrosComprobante,
): Promise<{ filas: FilaComprobante[]; total: number; pendientes: number }> {
  const supabase = await createClient();

  const estado = (filtros.estado ?? 'pendiente') as Enums<'proof_status'> | 'todos';

  let query = supabase
    .from('payment_proofs')
    .select(
      `*,
       students!inner(id, first_name, last_name),
       monthly_fees(id, period_year, period_month, final_amount_cents, status),
       registration_fees(id, amount_cents, status)`,
      { count: 'exact' },
    )
    .order('uploaded_at', { ascending: false });

  if (estado !== 'todos') query = query.eq('status', estado);

  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`, {
      referencedTable: 'students',
    });
  }

  type FilaCruda = Omit<FilaComprobante, 'archivoUrl'>;

  const [listado, pendientes] = await Promise.all([
    query.range(...rango(numero(filtros.pagina) ?? 1)).returns<FilaCruda[]>(),
    supabase
      .from('payment_proofs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendiente'),
  ]);

  if (listado.error) throw listado.error;

  const crudas = listado.data ?? [];

  // El bucket `proofs` es privado: se ve con una URL firmada, que se genera acá
  // (en el servidor). Una sola llamada para toda la página.
  const rutas = crudas.map((c) => c.file_path);
  const firmadas = new Map<string, string>();

  if (rutas.length > 0) {
    const { data } = await supabase.storage.from('proofs').createSignedUrls(rutas, 3600);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) firmadas.set(item.path, item.signedUrl);
    }
  }

  return {
    filas: crudas.map((c) => ({ ...c, archivoUrl: firmadas.get(c.file_path) ?? null })),
    total: listado.count ?? 0,
    pendientes: pendientes.count ?? 0,
  };
}
