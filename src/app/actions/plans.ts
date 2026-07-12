'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { esquemaPlan } from '@/lib/validations/plans';
import { usosDelPlan } from '@/lib/services/plans';
import { pesosToCents } from '@/lib/format';

const RUTA = '/admin/modalidades';

/**
 * Patrón de TODA server action del sistema:
 *   1. `ejecutar()` envuelve el cuerpo: nunca sale una excepción al cliente.
 *   2. `assertAdmin()` falla temprano y con mensaje claro.
 *      (La RLS de la base bloquea igual: esto no es la seguridad, es la UX.)
 *   3. Zod valida en el SERVIDOR, no solo en el formulario.
 *   4. El dinero se convierte a centavos acá, nunca antes.
 *   5. `revalidatePath` refresca el listado.
 */
export async function guardarPlan(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaPlan.parse(datos);

      const supabase = await createClient();
      const fila = {
        name: v.name,
        description: v.description || null,
        classes_included: v.classes_included,
        frequency: v.frequency,
        price_cents: pesosToCents(v.precio),
        is_active: v.is_active,
      };

      if (id) {
        orThrow(await supabase.from('plans').update(fila).eq('id', id).select('id').single());
      } else {
        orThrow(await supabase.from('plans').insert(fila).select('id').single());
      }

      revalidatePath(RUTA);
    },
    id ? 'Modalidad actualizada' : 'Modalidad creada',
  );
}

export async function alternarPlan(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase.from('plans').update({ is_active: activar }).eq('id', id).select('id').single(),
      );
      revalidatePath(RUTA);
    },
    activar ? 'Modalidad activada' : 'Modalidad desactivada',
  );
}

/**
 * Solo se elimina si NO la usa nadie. Si tiene alumnos, grupos o tarifas
 * asociados, borrarla dejaría huérfano ese historial: en ese caso se desactiva.
 */
export async function eliminarPlan(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const usos = await usosDelPlan(id);
    if (usos > 0) {
      throw new Error(
        `No se puede eliminar: hay ${usos} registro(s) usando esta modalidad. Desactivala en su lugar.`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
  }, 'Modalidad eliminada');
}
