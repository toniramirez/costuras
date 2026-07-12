import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';

export type Rate = Tables<'rates'>;

/** Tarifa + su modalidad + cuántos alumnos la tienen asignada hoy. */
export type TarifaConUso = Rate & {
  plans: { id: string; name: string } | null;
  alumnos: number;
};

export type FiltrosTarifa = {
  q?: string;
  activa?: string; // 'si' | 'no'
  plan?: string; // uuid de la modalidad
};

/**
 * Capa de acceso a datos: los servicios SOLO leen. Las escrituras van por server
 * actions, para que pasen sí o sí por Zod y por el chequeo de permisos.
 */
export async function listarTarifas(filtros: FiltrosTarifa = {}): Promise<TarifaConUso[]> {
  const supabase = await createClient();

  let query = supabase
    .from('rates')
    .select('*, plans(id, name)')
    .order('is_active', { ascending: false })
    .order('name');

  if (filtros.q) query = query.ilike('name', `%${filtros.q}%`);
  if (filtros.activa === 'si') query = query.eq('is_active', true);
  if (filtros.activa === 'no') query = query.eq('is_active', false);
  if (filtros.plan) query = query.eq('plan_id', filtros.plan);

  const [tarifas, asignaciones] = await Promise.all([query, alumnosPorTarifa()]);

  if (tarifas.error) throw tarifas.error;

  return (tarifas.data ?? []).map((t) => ({ ...t, alumnos: asignaciones.get(t.id) ?? 0 }));
}

/**
 * Cuántos alumnos (no dados de baja) tiene asignada cada tarifa, indexado por id.
 *
 * Se cuenta acá y no en la base porque PostgREST no agrupa: traemos solo la
 * columna `rate_id` de los alumnos vigentes, que es un puñado de bytes.
 */
export async function alumnosPorTarifa(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('rate_id')
    .not('rate_id', 'is', null)
    .is('archived_at', null);
  if (error) throw error;

  const mapa = new Map<string, number>();
  for (const fila of data ?? []) {
    if (fila.rate_id) mapa.set(fila.rate_id, (mapa.get(fila.rate_id) ?? 0) + 1);
  }
  return mapa;
}

/** Tarifas activas, para los desplegables de otros formularios. */
export type OpcionTarifa = Pick<Rate, 'id' | 'name' | 'amount_cents' | 'plan_id'>;

export async function listarTarifasActivas(): Promise<OpcionTarifa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rates')
    .select('id, name, amount_cents, plan_id')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * Cuántos registros dependen de una tarifa.
 *
 * Las claves foráneas son `on delete set null`: borrar una tarifa usada no
 * fallaría, dejaría en silencio sin tarifa a los alumnos y sin referencia al
 * historial y a las cuotas ya emitidas. Por eso el borrado se bloquea y se
 * sugiere desactivar.
 */
export async function usosDeTarifa(id: string): Promise<{
  alumnos: number;
  historial: number;
  cuotas: number;
  inscripciones: number;
  total: number;
}> {
  const supabase = await createClient();

  const [alumnos, historial, cuotas, inscripciones] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('rate_id', id),
    supabase.from('student_rates').select('*', { count: 'exact', head: true }).eq('rate_id', id),
    supabase.from('monthly_fees').select('*', { count: 'exact', head: true }).eq('rate_id', id),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('rate_id', id),
  ]);

  const cuenta = {
    alumnos: alumnos.count ?? 0,
    historial: historial.count ?? 0,
    cuotas: cuotas.count ?? 0,
    inscripciones: inscripciones.count ?? 0,
  };

  return {
    ...cuenta,
    total: cuenta.alumnos + cuenta.historial + cuenta.cuotas + cuenta.inscripciones,
  };
}
