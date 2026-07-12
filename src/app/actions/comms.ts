'use server';

import { revalidatePath } from 'next/cache';
import { fromZonedTime } from 'date-fns-tz';

import { assertAdmin, assertStudent, getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { TIMEZONE } from '@/lib/format';
import {
  BUCKET_COMUNICADOS,
  BUCKET_NOVEDADES,
  esquemaComunicado,
  esquemaNovedad,
} from '@/lib/validations/comms';
import { resolverDestinatarios } from '@/lib/services/comms';

/**
 * Novedades, comunicados y notificaciones.
 *
 * El patrón es el de siempre: `ejecutar()` envuelve todo, el permiso se chequea
 * temprano, Zod valida TAMBIÉN en el servidor y al final se revalida la ruta.
 *
 * Lo propio de este módulo: al publicar o enviar, el alcance (`todos`, `grupo`,
 * `alumno`, `cuota_pendiente`, `taller`) se EXPANDE a una fila por alumno en
 * announcement_recipients / communication_recipients. Con eso, «quién leyó y
 * quién no» es una consulta directa y la RLS del alumno mira una sola tabla.
 *
 * Los destinatarios existen SI Y SOLO SI la pieza está publicada/enviada. Un
 * borrador no le llega a nadie, y sus adjuntos tampoco tienen que ser legibles:
 * la política del bucket autoriza la carpeta `<id>/` justamente mirando la tabla
 * de destinatarios.
 */

const RUTA_COMUNICADOS = '/admin/comunicados';
const RUTA_NOVEDADES = '/admin/novedades';

// ── Fechas ──────────────────────────────────────────────────────────────────
// El formulario entrega "YYYY-MM-DD". La base guarda timestamptz. La conversión
// se hace en la zona de Córdoba: `new Date('2026-07-20')` sería medianoche UTC y
// en Argentina caería el día anterior.

/** "2026-07-20" → las 00:00 de ese día en Córdoba. */
function inicioDelDia(fecha: string): string {
  return fromZonedTime(`${fecha}T00:00:00`, TIMEZONE).toISOString();
}

/** "2026-07-20" → el final de ese día en Córdoba (vale «todo el 20»). */
function finDelDia(fecha: string): string {
  return fromZonedTime(`${fecha}T23:59:59.999`, TIMEZONE).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// Comunicados
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guarda un comunicado. Con `enviar = true` lo manda en el acto.
 *
 * El `id` lo genera el formulario ANTES de subir los adjuntos: la política del
 * bucket exige que la ruta sea `<communication_id>/<archivo>`, así que la carpeta
 * se decide antes de que exista la fila.
 *
 * Se envía siempre desde el formulario, nunca «a ciegas» desde el listado: así
 * la administradora ve exactamente a quién le va a llegar justo antes de mandarlo.
 */
export async function guardarComunicado(id: string, datos: unknown, enviar = false) {
  return ejecutar(
    async () => {
      const perfil = await assertAdmin();
      const v = esquemaComunicado.parse(datos);

      const supabase = await createClient();

      const { data: existente } = await supabase
        .from('communications')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();

      // Un comunicado enviado es un registro: ya lo leyeron. No se reescribe.
      if (existente && existente.status !== 'borrador') {
        throw new Error('Este comunicado ya fue enviado: no se puede editar.');
      }

      const { ids, label } = await resolverDestinatarios({
        scope: v.scope,
        group_id: v.group_id,
        workshop_id: v.workshop_id,
        student_ids: v.student_ids,
      });

      if (enviar && ids.length === 0) {
        throw new Error('Ningún alumno cumple con los destinatarios elegidos.');
      }

      // Se guarda SIEMPRE como borrador y recién al final se marca como enviado.
      // Si la expansión de destinatarios falla, queda un borrador y se puede
      // reintentar; nunca un «enviado» que en realidad no le llegó a nadie.
      const fila = {
        id,
        subject: v.subject,
        body: v.body,
        priority: v.priority,
        attachments: v.attachments,
        expires_at: v.expires_at ? finDelDia(v.expires_at) : null,
        scope: v.scope,
        scope_label: label,
        status: 'borrador' as const,
        sent_at: null,
      };

      if (existente) {
        // `created_by` no se toca al editar: es quien lo creó, no quien lo tocó último.
        orThrow(await supabase.from('communications').update(fila).eq('id', id).select('id').single());
      } else {
        orThrow(
          await supabase
            .from('communications')
            .insert({ ...fila, created_by: perfil.id })
            .select('id')
            .single(),
        );
      }

      if (enviar) {
        await sincronizarDestinatarios('communication', id, ids);
        orThrow(
          await supabase
            .from('communications')
            .update({ status: 'publicada', sent_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
            .single(),
        );
      } else {
        await borrarDestinatarios('communication', id);
      }

      revalidatePath(RUTA_COMUNICADOS);
      revalidatePath(`${RUTA_COMUNICADOS}/${id}`);
      revalidatePath('/alumno/comunicados');
      revalidatePath('/alumno');
    },
    enviar ? 'Comunicado enviado' : 'Borrador guardado',
  );
}

export async function eliminarComunicado(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    // Los destinatarios caen solos (on delete cascade); los archivos, no.
    await borrarCarpeta(BUCKET_COMUNICADOS, id);

    const { error } = await supabase.from('communications').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA_COMUNICADOS);
    revalidatePath('/alumno/comunicados');
    revalidatePath('/alumno');
  }, 'Comunicado eliminado');
}

// ═══════════════════════════════════════════════════════════════════════════
// Novedades
// ═══════════════════════════════════════════════════════════════════════════

/** Guarda una novedad. Si queda publicada, expande los destinatarios. */
export async function guardarNovedad(id: string, datos: unknown) {
  return ejecutar(async () => {
    const perfil = await assertAdmin();
    const v = esquemaNovedad.parse(datos);

    const supabase = await createClient();

    const { data: existente } = await supabase
      .from('announcements')
      .select('id, published_at')
      .eq('id', id)
      .maybeSingle();

    const publicada = v.status === 'publicada';

    const { ids, label } = await resolverDestinatarios({
      scope: v.scope,
      group_id: v.group_id,
      workshop_id: v.workshop_id,
      student_ids: v.student_ids,
    });

    if (publicada && ids.length === 0) {
      throw new Error('Ningún alumno cumple con los destinatarios elegidos.');
    }

    // Publicar sin fecha = publicar ahora. Con fecha futura queda programada: la
    // RLS la esconde hasta que llegue el día (published_at <= now()).
    const publicadaEl = v.published_at
      ? inicioDelDia(v.published_at)
      : publicada
        ? (existente?.published_at ?? new Date().toISOString())
        : null;

    // Igual que en los comunicados: primero borrador, después los destinatarios y
    // recién al final se publica. Si algo falla, no queda publicada a medias.
    const fila = {
      id,
      title: v.title,
      content: v.content,
      image_path: v.image_path || null,
      attachments: v.attachments,
      published_at: publicadaEl,
      expires_at: v.expires_at ? finDelDia(v.expires_at) : null,
      priority: v.priority,
      is_pinned: v.is_pinned,
      status: 'borrador' as const,
      scope: v.scope,
      scope_label: label,
    };

    if (existente) {
      // `created_by` no se toca al editar: es quien la creó, no quien la tocó último.
      orThrow(await supabase.from('announcements').update(fila).eq('id', id).select('id').single());
    } else {
      orThrow(
        await supabase
          .from('announcements')
          .insert({ ...fila, created_by: perfil.id })
          .select('id')
          .single(),
      );
    }

    if (publicada) {
      await sincronizarDestinatarios('announcement', id, ids);
      orThrow(
        await supabase
          .from('announcements')
          .update({ status: 'publicada' })
          .eq('id', id)
          .select('id')
          .single(),
      );
    } else {
      await borrarDestinatarios('announcement', id);
    }

    revalidatePath(RUTA_NOVEDADES);
    revalidatePath('/alumno/novedades');
    revalidatePath('/alumno');
  }, 'Novedad guardada');
}

/** Fijar o desfijar: las fijadas van siempre arriba en el portal del alumno. */
export async function fijarNovedad(id: string, fijar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('announcements')
          .update({ is_pinned: fijar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA_NOVEDADES);
      revalidatePath('/alumno/novedades');
    },
    fijar ? 'Novedad fijada arriba' : 'Novedad desfijada',
  );
}

