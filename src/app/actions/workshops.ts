'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents } from '@/lib/format';
import {
  esquemaTaller,
  esquemaInscripcionAlumno,
  esquemaInscripcionExterna,
  esquemaConfirmarInscripcion,
} from '@/lib/validations/workshops';
import { BUCKET_TALLERES, inscripcionesDelTallerCount } from '@/lib/services/workshops';
import type { Enums } from '@/lib/supabase/database.types';

const RUTA = '/admin/talleres';

/** Refresca el listado, la ficha del taller y la vista del alumno. */
function refrescar(tallerId?: string) {
  revalidatePath(RUTA);
  if (tallerId) revalidatePath(`${RUTA}/${tallerId}`);
  revalidatePath('/alumno/talleres');
}

/** '' → null. La base guarda null, no cadenas vacías. */
const oNulo = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

/**
 * Igual que `orThrow`, pero además garantiza que vino una fila.
 * PostgREST tipa `data` como nullable incluso con `.single()`, que en realidad
 * devuelve una fila o falla. Esto lo estrecha sin mentirle al compilador.
 */
function filaDe<T>(respuesta: { data: T; error: unknown }): NonNullable<T> {
  const fila = orThrow(respuesta);
  if (fila == null) throw new Error('No encontramos el registro.');
  return fila;
}

/**
 * Fecha del formulario ("2026-07-11") → instante para una columna timestamptz.
 *
 * Se ancla al MEDIODÍA de Córdoba (UTC-3, sin horario de verano). La base hace
 * `p_paid_at::date` para el movimiento de caja: si mandáramos la medianoche, el
 * cambio de huso podría correr el movimiento un día. Al mediodía, la fecha es la
 * misma en Córdoba y en UTC.
 */
function instanteDePago(fecha: string): string {
  return `${fecha}T12:00:00-03:00`;
}

// ── Taller (CRUD) ────────────────────────────────────────────────────────────

/**
 * Crea o actualiza un taller. Devuelve el id: la imagen se sube DESPUÉS, porque
 * la ruta del bucket es `workshops/<workshop_id>/<archivo>` y hasta que el taller
 * no existe no hay id (y la política de Storage rechazaría la subida).
 */
export async function guardarTaller(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaTaller.parse(datos);

      const supabase = await createClient();
      const fila = {
        name: v.name,
        description: oNulo(v.description),
        category: oNulo(v.category),
        responsible_name: oNulo(v.responsible_name),
        event_date: oNulo(v.event_date),
        start_time: oNulo(v.start_time),
        end_time: oNulo(v.end_time),
        capacity: v.capacity,
        price_cents: pesosToCents(v.precio),
        materials_included: oNulo(v.materials_included),
        materials_to_bring: oNulo(v.materials_to_bring),
        location: oNulo(v.location),
        status: v.status,
        cash_account_id: oNulo(v.cash_account_id),
      };

      const guardado = id
        ? filaDe(await supabase.from('workshops').update(fila).eq('id', id).select('id').single())
        : filaDe(await supabase.from('workshops').insert(fila).select('id').single());

      refrescar(guardado.id);
      return { id: guardado.id };
    },
    id ? 'Taller actualizado' : 'Taller creado',
  );
}

/** Guarda la ruta de la imagen ya subida al bucket `workshops`. */
export async function actualizarImagenTaller(id: string, path: string) {
  return ejecutar(async () => {
    await assertAdmin();

    // La ruta tiene que vivir dentro de la carpeta del taller: es lo que exige la
    // política de Storage y lo que evita pisar la imagen de otro.
    if (!path.startsWith(`${id}/`)) {
      throw new Error('La ruta de la imagen no corresponde a este taller.');
    }

    const supabase = await createClient();
    orThrow(
      await supabase.from('workshops').update({ image_path: path }).eq('id', id).select('id').single(),
    );

    refrescar(id);
  }, 'Imagen actualizada');
}

/** Quita la imagen del taller (de la ficha y del bucket). */
export async function quitarImagenTaller(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const taller = filaDe(
      await supabase.from('workshops').select('image_path').eq('id', id).single(),
    );

    orThrow(
      await supabase.from('workshops').update({ image_path: null }).eq('id', id).select('id').single(),
    );

    if (taller.image_path) {
      await supabase.storage.from(BUCKET_TALLERES).remove([taller.image_path]);
    }

    refrescar(id);
  }, 'Imagen quitada');
}

export async function cambiarEstadoTaller(id: string, estado: Enums<'workshop_status'>) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();
    orThrow(
      await supabase.from('workshops').update({ status: estado }).eq('id', id).select('id').single(),
    );
    refrescar(id);
  }, 'Estado del taller actualizado');
}

/**
 * Solo se elimina un taller SIN inscripciones: borrarlo con gente anotada se
 * llevaría puesto el historial (y los pagos asociados). En ese caso se cancela.
 */
