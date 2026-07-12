'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import {
  esquemaCancelacion,
  esquemaDestino,
  esquemaEmision,
} from '@/lib/validations/recovery';

const RUTA = '/admin/recuperaciones';
const RUTA_ASISTENCIA = '/admin/asistencia';
const RUTA_HISTORIAL = '/admin/asistencia/historial';

/**
 * Todas estas actions son una cáscara fina alrededor de las funciones de la base.
 *
 * La lógica (que la ausencia sea justificada, que no haya dos créditos por la
 * misma falta, el vencimiento según `academy_settings.recovery_validity_days`,
 * el cupo del grupo, el anti doble uso) YA ESTÁ ahí y está probada. Acá solo
 * validamos la forma de los datos, chequeamos permisos y refrescamos la vista.
 *
 * Los errores de esas funciones vienen redactados en español: `mapError()` los
 * pasa tal cual y la UI los muestra sin tocarlos.
 */

/** Genera el crédito a partir de una ausencia. `force` = excepción manual. */
export async function generarRecuperacion(datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaEmision.parse(datos);

    const supabase = await createClient();
    const id = orThrow(
      await supabase.rpc('issue_recovery_credit', {
        p_attendance_id: v.attendance_id,
        p_reason: v.reason || undefined,
        p_force: v.force,
      }),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_HISTORIAL);
    return { id };
  }, 'Recuperación generada');
}

/**
 * Reserva el crédito en un grupo y una fecha.
 * Si el grupo no tiene cupo, o la fecha pasa el vencimiento, la base rechaza.
 */
export async function reservarRecuperacion(datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaDestino.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('reserve_recovery_credit', {
        p_credit_id: v.credit_id,
        p_group_id: v.group_id,
        p_date: v.date,
      }),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_ASISTENCIA);
  }, 'Recuperación reservada');
}

/**
 * Registra el uso: el crédito queda 'utilizada' y la clase aparece en asistencia
 * como 'recuperacion'. Un crédito no puede usarse dos veces: lo impide la base.
 */
export async function usarRecuperacion(datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaDestino.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('use_recovery_credit', {
        p_credit_id: v.credit_id,
        p_group_id: v.group_id,
        p_date: v.date,
      }),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_ASISTENCIA);
    revalidatePath(RUTA_HISTORIAL);
  }, 'Recuperación registrada');
}

export async function cancelarRecuperacion(datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaCancelacion.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('cancel_recovery_credit', {
        p_credit_id: v.credit_id,
        p_reason: v.reason,
      }),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_ASISTENCIA);
  }, 'Recuperación cancelada');
}

/** Vence los créditos pasados de fecha. Devuelve cuántos se vencieron. */
export async function vencerRecuperaciones() {
  return ejecutar(async () => {
    await assertAdmin();

    const supabase = await createClient();
    const vencidas = orThrow(await supabase.rpc('expire_recovery_credits'));

    revalidatePath(RUTA);
    return { vencidas: vencidas ?? 0 };
  });
}
