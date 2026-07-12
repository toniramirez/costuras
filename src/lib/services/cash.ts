import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';

/**
 * Capa de acceso a datos de cajas y medios de pago.
 *
 * REGLA QUE NO SE NEGOCIA: el saldo de una caja NO se guarda en ningún lado.
 * Se lee de la vista `cash_account_balances` (saldo inicial + Σ movimientos).
 * Nunca se suma a mano ni se persiste: un saldo denormalizado se desincroniza
 * el día que alguien anula un pago.
 */

export type Caja = Tables<'cash_accounts'>;
export type MedioPago = Tables<'payment_methods'>;

export type CajaConSaldo = Caja & { balance_cents: number };

/** Cajas con su saldo calculado. */
export async function listarCajas(): Promise<CajaConSaldo[]> {
  const supabase = await createClient();

  // La vista no trae `description`, así que leemos las dos cosas y las unimos.
  const [cuentas, saldos] = await Promise.all([
    supabase.from('cash_accounts').select('*').order('name'),
    supabase.from('cash_account_balances').select('cash_account_id, balance_cents'),
  ]);

  if (cuentas.error) throw cuentas.error;
  if (saldos.error) throw saldos.error;

  const porId = new Map<string, number>();
  for (const s of saldos.data ?? []) {
    if (s.cash_account_id) porId.set(s.cash_account_id, Number(s.balance_cents ?? 0));
  }

  return (cuentas.data ?? []).map((c) => ({
    ...c,
    balance_cents: porId.get(c.id) ?? Number(c.initial_balance_cents),
  }));
}

/** Cajas activas, para los desplegables (cobros, movimientos, ajustes). */
export async function listarCajasActivas(): Promise<Array<Pick<Caja, 'id' | 'name' | 'type'>>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cash_accounts')
    .select('id, name, type')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Medios de pago activos, para los desplegables. */
export async function listarMediosPago(): Promise<
  Array<Pick<MedioPago, 'id' | 'name' | 'code' | 'requires_proof'>>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, name, code, requires_proof')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * Cuántos movimientos tiene una caja.
 * Una caja con historial NO se borra (la base lo impide con `on delete restrict`):
 * se desactiva, así el libro mayor sigue cerrando.
 */
export async function movimientosDeCaja(id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('financial_movements')
    .select('*', { count: 'exact', head: true })
    .eq('cash_account_id', id);
  if (error) throw error;
  return count ?? 0;
}
