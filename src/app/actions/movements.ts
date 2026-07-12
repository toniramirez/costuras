'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents } from '@/lib/format';
import { usosDeCategoria } from '@/lib/services/movements';
import { esquemaCategoria, esquemaMovimiento } from '@/lib/validations/movements';

const RUTA = '/admin/movimientos';
const RUTA_CATEGORIAS = '/admin/movimientos/categorias';

/**
 * Movimientos del libro mayor.
 *
 * Dos clases de movimiento NO se tocan desde acá:
 *   · los que nacieron de un pago (`payment_id`): un trigger de la base bloquea
 *     el UPDATE y el DELETE. Se corrigen anulando el pago.
 *   · los reversos (`is_reversal`): los generó una anulación. Editarlos sería
 *     falsear la corrección.
 * El chequeo se hace acá para dar un mensaje claro; la base bloquea igual.
 */
async function verificarEditable(id: string) {
  const supabase = await createClient();
  const fila = orThrow(
    await supabase
      .from('financial_movements')
      .select('payment_id, is_reversal, type')
      .eq('id', id)
      .single(),
  );
  if (!fila) throw new Error('El movimiento no existe.');

  if (fila.payment_id) {
    throw new Error(
      'Este movimiento se generó con un pago y no se modifica ni se borra. Si el pago fue un error, anulalo: la base genera el reverso.',
    );
  }
  if (fila.is_reversal) {
    throw new Error('Este movimiento es el reverso de un pago anulado y no se puede modificar.');
  }

  return fila;
}

/** Alta y edición de un ingreso o un gasto. El importe llega en PESOS. */
export async function guardarMovimiento(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const perfil = await assertAdmin();
      const v = esquemaMovimiento.parse(datos);

      if (id) {
        const actual = await verificarEditable(id);
        if (actual.type === 'ajuste') {
          throw new Error('Los ajustes de caja no se editan. Borralo y asentá uno nuevo.');
        }
      }

      const supabase = await createClient();
      const fila = {
        type: v.type,
        movement_date: v.movement_date,
        category_id: v.category_id,
        description: v.description,
        amount_cents: pesosToCents(v.importe), // ingreso/gasto: siempre positivo
        cash_account_id: v.cash_account_id,
        payment_method_id: v.payment_method_id,
        student_id: v.student_id || null,
        workshop_id: v.workshop_id || null,
        notes: v.notes || null,
      };

      if (id) {
        orThrow(
          await supabase.from('financial_movements').update(fila).eq('id', id).select('id').single(),
        );
      } else {
        orThrow(
          await supabase
            .from('financial_movements')
            .insert({ ...fila, created_by: perfil.id })
            .select('id')
            .single(),
        );
      }

      revalidatePath(RUTA);
      revalidatePath('/admin/cajas');
      revalidatePath('/admin');
    },
    id ? 'Movimiento actualizado' : 'Movimiento registrado',
  );
}

export async function eliminarMovimiento(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    await verificarEditable(id);

    const supabase = await createClient();
    const { error } = await supabase.from('financial_movements').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
    revalidatePath('/admin/cajas');
    revalidatePath('/admin');
  }, 'Movimiento eliminado');
}

// ── Categorías ──────────────────────────────────────────────────────────────

export async function guardarCategoria(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaCategoria.parse(datos);

      const supabase = await createClient();
      const fila = {
        name: v.name,
        kind: v.kind,
        sort_order: v.sort_order,
        is_active: v.is_active,
      };

      if (id) {
        orThrow(
          await supabase
            .from('financial_categories')
            .update(fila)
            .eq('id', id)
            .select('id')
            .single(),
        );
      } else {
        orThrow(
          await supabase.from('financial_categories').insert(fila).select('id').single(),
        );
      }

      revalidatePath(RUTA_CATEGORIAS);
      revalidatePath(RUTA);
    },
    id ? 'Categoría actualizada' : 'Categoría creada',
  );
}

export async function alternarCategoria(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('financial_categories')
          .update({ is_active: activar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA_CATEGORIAS);
      revalidatePath(RUTA);
    },
    activar ? 'Categoría activada' : 'Categoría desactivada',
  );
}

/**
 * Las categorías del sistema no se borran (las usan las funciones de la base
 * para clasificar los cobros) y las que tienen movimientos, tampoco: se
 * desactivan, así el historial sigue teniendo sentido.
 */
export async function eliminarCategoria(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const supabase = await createClient();
    const categoria = orThrow(
      await supabase.from('financial_categories').select('is_system, name').eq('id', id).single(),
    );
    if (!categoria) throw new Error('La categoría no existe.');

    if (categoria.is_system) {
      throw new Error(
        `«${categoria.name}» es una categoría del sistema: la usan los cobros automáticos. Podés desactivarla, pero no eliminarla.`,
      );
    }

    const usos = await usosDeCategoria(id);
    if (usos > 0) {
      throw new Error(
        `No se puede eliminar: hay ${usos} movimiento(s) en esta categoría. Desactivala en su lugar.`,
      );
    }

    const { error } = await supabase.from('financial_categories').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA_CATEGORIAS);
    revalidatePath(RUTA);
  }, 'Categoría eliminada');
}
