'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { esquemaGrupo } from '@/lib/validations/groups';
import { usosDelGrupo } from '@/lib/services/groups';

const RUTA = '/admin/grupos';

/**
 * Patrón de TODA server action del sistema:
 *   1. `ejecutar()` envuelve el cuerpo: nunca sale una excepción al cliente.
 *   2. `assertAdmin()` falla temprano y con mensaje claro.
 *      (La RLS de la base bloquea igual: esto no es la seguridad, es la UX.)
 *   3. Zod valida en el SERVIDOR, no solo en el formulario.
 *   4. `revalidatePath` refresca el listado.
 */
export async function guardarGrupo(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaGrupo.parse(datos);

      const supabase = await createClient();
      const fila = {
        name: v.name,
        weekday: v.weekday,
        start_time: v.start_time,
        end_time: v.end_time,
        capacity: v.capacity,
        plan_id: v.plan_id || null,
        is_active: v.is_active,
        notes: v.notes || null,
      };

      if (id) {
        orThrow(await supabase.from('groups').update(fila).eq('id', id).select('id').single());
      } else {
        orThrow(await supabase.from('groups').insert(fila).select('id').single());
      }

      revalidatePath(RUTA);
      revalidatePath('/admin/alumnos');
    },
    id ? 'Grupo actualizado' : 'Grupo creado',
  );
}

export async function alternarGrupo(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('groups')
          .update({ is_active: activar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA);
    },
    activar ? 'Grupo activado' : 'Grupo desactivado',
  );
}

/**
 * Solo se elimina un grupo que no dejó rastro.
 *
 * Las claves foráneas de `student_groups` y `class_sessions` son `on delete
 * cascade`: borrar un grupo con historia se llevaría puesto el historial de
 * asignaciones y las clases dictadas (y con ellas, la asistencia). Si hay algo,
 * se desactiva: el grupo deja de ofrecerse pero la historia queda.
 */
export async function eliminarGrupo(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const usos = await usosDelGrupo(id);
    if (usos.total > 0) {
      const detalle = [
        usos.alumnos > 0 ? `${usos.alumnos} alumno(s) asignado(s)` : null,
        usos.historial > 0 ? `${usos.historial} registro(s) de historial` : null,
        usos.clases > 0 ? `${usos.clases} clase(s) registrada(s)` : null,
      ]
        .filter(Boolean)
        .join(', ');

      throw new Error(`No se puede eliminar: el grupo tiene ${detalle}. Desactivalo en su lugar.`);
    }

    const supabase = await createClient();
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
  }, 'Grupo eliminado');
}
