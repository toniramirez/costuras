'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { esquemaTarifa } from '@/lib/validations/rates';
import { usosDeTarifa } from '@/lib/services/rates';
import { pesosToCents } from '@/lib/format';

const RUTA = '/admin/tarifas';

/**
 * Patrón de TODA server action del sistema:
 *   1. `ejecutar()` envuelve el cuerpo: nunca sale una excepción al cliente.
 *   2. `assertAdmin()` falla temprano y con mensaje claro.
 *   3. Zod valida en el SERVIDOR, no solo en el formulario.
 *   4. El dinero se convierte a centavos ACÁ, nunca antes y nunca con floats.
 *   5. `revalidatePath` refresca el listado.
 *
 * Cambiar el importe de una tarifa NO toca las cuotas ya emitidas: `monthly_fees`
 * guarda su propio `final_amount_cents` congelado al emitirse. El importe nuevo
 * rige de la próxima emisión en adelante.
 */
export async function guardarTarifa(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaTarifa.parse(datos);

      const supabase = await createClient();
      const fila = {
        name: v.name,
        plan_id: v.plan_id || null,
        valid_from: v.valid_from || null,
        valid_until: v.valid_until || null,
        amount_cents: pesosToCents(v.importe),
        is_active: v.is_active,
        notes: v.notes || null,
      };

      if (id) {
        orThrow(await supabase.from('rates').update(fila).eq('id', id).select('id').single());
      } else {
        orThrow(await supabase.from('rates').insert(fila).select('id').single());
      }

      revalidatePath(RUTA);
      revalidatePath('/admin/alumnos');
    },
    id ? 'Tarifa actualizada' : 'Tarifa creada',
  );
}

export async function alternarTarifa(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('rates')
          .update({ is_active: activar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA);
    },
    activar ? 'Tarifa activada' : 'Tarifa desactivada',
  );
}

/**
 * Solo se elimina una tarifa que no usa nadie.
 *
 * Las claves foráneas son `on delete set null`: borrarla no fallaría, dejaría en
 * silencio sin tarifa a los alumnos y sin referencia al historial y a las cuotas
 * emitidas. Si tiene uso, se desactiva.
 */
export async function eliminarTarifa(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const usos = await usosDeTarifa(id);
    if (usos.total > 0) {
      const detalle = [
        usos.alumnos > 0 ? `${usos.alumnos} alumno(s)` : null,
        usos.historial > 0 ? `${usos.historial} registro(s) de historial` : null,
        usos.cuotas > 0 ? `${usos.cuotas} cuota(s) emitida(s)` : null,
        usos.inscripciones > 0 ? `${usos.inscripciones} inscripción(es)` : null,
      ]
        .filter(Boolean)
        .join(', ');

      throw new Error(`No se puede eliminar: la tarifa la usan ${detalle}. Desactivala en su lugar.`);
    }

    const supabase = await createClient();
    const { error } = await supabase.from('rates').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
  }, 'Tarifa eliminada');
}
