'use server';

import { revalidatePath } from 'next/cache';

import { assertStudent } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents } from '@/lib/format';
import {
  esquemaFotoPerfil,
  esquemaPerfil,
  esquemaSubirComprobante,
} from '@/lib/validations/student-portal';

const RUTA_INICIO = '/alumno';
const RUTA_PAGOS = '/alumno/pagos';
const RUTA_PERFIL = '/alumno/perfil';

/**
 * Todas las escrituras del alumno. Son POCAS a propósito: un comprobante, sus
 * datos de contacto y su foto. **El alumno nunca modifica dinero** — ni el
 * importe de una cuota, ni su estado, ni un pago. La RLS y los triggers lo
 * impiden aunque alguien arme la petición a mano; acá fallamos temprano y con un
 * mensaje que se entienda.
 */

/**
 * Registra el comprobante de transferencia que el alumno ya subió al bucket.
 *
 * El archivo viaja desde el NAVEGADOR con `subirArchivo()` (así se ve el
 * progreso real). Esta action solo inserta la fila.
 *
 * Lo que pasa después NO lo hacemos nosotros: un trigger de la base pone la
 * cuota en `comprobante_pendiente` y le avisa a la administradora. Duplicarlo
 * acá sería reimplementar lógica que ya está probada en la base.
 */
export async function subirComprobante(datos: unknown) {
  return ejecutar(
    async () => {
      const alumno = await assertStudent();
      const v = esquemaSubirComprobante.parse(datos);

      // La ruta la arma el navegador: verificamos que sea la del alumno y la de
      // ESTA deuda. La política del bucket ya obliga a `proofs/<student_id>/…`,
      // pero `file_path` es una columna de texto y no se guarda a ciegas.
      const prefijo = `${alumno.id}/${v.feeId}/`;
      if (!v.filePath.startsWith(prefijo)) {
        throw new Error('El archivo no corresponde a esta deuda. Probá de nuevo.');
      }

      const supabase = await createClient();

      orThrow(
        await supabase
          .from('payment_proofs')
          .insert({
            student_id: alumno.id,
            monthly_fee_id: v.tipo === 'cuota' ? v.feeId : null,
            registration_fee_id: v.tipo === 'matricula' ? v.feeId : null,
            file_path: v.filePath,
            informed_amount_cents: pesosToCents(v.importe),
            reference: v.reference || null,
            note: v.note || null,
          })
          .select('id')
          .single(),
      );

      revalidatePath(RUTA_PAGOS);
      revalidatePath(RUTA_INICIO);
    },
    'Comprobante enviado. La academia lo va a revisar.',
  );
}

/**
 * Datos de contacto del alumno.
 *
 * Tarifa, grupo, modalidad y estado NO están acá: los administra la academia.
 * El trigger `students_guard_protected_columns()` los bloquea igual.
 */
export async function guardarPerfil(datos: unknown) {
  return ejecutar(async () => {
    const alumno = await assertStudent();
    const v = esquemaPerfil.parse(datos);

    const supabase = await createClient();

    orThrow(
      await supabase
        .from('students')
        .update({
          phone: v.phone || null,
          // Los correos se normalizan en la aplicación (la base ya no usa citext).
          email: v.email ? v.email.toLowerCase() : null,
          birth_date: v.birth_date || null,
          address: v.address || null,
          emergency_contact: v.emergency_contact || null,
          emergency_phone: v.emergency_phone || null,
        })
        .eq('id', alumno.id)
        .select('id')
        .single(),
    );

    revalidatePath(RUTA_PERFIL);
  }, 'Tus datos se actualizaron');
}

/**
 * Foto de perfil, ya subida al bucket `avatars` desde el navegador.
 *
 * Se guarda en las dos tablas: la foto es de la persona (`profiles`) y también
 * la que ve la academia en su ficha (`students`). Son dos columnas distintas en
 * la base; dejarlas desincronizadas sería peor.
 */
export async function actualizarFotoPerfil(datos: unknown) {
  return ejecutar(async () => {
    const alumno = await assertStudent();
    const v = esquemaFotoPerfil.parse(datos);

    if (!alumno.profile_id) {
      throw new Error('Tu ficha no tiene un usuario asociado. Avisale a la academia.');
    }
    if (!v.filePath.startsWith(`${alumno.profile_id}/`)) {
      throw new Error('La ruta de la foto no es válida. Probá de nuevo.');
    }

    const supabase = await createClient();

    orThrow(
      await supabase
        .from('students')
        .update({ avatar_url: v.filePath })
        .eq('id', alumno.id)
        .select('id')
        .single(),
    );

    orThrow(
      await supabase
        .from('profiles')
        .update({ avatar_url: v.filePath })
        .eq('id', alumno.profile_id)
        .select('id')
        .single(),
    );

    revalidatePath(RUTA_PERFIL);
  }, 'Foto actualizada');
}
