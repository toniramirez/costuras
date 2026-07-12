import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables, Views } from '@/lib/supabase/database.types';

export type Group = Tables<'groups'>;
export type Ocupacion = Views<'group_occupancy'>;

/** Grupo + su modalidad + la ocupación real (que sale de la vista, nunca se guarda). */
export type GrupoConOcupacion = Group & {
  plans: { id: string; name: string } | null;
  ocupacion: {
    current_students: number;
    capacity: number;
    available_slots: number;
    is_full: boolean;
  };
};

export type FiltrosGrupo = {
  q?: string;
  activo?: string; // 'si' | 'no'
  dia?: string; // '0'…'6'
};

/**
 * Capa de acceso a datos: los servicios SOLO leen. Las escrituras van por server
 * actions, para que pasen sí o sí por Zod y por el chequeo de permisos.
 */
export async function listarGrupos(filtros: FiltrosGrupo = {}): Promise<GrupoConOcupacion[]> {
  const supabase = await createClient();

  let query = supabase
    .from('groups')
    .select('*, plans(id, name)')
    .order('weekday')
    .order('start_time');

  if (filtros.q) query = query.ilike('name', `%${filtros.q}%`);
  if (filtros.activo === 'si') query = query.eq('is_active', true);
  if (filtros.activo === 'no') query = query.eq('is_active', false);
  if (filtros.dia !== undefined && filtros.dia !== '') {
    const dia = Number(filtros.dia);
    if (Number.isInteger(dia) && dia >= 0 && dia <= 6) query = query.eq('weekday', dia);
  }

  const [grupos, ocupaciones] = await Promise.all([query, ocupacionPorGrupo()]);

  if (grupos.error) throw grupos.error;

  return (grupos.data ?? []).map((g) => {
    const o = ocupaciones.get(g.id);
    const actuales = o?.current_students ?? 0;
    return {
      ...g,
      ocupacion: {
        current_students: actuales,
        capacity: o?.capacity ?? g.capacity,
        available_slots: o?.available_slots ?? Math.max(g.capacity - actuales, 0),
        is_full: o?.is_full ?? false,
      },
    };
  });
}

/**
 * Ocupación de cada grupo, indexada por id.
 *
 * Sale de la vista `group_occupancy`: el cupo ocupado NUNCA se guarda, se calcula.
 * (La vista cuenta alumnos activos y pendientes; un pausado libera el lugar.)
 */
export async function ocupacionPorGrupo(): Promise<Map<string, Ocupacion>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('group_occupancy').select('*');
  if (error) throw error;

  const mapa = new Map<string, Ocupacion>();
  for (const fila of data ?? []) {
    if (fila.group_id) mapa.set(fila.group_id, fila);
  }
  return mapa;
}

/** Grupos activos con su ocupación, para los desplegables del alta de alumnos. */
export type OpcionGrupo = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  plan_id: string | null;
  current_students: number;
  available_slots: number;
  is_full: boolean;
};

export async function listarGruposActivos(): Promise<OpcionGrupo[]> {
  const supabase = await createClient();

  const [grupos, ocupaciones] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, weekday, start_time, end_time, capacity, plan_id')
      .eq('is_active', true)
      .order('weekday')
      .order('start_time'),
    ocupacionPorGrupo(),
  ]);

  if (grupos.error) throw grupos.error;

  return (grupos.data ?? []).map((g) => {
    const o = ocupaciones.get(g.id);
    const actuales = o?.current_students ?? 0;
    return {
      ...g,
      current_students: actuales,
      available_slots: o?.available_slots ?? Math.max(g.capacity - actuales, 0),
      is_full: o?.is_full ?? false,
    };
  });
}

/** Todos los grupos (aunque estén inactivos) para el filtro del listado de alumnos. */
export async function listarGruposParaFiltro(): Promise<Pick<Group, 'id' | 'name' | 'weekday' | 'start_time'>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, weekday, start_time')
    .order('weekday')
    .order('start_time');
  if (error) throw error;
  return data ?? [];
}

/**
 * Cuántos registros dependen de un grupo.
 *
 * Importa porque las claves foráneas de `student_groups` y `class_sessions` son
 * `on delete cascade`: borrar un grupo con historia se llevaría puesto el
 * historial de asignaciones y las clases (y con ellas, la asistencia). Por eso
 * el borrado se bloquea y se sugiere desactivar.
 */
export async function usosDelGrupo(id: string): Promise<{
  alumnos: number;
  historial: number;
  clases: number;
  total: number;
}> {
  const supabase = await createClient();

  const [alumnos, historial, clases] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('group_id', id),
    supabase.from('student_groups').select('*', { count: 'exact', head: true }).eq('group_id', id),
    supabase.from('class_sessions').select('*', { count: 'exact', head: true }).eq('group_id', id),
  ]);

  const cuenta = {
    alumnos: alumnos.count ?? 0,
    historial: historial.count ?? 0,
    clases: clases.count ?? 0,
  };

  return { ...cuenta, total: cuenta.alumnos + cuenta.historial + cuenta.clases };
}