export async function eliminarTaller(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const inscriptos = await inscripcionesDelTallerCount(id);
    if (inscriptos > 0) {
      throw new Error(
        `No se puede eliminar: el taller tiene ${inscriptos} inscripción(es). Cancelalo en su lugar.`,
      );
    }

    const supabase = await createClient();
    const taller = filaDe(
      await supabase.from('workshops').select('image_path').eq('id', id).single(),
    );

    const { error } = await supabase.from('workshops').delete().eq('id', id);
    if (error) throw error;

    if (taller.image_path) {
      await supabase.storage.from(BUCKET_TALLERES).remove([taller.image_path]);
    }

    refrescar();
  }, 'Taller eliminado');
}

// ── Inscripciones ────────────────────────────────────────────────────────────
//
// TODA la lógica de cupo y lista de espera vive en la base y está probada.
// Acá solo llamamos a las funciones: si no hay lugar, `register_to_workshop`
// manda a lista de espera sola, respetando el orden de llegada.

/** Inscribe a un alumno de la academia. */
export async function inscribirAlumno(tallerId: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaInscripcionAlumno.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('register_to_workshop', {
        p_workshop_id: tallerId,
        p_student_id: v.student_id,
        p_notes: oNulo(v.notes) ?? undefined,
      }),
    );

    refrescar(tallerId);
  }, 'Inscripción registrada');
}

/** Inscribe a una persona externa (carga manual: no tiene ficha de alumno). */
export async function inscribirExterno(tallerId: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaInscripcionExterna.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('register_to_workshop', {
        p_workshop_id: tallerId,
        p_first_name: v.first_name,
        p_last_name: v.last_name,
        p_phone: v.phone,
        p_email: oNulo(v.email) ?? undefined,
        p_notes: oNulo(v.notes) ?? undefined,
      }),
    );

    refrescar(tallerId);
  }, 'Inscripción registrada');
}

/**
 * Confirma el pago de una inscripción.
 *
 * `confirm_workshop_registration` registra el pago, emite el recibo, genera el
 * ingreso y RECIÉN AHÍ ocupa el lugar. Si el cupo se llenó mientras tanto, la
 * función rechaza la confirmación con su propio mensaje.
 */
export async function confirmarInscripcion(
  tallerId: string,
  inscripcionId: string,
  datos: unknown,
) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaConfirmarInscripcion.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase.rpc('confirm_workshop_registration', {
        p_registration_id: inscripcionId,
        p_method_id: v.method_id,
        p_cash_account_id: v.cash_account_id,
        p_paid_at: instanteDePago(v.paid_at),
        p_reference: oNulo(v.reference) ?? undefined,
      }),
    );

    refrescar(tallerId);
  }, 'Pago confirmado: el lugar quedó ocupado');
}

/**
 * Promueve a la primera persona de la lista de espera.
 * OJO: queda en «pendiente de pago», NO confirmada (salvo taller gratuito).
 * El lugar recién se ocupa cuando se confirma el pago.
 */
export async function promoverDeListaEspera(tallerId: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const supabase = await createClient();
    orThrow(await supabase.rpc('promote_from_waitlist', { p_workshop_id: tallerId }));

    refrescar(tallerId);
  }, 'Persona promovida: quedó pendiente de pago');
}

/** Cancela una inscripción. El pago ya registrado NO se anula automáticamente. */
export async function cancelarInscripcion(tallerId: string, inscripcionId: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const supabase = await createClient();
    orThrow(
      await supabase
        .from('workshop_registrations')
        .update({ status: 'cancelada', waitlist_position: null })
        .eq('id', inscripcionId)
        .select('id')
        .single(),
    );

    refrescar(tallerId);
  }, 'Inscripción cancelada');
}

/**
 * Marca la asistencia después del taller.
 * Solo tiene sentido sobre inscripciones confirmadas: quien no pagó nunca ocupó
 * un lugar.
 */
export async function marcarAsistencia(
  tallerId: string,
  inscripcionId: string,
  asistio: boolean,
) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();

      const inscripcion = filaDe(
        await supabase
          .from('workshop_registrations')
          .select('status')
          .eq('id', inscripcionId)
          .single(),
      );

      const marcables: Enums<'workshop_reg_status'>[] = ['confirmada', 'asistio', 'no_asistio'];
      if (!marcables.includes(inscripcion.status)) {
        throw new Error(
          'Solo se puede marcar la asistencia de una inscripción confirmada (con el pago registrado).',
        );
      }

      orThrow(
        await supabase
          .from('workshop_registrations')
          .update({ status: asistio ? 'asistio' : 'no_asistio' })
          .eq('id', inscripcionId)
          .select('id')
          .single(),
      );

      refrescar(tallerId);
    },
    asistio ? 'Marcada como asistió' : 'Marcada como no asistió',
  );
}
