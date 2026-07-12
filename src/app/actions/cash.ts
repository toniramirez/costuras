'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents } from '@/lib/format';
import { movimientosDeCaja } from '@/lib/services/cash';
import { esquemaAjusteCaja, esquemaCaja } from '@/lib/validations/cash';

const RUTA = '/admin/cajas';

/**
 * Cajas.
 *
 * El SALDO no se escribe nunca: sale de la vista `cash_account_balances`.
 * Lo único que se guarda es el saldo INICIAL, y solo al crear la caja: si se
 * pudiera editar después, el saldo cambiaría de golpe sin dejar rastro en el
 * libro mayor. Para corregir un saldo existe el ajuste (ver `ajustarSaldo`).
 */
export async function guardarCaja(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaCaja.parse(datos);

      const supabase = await createClient();

      if (id) {
        // Sin `initial_balance_cents`: el saldo inicial de una caja en uso no se
        // retoca. Lo que haya que corregir se asienta como ajuste.
        orThrow(
          await supabase
            .from('cash_accounts')
            .update({
              name: v.name,
              description: v.description || null,
              type: v.type,
              is_active: v.is_active,
            })
            .eq('id', id)
            .select('id')
            .single(),
        );
      } else {
        orThrow(
          await supabase
            .from('cash_accounts')
            .insert({
              name: v.name,
              description: v.description || null,
              type: v.type,
              initial_balance_cents: pesosToCents(v.saldo_inicial),
              is_active: v.is_active,
            })
            .select('id')
            .single(),
        );
      }

      revalidatePath(RUTA);
      revalidatePath('/admin');
    },
    id ? 'Caja actualizada' : 'Caja creada',
  );
}

export async function alternarCaja(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('cash_accounts')
          .update({ is_active: activar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA);
    },
    activar ? 'Caja activada' : 'Caja desactivada',
  );
}

/**
 * Solo se elimina una caja SIN movimientos. Con historial, borrarla dejaría el
 * libro mayor sin su contrapartida (la base lo impide con `on delete restrict`):
 * en ese caso se desactiva.
 */
export async function eliminarCaja(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const usos = await movimientosDeCaja(id);
    if (usos > 0) {
      throw new Error(
        `No se puede eliminar: la caja tiene ${usos} movimiento(s) registrados. Desactivala en su lugar.`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from('cash_accounts').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
  }, 'Caja eliminada');
}

/**
 * Ajuste de saldo.
 *
 * El saldo NO se edita: se asienta un movimiento de tipo `ajuste` (el importe
 * lleva signo) con una descripción obligatoria. Así el saldo sigue siendo el
 * resultado del libro mayor y queda registrado quién lo corrigió y por qué.
 */
export async function ajustarSaldo(datos: unknown) {
  return ejecutar(async () => {
    const perfil = await assertAdmin();
    const v = esquemaAjusteCaja.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase
        .from('financial_movements')
        .insert({
          type: 'ajuste',
          movement_date: v.movement_date,
          amount_cents: pesosToCents(v.importe), // con signo: negativo resta
          cash_account_id: v.cash_account_id,
          description: v.description,
          created_by: perfil.id,
        })
        .select('id')
        .single(),
    );

    revalidatePath(RUTA);
    revalidatePath('/admin/movimientos');
    revalidatePath('/admin');
  }, 'Ajuste asentado. El saldo de la caja quedó corregido.');
}
