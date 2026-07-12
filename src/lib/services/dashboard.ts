import 'server-only';

import { formatInTimeZone } from 'date-fns-tz';

import { createClient } from '@/lib/supabase/server';
import { TIMEZONE, todayISO } from '@/lib/format';

/** Primer y último día de un período, como texto "YYYY-MM-DD". */
function rangoDelMes(anio: number, mes: number): { desde: string; hasta: string } {
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

/** El mes en curso en Córdoba. El Inicio siempre habla de HOY, no de un período elegido. */
export function periodoEnCurso(): { anio: number; mes: number } {
  const [anio, mes] = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM').split('-').map(Number);
  return { anio, mes };
}

/**
 * El día de la semana de hoy como lo guarda la base: 0 = domingo … 6 = sábado.
 *
 * `i` de date-fns es el día ISO (1 = lunes … 7 = domingo); el módulo 7 lleva el
 * domingo de 7 a 0, que es la convención de la columna `groups.weekday`.
 */
function diaDeLaSemanaHoy(): number {
  return Number(formatInTimeZone(new Date(), TIMEZONE, 'i')) % 7;
}

export type AdminDashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

/**
 * Métricas del panel administrativo del mes en curso.
 * Todo sale de la base con RLS activa: si quien consulta no es admin, no ve nada.
 */
export async function getAdminDashboard() {
  const supabase = await createClient();
  const { anio, mes } = periodoEnCurso();
  const { desde, hasta } = rangoDelMes(anio, mes);
  const hoy = todayISO();

  const [
    activos,
    pausados,
    nuevos,
    cuotas,
    movimientos,
    saldos,
    comprobantes,
    recuperaciones,
    talleres,
    proyectosActivos,
    proyectosTerminados,
    gruposDeHoy,
    sesionesDeHoy,
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true })
      .eq('status', 'activo').is('archived_at', null),

    supabase.from('students').select('*', { count: 'exact', head: true })
      .eq('status', 'pausado').is('archived_at', null),

    supabase.from('students').select('*', { count: 'exact', head: true })
      .gte('enrollment_date', desde).lte('enrollment_date', hasta),

    supabase.from('monthly_fees').select('status, final_amount_cents')
      .eq('period_year', anio).eq('period_month', mes),

    supabase.from('financial_movements').select('type, amount_cents')
      .gte('movement_date', desde).lte('movement_date', hasta),

    supabase.from('cash_account_balances').select('*').eq('is_active', true),

    supabase.from('payment_proofs').select('*', { count: 'exact', head: true })
      .eq('status', 'pendiente'),

    supabase.from('recovery_credits').select('*', { count: 'exact', head: true })
      .in('status', ['disponible', 'reservada']),

    supabase.from('workshops').select('id, name, event_date, capacity, status')
      .gte('event_date', hoy).order('event_date').limit(3),

    supabase.from('projects').select('*', { count: 'exact', head: true })
      .eq('status', 'en_proceso'),

    supabase.from('projects').select('*', { count: 'exact', head: true })
      .eq('status', 'terminado'),

    // Las clases que tocan HOY, y cuáles ya tienen la planilla abierta.
    supabase.from('groups').select('id, name, start_time, end_time')
      .eq('is_active', true).eq('weekday', diaDeLaSemanaHoy()).order('start_time'),

    supabase.from('class_sessions').select('group_id').eq('session_date', hoy),
  ]);

  const filasCuotas = cuotas.data ?? [];
  const emitidas = filasCuotas.length;
  const pagadas = filasCuotas.filter((f) => f.status === 'pagada').length;
  const pendientes = filasCuotas.filter(
    (f) => f.status === 'pendiente' || f.status === 'comprobante_pendiente',
  ).length;
  const vencidas = filasCuotas.filter((f) => f.status === 'vencida').length;

  // Total por cobrar: todo lo emitido que sigue impago.
  const totalPorCobrar = filasCuotas
    .filter((f) => ['pendiente', 'comprobante_pendiente', 'vencida'].includes(f.status))
    .reduce((suma, f) => suma + Number(f.final_amount_cents), 0);

  const filasMovimientos = movimientos.data ?? [];
  const ingresos = filasMovimientos
    .filter((m) => m.type === 'ingreso')
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const gastos = filasMovimientos
    .filter((m) => m.type === 'gasto')
    .reduce((s, m) => s + Number(m.amount_cents), 0);

  // Una clase está «tomada» cuando existe la sesión: se abre al marcar al primero.
  const conPlanillaAbierta = new Set((sesionesDeHoy.data ?? []).map((s) => s.group_id));
  const clasesDeHoy = (gruposDeHoy.data ?? []).map((g) => ({
    ...g,
    asistenciaTomada: conPlanillaAbierta.has(g.id),
  }));

  return {
    periodo: { anio, mes },
    hoy,
    alumnos: {
      activos: activos.count ?? 0,
      pausados: pausados.count ?? 0,
      nuevosDelMes: nuevos.count ?? 0,
    },
    cuotas: { emitidas, pagadas, pendientes, vencidas, totalPorCobrar },
    finanzas: { ingresos, gastos, resultado: ingresos - gastos },
    cajas: saldos.data ?? [],
    pendientes: {
      comprobantes: comprobantes.count ?? 0,
      recuperaciones: recuperaciones.count ?? 0,
    },
    clasesDeHoy,
    talleres: talleres.data ?? [],
    proyectos: {
      activos: proyectosActivos.count ?? 0,
      terminados: proyectosTerminados.count ?? 0,
    },
  };
}

export type StudentDashboard = Awaited<ReturnType<typeof getStudentDashboard>>;

/** Datos del inicio del alumno. La RLS garantiza que solo vea lo suyo. */
export async function getStudentDashboard(studentId: string) {
  const supabase = await createClient();

  const [ficha, cuotas, recuperaciones, comunicados, novedades, proyecto, talleres] =
    await Promise.all([
      supabase
        .from('students')
        .select('*, groups(name, weekday, start_time, end_time), plans(name)')
        .eq('id', studentId)
        .single(),

      supabase
        .from('monthly_fees')
        .select('*')
        .in('status', ['pendiente', 'comprobante_pendiente', 'vencida'])
        .order('period_year')
        .order('period_month'),

      supabase
        .from('recovery_credits')
        .select('*')
        .eq('status', 'disponible')
        .order('expires_at'),

      supabase
        .from('communication_recipients')
        .select('id, read_at, communications(id, subject, priority, sent_at)')
        .is('read_at', null),

      supabase
        .from('announcements')
        .select('id, title, content, priority, is_pinned, published_at')
        .eq('status', 'publicada')
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(3),

      supabase
        .from('projects')
        .select('id, title, status, cover_image_path, updated_at')
        .eq('status', 'en_proceso')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('workshops')
        .select('id, name, event_date, start_time')
        .gte('event_date', todayISO())
        .in('status', ['publicado', 'inscripcion_abierta'])
        .order('event_date')
        .limit(2),
    ]);

  return {
    ficha: ficha.data,
    cuotasPendientes: cuotas.data ?? [],
    recuperaciones: recuperaciones.data ?? [],
    comunicadosSinLeer: comunicados.data ?? [],
    novedades: novedades.data ?? [],
    proyectoActual: proyecto.data,
    talleres: talleres.data ?? [],
  };
}
