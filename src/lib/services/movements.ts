import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/lib/supabase/database.types';

/**
 * Capa de acceso a datos del libro mayor: movimientos y categorías.
 *
 * Los movimientos con `payment_id` nacieron de un pago: son inmutables (un
 * trigger de la base bloquea el UPDATE y el DELETE). Se corrigen anulando el
 * pago, que genera el reverso correspondiente.
 */

export type Movimiento = Tables<'financial_movements'>;
export type Categoria = Tables<'financial_categories'>;

export const POR_PAGINA = 20;

/** Ver la nota de `services/fees.ts`: no se puede llamar a `rangoPagina()` (es 'use client'). */
function rango(pagina: number): [number, number] {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * POR_PAGINA, p * POR_PAGINA - 1];
}

const numero = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export type FilaMovimiento = Movimiento & {
  financial_categories: { id: string; name: string; kind: Enums<'category_kind'> } | null;
  cash_accounts: { id: string; name: string } | null;
  payment_methods: { id: string; name: string } | null;
  students: { id: string; first_name: string; last_name: string } | null;
};

/** Los filtros llegan como texto desde la URL (searchParams). */
export type FiltrosMovimiento = {
  tipo?: string;
  categoria?: string;
  caja?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

const SELECT_MOVIMIENTO = `*,
  financial_categories(id, name, kind),
  cash_accounts(id, name),
  payment_methods(id, name),
  students(id, first_name, last_name)`;

export async function listarMovimientos(
  filtros: FiltrosMovimiento,
): Promise<{ filas: FilaMovimiento[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('financial_movements')
    .select(SELECT_MOVIMIENTO, { count: 'exact' })
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filtros.tipo) query = query.eq('type', filtros.tipo as Enums<'movement_type'>);
  if (filtros.categoria) query = query.eq('category_id', filtros.categoria);
  if (filtros.caja) query = query.eq('cash_account_id', filtros.caja);
  if (filtros.desde) query = query.gte('movement_date', filtros.desde);
  if (filtros.hasta) query = query.lte('movement_date', filtros.hasta);

  const { data, error, count } = await query
    .range(...rango(numero(filtros.pagina) ?? 1))
    .returns<FilaMovimiento[]>();

  if (error) throw error;
  return { filas: data ?? [], total: count ?? 0 };
}

export type TotalesMovimientos = {
  ingresos: number;
  gastos: number;
  /** Los ajustes ya vienen con signo. */
  ajustes: number;
  /** ingresos − gastos + ajustes: la misma cuenta que hace la vista de saldos. */
  resultado: number;
};

/**
 * Totales de lo que se está filtrando (no solo de la página que se ve).
 *
 * Se lee por lotes de 1000 porque la API REST corta ahí: un total de dinero
 * truncado en silencio sería el peor error posible de este módulo.
 */
export async function totalesMovimientos(
  filtros: FiltrosMovimiento,
): Promise<TotalesMovimientos> {
  const supabase = await createClient();

  type FilaTotal = { type: Enums<'movement_type'>; amount_cents: number };
  const filas: FilaTotal[] = [];

  for (let desde = 0; ; desde += 1000) {
    let query = supabase.from('financial_movements').select('type, amount_cents');

    if (filtros.tipo) query = query.eq('type', filtros.tipo as Enums<'movement_type'>);
    if (filtros.categoria) query = query.eq('category_id', filtros.categoria);
    if (filtros.caja) query = query.eq('cash_account_id', filtros.caja);
    if (filtros.desde) query = query.gte('movement_date', filtros.desde);
    if (filtros.hasta) query = query.lte('movement_date', filtros.hasta);

    const { data, error } = await query.range(desde, desde + 999).returns<FilaTotal[]>();
    if (error) throw error;

    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < 1000) break;
  }

  const sumar = (tipo: Enums<'movement_type'>) =>
    filas.filter((f) => f.type === tipo).reduce((s, f) => s + Number(f.amount_cents), 0);

  const ingresos = sumar('ingreso');
  const gastos = sumar('gasto');
  const ajustes = sumar('ajuste');

  return { ingresos, gastos, ajustes, resultado: ingresos - gastos + ajustes };
}

// ── Categorías ──────────────────────────────────────────────────────────────

export async function listarCategorias(kind?: string): Promise<Categoria[]> {
  const supabase = await createClient();

  let query = supabase
    .from('financial_categories')
    .select('*')
    .order('kind')
    .order('sort_order')
    .order('name');

  if (kind === 'ingreso' || kind === 'gasto') query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Categorías activas, para los desplegables del formulario de movimientos. */
export async function listarCategoriasActivas(): Promise<
  Array<Pick<Categoria, 'id' | 'name' | 'kind'>>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('financial_categories')
    .select('id, name, kind')
    .eq('is_active', true)
    .order('kind')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Cuántos movimientos usan una categoría (para no dejar huérfano el historial). */
export async function usosDeCategoria(id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('financial_movements')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id);
  if (error) throw error;
  return count ?? 0;
}

/** Alumnos para el desplegable opcional del movimiento. */
export async function listarAlumnosParaSelect(): Promise<
  Array<{ id: string; first_name: string; last_name: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .is('archived_at', null)
    .order('last_name')
    .order('first_name');
  if (error) throw error;
  return data ?? [];
}

/** Talleres para el desplegable opcional del movimiento. */
export async function listarTalleresParaSelect(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workshops')
    .select('id, name')
    .order('event_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
