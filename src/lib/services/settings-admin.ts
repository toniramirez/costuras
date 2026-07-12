import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { inicioDelDia, finDelDia } from '@/lib/export';
import { POR_PAGINA, paginaDe, rangoPagina } from '@/lib/pagination';
import type { Tables } from '@/lib/supabase/database.types';

/**
 * Lecturas de la configuración y de la auditoría.
 *
 * La configuración en sí (`getSettings`, `getBranding`) vive en `@/lib/settings`
 * y se importa DE AHÍ: acá solo están las lecturas que ese módulo no cubre
 * (medios de pago y registro de auditoría).
 *
 * Como todo servicio: SOLO LEE. Las escrituras van por server actions.
 */

export type MedioDePago = Tables<'payment_methods'>;
export type RegistroAuditoria = Tables<'audit_logs'>;

// ── Medios de pago ──────────────────────────────────────────────────────────

export async function listarMediosDePago(): Promise<MedioDePago[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/**
 * Cuántos registros usan un medio de pago.
 *
 * Si alguno lo usa, borrarlo dejaría huérfano el historial de dinero: en ese
 * caso se desactiva, no se elimina. Mismo criterio que con las modalidades.
 */
export async function usosDelMedioDePago(id: string): Promise<number> {
  const supabase = await createClient();

  const [pagos, cuotas, matriculas, movimientos] = await Promise.all([
    supabase.from('payments').select('*', { count: 'exact', head: true }).eq('method_id', id),
    supabase
      .from('monthly_fees')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method_id', id),
    supabase
      .from('registration_fees')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method_id', id),
    supabase
      .from('financial_movements')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method_id', id),
  ]);

  return (
    (pagos.count ?? 0) + (cuotas.count ?? 0) + (matriculas.count ?? 0) + (movimientos.count ?? 0)
  );
}

// ── Auditoría ───────────────────────────────────────────────────────────────

export type FiltrosAuditoria = {
  entidad?: string;
  accion?: string;
  /** Búsqueda parcial sobre el correo de quien hizo el cambio. */
  usuario?: string;
  /** "YYYY-MM-DD" (inclusive, en hora de Argentina). */
  desde?: string;
  hasta?: string;
  /** Llega crudo de los searchParams. */
  pagina?: string;
};

export type PaginaAuditoria = {
  filas: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Listado de auditoría, del más reciente al más viejo.
 *
 * La tabla es INMUTABLE (solo la escriben triggers SECURITY DEFINER) y la RLS
 * la deja leer únicamente a la administradora, así que acá no hace falta ningún
 * chequeo extra: si consulta otro rol, la base devuelve cero filas.
 */
export async function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<PaginaAuditoria> {
  const supabase = await createClient();

  const pagina = paginaDe(filtros.pagina);
  const [primera, ultima] = rangoPagina(pagina);

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(primera, ultima);

  if (filtros.entidad) query = query.eq('entity_type', filtros.entidad);
  if (filtros.accion) query = query.eq('action', filtros.accion);
  if (filtros.usuario) query = query.ilike('actor_email', `%${filtros.usuario}%`);
  // `created_at` es timestamptz: la fecha suelta se ancla al huso de Argentina.
  if (filtros.desde) query = query.gte('created_at', inicioDelDia(filtros.desde));
  if (filtros.hasta) query = query.lte('created_at', finDelDia(filtros.hasta));

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    filas: data ?? [],
    total: count ?? 0,
    pagina,
    porPagina: POR_PAGINA,
  };
}
