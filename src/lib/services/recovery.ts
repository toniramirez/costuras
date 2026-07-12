import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/supabase/database.types';
import { todayISO } from '@/lib/format';
import { ESTADOS_RECUPERACION } from '@/lib/validations/recovery';

/**
 * Capa de acceso a datos de recuperaciones. SOLO LEE.
 *
 * Todo lo que MUEVE un crédito (emitir, reservar, usar, cancelar, vencer) son
 * funciones de la base y se llaman desde `src/app/actions/recovery.ts`.
 */
const POR_PAGINA = 20;

const rango = (pagina: number): [number, number] => {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * POR_PAGINA, p * POR_PAGINA - 1];
};

const ESTADOS: ReadonlySet<string> = new Set(ESTADOS_RECUPERACION);
const limpiarBusqueda = (v: string): string => v.replace(/[,()*\\"]/g, ' ').trim();

export type FiltrosRecuperacion = {
  q?: string;
  estado?: string;
  pagina?: number;
};

export type Recuperacion = {
  id: string;
  student_id: string;
  alumno: string;
  status: Enums<'recovery_status'>;
  reason: string | null;
  issued_at: string;
  expires_at: string;
  origen_fecha: string | null;
  origen_grupo: string | null;
  reservado_grupo_id: string | null;
  reservado_grupo: string | null;
  reservado_fecha: string | null;
  used_at: string | null;
  cancel_reason: string | null;
};

export async function listarRecuperaciones(
  filtros: FiltrosRecuperacion = {},
): Promise<{ filas: Recuperacion[]; total: number }> {
  const supabase = await createClient();
  const [desde, hasta] = rango(filtros.pagina ?? 1);

  let query = supabase
    .from('recovery_credits')
    .select(
      `id, student_id, status, reason, issued_at, expires_at,
       reserved_group_id, reserved_date, used_at, cancel_reason,
       students!inner (first_name, last_name),
       origen:class_sessions!origin_session_id (session_date, groups (name)),
       reservado:groups!reserved_group_id (name)`,
      { count: 'exact' },
    )
    .order('issued_at', { ascending: false })
    .range(desde, hasta);

  const estado = filtros.estado && ESTADOS.has(filtros.estado) ? filtros.estado : undefined;
  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';

  if (estado) query = query.eq('status', estado as Enums<'recovery_status'>);
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`, {
      referencedTable: 'students',
    });
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    filas: (data ?? []).map((c) => ({
      id: c.id,
      student_id: c.student_id,
      alumno: `${c.students.first_name} ${c.students.last_name}`,
      status: c.status,
      reason: c.reason,
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      origen_fecha: c.origen?.session_date ?? null,
      origen_grupo: c.origen?.groups?.name ?? null,
      reservado_grupo_id: c.reserved_group_id,
      reservado_grupo: c.reservado?.name ?? null,
      reservado_fecha: c.reserved_date,
      used_at: c.used_at,
      cancel_reason: c.cancel_reason,
    })),
  };
}

export type AusenciaSinCredito = {
  attendance_id: string;
  alumno: string;
  fecha: string;
  grupo: string | null;
  status: Enums<'attendance_status'>;
  observation: string | null;
};

/**
 * Ausencias que todavía no generaron crédito: la cola de trabajo de la admin.
 *
 * PostgREST no sabe hacer un NOT EXISTS, así que traemos las ausencias recientes
 * y descartamos las que ya tienen crédito vigente (son pocas). Las justificadas
 * van primero: son las que corresponden por regla; las otras solo con excepción.
 */
export async function listarAusenciasSinCredito(limite = 25): Promise<AusenciaSinCredito[]> {
  const supabase = await createClient();

  const [ausencias, creditos] = await Promise.all([
    supabase
      .from('attendance')
      .select(
        `id, status, observation,
         students!inner (first_name, last_name),
         class_sessions!inner (session_date, groups (name))`,
      )
      .in('status', ['ausente_justificada', 'ausente_sin_justificar'])
      .order('class_sessions(session_date)', { ascending: false })
      .limit(limite * 4),

    supabase
      .from('recovery_credits')
      .select('origin_attendance_id')
      .in('status', ['disponible', 'reservada', 'utilizada'])
      .not('origin_attendance_id', 'is', null),
  ]);

  if (ausencias.error) throw ausencias.error;
  if (creditos.error) throw creditos.error;

  const conCredito = new Set((creditos.data ?? []).map((c) => c.origin_attendance_id));

  return (ausencias.data ?? [])
    .filter((a) => !conCredito.has(a.id))
    .map((a) => ({
      attendance_id: a.id,
      alumno: `${a.students.first_name} ${a.students.last_name}`,
      fecha: a.class_sessions.session_date,
      grupo: a.class_sessions.groups?.name ?? null,
      status: a.status,
      observation: a.observation,
    }))
    .sort((x, y) => {
      const justificada = (s: Enums<'attendance_status'>) => (s === 'ausente_justificada' ? 0 : 1);
      return justificada(x.status) - justificada(y.status) || y.fecha.localeCompare(x.fecha);
    })
    .slice(0, limite);
}

export type GrupoConCupo = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  ocupados: number;
  libres: number;
  lleno: boolean;
};

/**
 * Grupos activos con su ocupación.
 *
 * El cupo NO se calcula a mano: sale de la vista `group_occupancy`, que es la
 * misma que consulta `reserve_recovery_credit` para rechazar un grupo lleno.
 */
export async function listarGruposConCupo(): Promise<GrupoConCupo[]> {
  const supabase = await createClient();

  const [grupos, ocupacion] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, weekday, start_time, end_time, capacity')
      .eq('is_active', true)
      .order('weekday')
      .order('start_time'),
    supabase.from('group_occupancy').select('*'),
  ]);

  if (grupos.error) throw grupos.error;
  if (ocupacion.error) throw ocupacion.error;

  const porGrupo = new Map((ocupacion.data ?? []).map((o) => [o.group_id, o]));

  return (grupos.data ?? []).map((g) => {
    const o = porGrupo.get(g.id);
    return {
      ...g,
      ocupados: o?.current_students ?? 0,
      libres: o?.available_slots ?? g.capacity,
      lleno: o?.is_full ?? false,
    };
  });
}

/** Cabecera del listado: cuántos créditos hay y cuántos habría que vencer. */
export async function resumenRecuperaciones(): Promise<{
  disponibles: number;
  reservadas: number;
  aVencer: number;
}> {
  const supabase = await createClient();
  const hoy = todayISO();

  const [disponibles, reservadas, aVencer] = await Promise.all([
    supabase
      .from('recovery_credits')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'disponible'),
    supabase
      .from('recovery_credits')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'reservada'),
    // Las que ya pasaron de fecha y siguen vivas: es lo que procesa el botón
    // "Vencer las que corresponda" (rpc expire_recovery_credits).
    supabase
      .from('recovery_credits')
      .select('*', { count: 'exact', head: true })
      .in('status', ['disponible', 'reservada'])
      .lt('expires_at', hoy),
  ]);

  return {
    disponibles: disponibles.count ?? 0,
    reservadas: reservadas.count ?? 0,
    aVencer: aVencer.count ?? 0,
  };
}
