import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/lib/supabase/database.types';
import { ESTADOS_ASISTENCIA } from '@/lib/validations/attendance';

/**
 * Capa de acceso a datos de asistencia. SOLO LEE.
 * Las escrituras van por `src/app/actions/attendance.ts`.
 *
 * Sobre la paginación: `rangoPagina()` vive en `@/components/ui/pagination`, que
 * es un módulo 'use client'. Llamar una función de un módulo cliente desde el
 * servidor rompe en tiempo de ejecución (Next la reemplaza por una referencia de
 * cliente), así que acá calculamos el rango a mano. El tamaño de página es el
 * mismo que usa `<Pagination>` por defecto, así que ambos coinciden.
 */
const POR_PAGINA = 20;

const rango = (pagina: number): [number, number] => {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * POR_PAGINA, p * POR_PAGINA - 1];
};

/**
 * Los filtros llegan de la URL: puede venir cualquier cosa escrita a mano.
 * Un uuid inválido o un estado inexistente hacen fallar a Postgres (22P02), así
 * que los descartamos antes de armar la consulta en vez de reventar la página.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS: ReadonlySet<string> = new Set(ESTADOS_ASISTENCIA);

const uuidValido = (v: string | undefined): string | undefined =>
  v && UUID.test(v) ? v : undefined;
const fechaValida = (v: string | undefined): string | undefined =>
  v && FECHA.test(v) ? v : undefined;
const estadoValido = (v: string | undefined): Enums<'attendance_status'> | undefined =>
  v && ESTADOS.has(v) ? (v as Enums<'attendance_status'>) : undefined;

/** En un `.or()` la coma y los paréntesis son sintaxis: hay que neutralizarlos. */
const limpiarBusqueda = (v: string): string => v.replace(/[,()*\\"]/g, ' ').trim();

export type GrupoBasico = Pick<
  Tables<'groups'>,
  'id' | 'name' | 'weekday' | 'start_time' | 'end_time' | 'capacity'
>;

export async function listarGruposActivos(): Promise<GrupoBasico[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, weekday, start_time, end_time, capacity')
    .eq('is_active', true)
    .order('weekday')
    .order('start_time');
  if (error) throw error;
  return data ?? [];
}

/** Una fila de la planilla: el alumno y, si ya se marcó, su registro. */
export type FilaAsistencia = {
  student_id: string;
  nombre: string;
  attendance_id: string | null;
  status: Enums<'attendance_status'> | null;
  observation: string | null;
  /** Viene de otro grupo (o de otra fecha) a recuperar. */
  es_visita: boolean;
  grupo_origen: string | null;
  /** El crédito que lo trae. La server action lo consume con la función de la base. */
  recovery_credit_id: string | null;
};

export type HojaAsistencia = {
  grupo: GrupoBasico;
  fecha: string;
  /** null si todavía no se abrió la clase (no se marcó a nadie). */
  session_id: string | null;
  filas: FilaAsistencia[];
};

/**
 * La planilla del grupo en una fecha: alumnos ACTIVOS del grupo (los pausados no
 * aparecen) más los que vienen a recuperar ese día en ese grupo.
 *
 * Devuelve null si el grupo no existe.
 */
export async function getHojaAsistencia(
  groupId: string,
  fecha: string,
): Promise<HojaAsistencia | null> {
  const supabase = await createClient();

  const { data: grupo, error: errorGrupo } = await supabase
    .from('groups')
    .select('id, name, weekday, start_time, end_time, capacity')
    .eq('id', groupId)
    .maybeSingle();
  if (errorGrupo) throw errorGrupo;
  if (!grupo) return null;

  const [sesion, alumnos, visitas] = await Promise.all([
    supabase
      .from('class_sessions')
      .select('id')
      .eq('group_id', groupId)
      .eq('session_date', fecha)
      .maybeSingle(),

    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('group_id', groupId)
      .eq('status', 'activo')
      .is('archived_at', null)
      .order('last_name')
      .order('first_name'),

    // Créditos reservados para este grupo y esta fecha. Incluimos los ya
    // utilizados para que el alumno no desaparezca de la lista al marcarlo.
    supabase
      .from('recovery_credits')
      .select(
        `id, student_id,
         students!inner (first_name, last_name),
         origen:class_sessions!origin_session_id (groups (name))`,
      )
      .eq('reserved_group_id', groupId)
      .eq('reserved_date', fecha)
      .in('status', ['reservada', 'utilizada']),
  ]);

  if (sesion.error) throw sesion.error;
  if (alumnos.error) throw alumnos.error;
  if (visitas.error) throw visitas.error;

  const sessionId = sesion.data?.id ?? null;

  const registros = sessionId
    ? await supabase
        .from('attendance')
        .select('id, student_id, status, observation')
        .eq('class_session_id', sessionId)
    : null;
  if (registros?.error) throw registros.error;

  const porAlumno = new Map((registros?.data ?? []).map((r) => [r.student_id, r]));

  const filas: FilaAsistencia[] = [];
  const yaEsta = new Set<string>();

  for (const a of alumnos.data ?? []) {
    const r = porAlumno.get(a.id);
    yaEsta.add(a.id);
    filas.push({
      student_id: a.id,
      nombre: `${a.first_name} ${a.last_name}`,
      attendance_id: r?.id ?? null,
      status: r?.status ?? null,
      observation: r?.observation ?? null,
      es_visita: false,
      grupo_origen: null,
      recovery_credit_id: null,
    });
  }

  for (const c of visitas.data ?? []) {
    // Si además es alumno del grupo, ya está listado: no lo duplicamos.
    if (yaEsta.has(c.student_id)) continue;
    const r = porAlumno.get(c.student_id);
    yaEsta.add(c.student_id);
    filas.push({
      student_id: c.student_id,
      nombre: `${c.students.first_name} ${c.students.last_name}`,
      attendance_id: r?.id ?? null,
      status: r?.status ?? null,
      observation: r?.observation ?? null,
      es_visita: true,
      grupo_origen: c.origen?.groups?.name ?? null,
      recovery_credit_id: c.id,
    });
  }

  return { grupo, fecha, session_id: sessionId, filas };
}

export type FiltrosHistorial = {
  q?: string;
  grupo?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
};

export type RegistroHistorial = {
  id: string;
  student_id: string;
  alumno: string;
  fecha: string;
  grupo: string | null;
  status: Enums<'attendance_status'>;
  observation: string | null;
  is_recovery: boolean;
  /** La ausencia ya generó un crédito de recuperación. */
  tiene_credito: boolean;
};

/**
 * Historial con filtros y paginación.
 *
 * La fecha de la clase vive en `class_sessions`, no en `attendance`: por eso el
 * join es `!inner` (así el filtro por fecha y por grupo recorta las filas padre)
 * y el orden usa la sintaxis de columna embebida, `class_sessions(session_date)`.
 */
export async function listarHistorial(
  filtros: FiltrosHistorial = {},
): Promise<{ filas: RegistroHistorial[]; total: number }> {
  const supabase = await createClient();
  const [desde, hasta] = rango(filtros.pagina ?? 1);

  let query = supabase
    .from('attendance')
    .select(
      `id, status, observation, is_recovery, student_id,
       students!inner (first_name, last_name),
       class_sessions!inner (session_date, group_id, groups (name))`,
      { count: 'exact' },
    )
    .order('class_sessions(session_date)', { ascending: false })
    .order('recorded_at', { ascending: false })
    .range(desde, hasta);

  const grupo = uuidValido(filtros.grupo);
  const estado = estadoValido(filtros.estado);
  const desdeFecha = fechaValida(filtros.desde);
  const hastaFecha = fechaValida(filtros.hasta);
  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';

  if (grupo) query = query.eq('class_sessions.group_id', grupo);
  if (estado) query = query.eq('status', estado);
  if (desdeFecha) query = query.gte('class_sessions.session_date', desdeFecha);
  if (hastaFecha) query = query.lte('class_sessions.session_date', hastaFecha);
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`, {
      referencedTable: 'students',
    });
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const filas = data ?? [];
  const conCredito = await idsConCredito(filas.map((f) => f.id));

  return {
    total: count ?? 0,
    filas: filas.map((f) => ({
      id: f.id,
      student_id: f.student_id,
      alumno: `${f.students.first_name} ${f.students.last_name}`,
      fecha: f.class_sessions.session_date,
      grupo: f.class_sessions.groups?.name ?? null,
      status: f.status,
      observation: f.observation,
      is_recovery: f.is_recovery,
      tiene_credito: conCredito.has(f.id),
    })),
  };
}

/**
 * De un conjunto de asistencias, cuáles ya tienen un crédito vigente.
 * Es la misma condición que usa `issue_recovery_credit` para no emitir dos veces.
 */
export async function idsConCredito(attendanceIds: string[]): Promise<Set<string>> {
  if (attendanceIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recovery_credits')
    .select('origin_attendance_id')
    .in('origin_attendance_id', attendanceIds)
    .in('status', ['disponible', 'reservada', 'utilizada']);
  if (error) throw error;

  return new Set((data ?? []).flatMap((c) => (c.origin_attendance_id ? [c.origin_attendance_id] : [])));
}
