import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';

export type Plan = Tables<'plans'>;

export type FiltrosPlan = {
  q?: string;
  activo?: string; // 'si' | 'no' | undefined
};

/**
 * Capa de acceso a datos.
 *
 * Los servicios SOLO leen. Las escrituras van por server actions, para que
 * pasen sí o sí por la validación de Zod y el chequeo de permisos.
 * Toda consulta usa el cliente con sesión: la RLS decide qué filas se ven.
 */
export async function listarPlanes(filtros: FiltrosPlan = {}): Promise<Plan[]> {
  const supabase = await createClient();

  let query = supabase.from('plans').select('*').order('sort_order').order('name');

  if (filtros.q) {
    query = query.ilike('name', `%${filtros.q}%`);
  }
  if (filtros.activo === 'si') query = query.eq('is_active', true);
  if (filtros.activo === 'no') query = query.eq('is_active', false);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Modalidades activas, para los desplegables de otros formularios. */
export async function listarPlanesActivos(): Promise<Pick<Plan, 'id' | 'name' | 'price_cents'>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('plans')
    .select('id, name, price_cents')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Cuántos registros dependen de una modalidad (para no romper historial al borrar). */
export async function usosDelPlan(id: string): Promise<number> {
  const supabase = await createClient();

  const [alumnos, grupos, tarifas] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('plan_id', id),
    supabase.from('groups').select('*', { count: 'exact', head: true }).eq('plan_id', id),
    supabase.from('rates').select('*', { count: 'exact', head: true }).eq('plan_id', id),
  ]);

  return (alumnos.count ?? 0) + (grupos.count ?? 0) + (tarifas.count ?? 0);
}