export async function eliminarNovedad(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    await borrarCarpeta(BUCKET_NOVEDADES, id);

    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA_NOVEDADES);
    revalidatePath('/alumno/novedades');
    revalidatePath('/alumno');
  }, 'Novedad eliminada');
}

// ═══════════════════════════════════════════════════════════════════════════
// Portal del alumno
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marca un comunicado como leído.
 * La RLS solo deja tocar la fila del propio alumno; el `eq` es explícito igual.
 */
export async function marcarComunicadoLeido(comunicadoId: string) {
  return ejecutar(async () => {
    const alumno = await assertStudent();
    const supabase = await createClient();

    const { error } = await supabase
      .from('communication_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('communication_id', comunicadoId)
      .eq('student_id', alumno.id)
      .is('read_at', null);
    if (error) throw error;

    revalidatePath('/alumno/comunicados');
    revalidatePath('/alumno');
  });
}

/** Marca como leídas las novedades que el alumno tiene en pantalla. */
export async function marcarNovedadesLeidas(novedadIds: string[]) {
  return ejecutar(async () => {
    if (novedadIds.length === 0) return;

    const alumno = await assertStudent();
    const supabase = await createClient();

    const { error } = await supabase
      .from('announcement_recipients')
      .update({ read_at: new Date().toISOString() })
      .in('announcement_id', novedadIds)
      .eq('student_id', alumno.id)
      .is('read_at', null);
    if (error) throw error;

    revalidatePath('/alumno/novedades');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Notificaciones
// ═══════════════════════════════════════════════════════════════════════════
// Las genera sola la base (comprobante subido, comprobante aprobado/rechazado,
// cuota generada, pago registrado, recuperación disponible, cupo completo,
// inscripción a taller…). Acá solo se marcan como leídas: la RLS ya decide de
// quién es cada una.

export async function marcarNotificacionLeida(id: string) {
  return ejecutar(async () => {
    await assertSesion();
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('is_read', false);
    if (error) throw error;

    revalidarNotificaciones();
  });
}

export async function marcarTodasNotificacionesLeidas() {
  return ejecutar(async () => {
    await assertSesion();
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false);
    if (error) throw error;

    revalidarNotificaciones();
  }, 'Notificaciones marcadas como leídas');
}

// ═══════════════════════════════════════════════════════════════════════════
// Interno
// ═══════════════════════════════════════════════════════════════════════════

/** Una notificación puede ser de la administradora o del alumno: alcanza con sesión. */
async function assertSesion() {
  const perfil = await getProfile();
  if (!perfil) throw new Error('Tu sesión expiró. Volvé a ingresar.');
  return perfil;
}

function revalidarNotificaciones() {
  revalidatePath('/admin/notificaciones');
  revalidatePath('/alumno/notificaciones');
  revalidatePath('/admin');
  revalidatePath('/alumno');
}

/**
 * Deja la tabla de destinatarios con EXACTAMENTE los alumnos indicados.
 *
 * `ignoreDuplicates` es a propósito: si el alumno ya estaba, su fila —y su
 * `read_at`— queda intacta. Los que ya no corresponden se borran.
 */
async function sincronizarDestinatarios(
  tipo: 'announcement' | 'communication',
  id: string,
  studentIds: string[],
) {
  const supabase = await createClient();

  const actuales =
    tipo === 'announcement'
      ? await supabase.from('announcement_recipients').select('student_id').eq('announcement_id', id)
      : await supabase
          .from('communication_recipients')
          .select('student_id')
          .eq('communication_id', id);

  if (actuales.error) throw actuales.error;

  const objetivo = new Set(studentIds);
  const sobran = (actuales.data ?? []).map((r) => r.student_id).filter((sid) => !objetivo.has(sid));

  if (sobran.length > 0) {
    const borrado =
      tipo === 'announcement'
        ? await supabase
            .from('announcement_recipients')
            .delete()
            .eq('announcement_id', id)
            .in('student_id', sobran)
        : await supabase
            .from('communication_recipients')
            .delete()
            .eq('communication_id', id)
            .in('student_id', sobran);
    if (borrado.error) throw borrado.error;
  }

  if (studentIds.length > 0) {
    const alta =
      tipo === 'announcement'
        ? await supabase.from('announcement_recipients').upsert(
            studentIds.map((student_id) => ({ announcement_id: id, student_id })),
            { onConflict: 'announcement_id,student_id', ignoreDuplicates: true },
          )
        : await supabase.from('communication_recipients').upsert(
            studentIds.map((student_id) => ({ communication_id: id, student_id })),
            { onConflict: 'communication_id,student_id', ignoreDuplicates: true },
          );
    if (alta.error) throw alta.error;
  }
}

async function borrarDestinatarios(tipo: 'announcement' | 'communication', id: string) {
  const supabase = await createClient();

  const { error } =
    tipo === 'announcement'
      ? await supabase.from('announcement_recipients').delete().eq('announcement_id', id)
      : await supabase.from('communication_recipients').delete().eq('communication_id', id);

  if (error) throw error;
}

/**
 * Borra la carpeta del bucket (`<id>/…`) al eliminar la novedad o el comunicado.
 * Si Storage falla, no abortamos: el registro igual se borra y no dejamos a la
 * administradora trabada por un archivo huérfano.
 */
async function borrarCarpeta(bucket: string, id: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.storage.from(bucket).list(id);
    const paths = (data ?? []).map((f) => `${id}/${f.name}`);
    if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
  } catch {
    /* archivos huérfanos: molestan, pero no justifican frenar la eliminación */
  }
}
