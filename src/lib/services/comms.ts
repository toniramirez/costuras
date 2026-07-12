import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/lib/supabase/database.types';
import {
  BUCKET_COMUNICADOS,
  BUCKET_NOVEDADES,
  parseAdjuntos,
  type Adjunto,
  type DatosDestino,
} from '@/lib/validations/comms';
// OJO: de `@/lib/pagination`, no de `components/ui/pagination` (ese es 'use client'
// y sus exportaciones no se pueden llamar desde el servidor).
import { POR_PAGINA, rangoPagina } from '@/lib/pagination';

/**
 * Capa de acceso a datos de novedades, comunicados y notificaciones.
 *
 * Los servicios SOLO leen. Las escrituras (incluida la expansión de
 * destinatarios) van por server actions.
 * Toda consulta usa el cliente con sesión: la RLS decide qué filas se ven.
 */

export type Comunicado = Tables<'communications'>;
export type Novedad = Tables<'announcements'>;
export type Notificacion = Tables<'notifications'>;

/** Alumnos que pueden recibir algo: ni archivados ni dados de baja. */
const ESTADOS_ALCANZABLES: Enums<'student_status'>[] = ['activo', 'pausado', 'pendiente'];

// ═══════════════════════════════════════════════════════════════════════════
// Destinatarios
// ═══════════════════════════════════════════════════════════════════════════

export type Destinatarios = {
  /** Una fila por alumno: es lo que se escribe en *_recipients. */
  ids: string[];
  /** Texto legible que se guarda en scope_label ("Grupo Martes 15:00"). */
  label: string;
};

/**
 * Traduce el alcance elegido a la LISTA CONCRETA de alumnos.
 *
 * Es el corazón del modelo: al publicar/enviar, el alcance se expande a una fila
 * por alumno. Así el "quién leyó / quién no" es una consulta trivial y la RLS del
 * alumno se resuelve mirando una sola tabla.
 *
 * Los alumnos archivados o dados de baja nunca entran. Sí entran los que todavía
 * no tienen usuario: son destinatarios legítimos y la pantalla de detalle los
 * marca como «sin usuario» para que la administradora lo vea.
 */
export async function resolverDestinatarios(destino: DatosDestino): Promise<Destinatarios> {
  const supabase = await createClient();

  switch (destino.scope) {
    case 'todos': {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .is('archived_at', null)
        .in('status', ESTADOS_ALCANZABLES);
      if (error) throw error;
      return { ids: (data ?? []).map((s) => s.id), label: 'Todos los alumnos' };
    }

    case 'grupo': {
      if (!destino.group_id) throw new Error('Elegí un grupo.');

      const [alumnos, grupo] = await Promise.all([
        supabase
          .from('students')
          .select('id')
          .eq('group_id', destino.group_id)
          .is('archived_at', null)
          .in('status', ESTADOS_ALCANZABLES),
        supabase.from('groups').select('name').eq('id', destino.group_id).maybeSingle(),
      ]);
      if (alumnos.error) throw alumnos.error;

      return {
        ids: (alumnos.data ?? []).map((s) => s.id),
        label: grupo.data ? `Grupo ${grupo.data.name}` : 'Un grupo',
      };
    }

    case 'alumno': {
      const elegidos = destino.student_ids ?? [];
      if (elegidos.length === 0) throw new Error('Elegí al menos un alumno.');

      // Revalidamos contra la base: nunca confiamos en los ids que llegan del
      // formulario (podrían venir de un alumno archivado o inexistente).
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .in('id', elegidos)
        .is('archived_at', null);
      if (error) throw error;

      const filas = data ?? [];
      if (filas.length === 0) throw new Error('Ninguno de los alumnos elegidos está disponible.');

      return {
        ids: filas.map((s) => s.id),
        label:
          filas.length === 1
            ? `${filas[0].first_name} ${filas[0].last_name}`
            : `${filas.length} alumnos`,
      };
    }

    case 'cuota_pendiente': {
      // Un solo viaje: alumnos que tienen AL MENOS una cuota impaga (join interno).
      const { data, error } = await supabase
        .from('students')
        .select('id, monthly_fees!inner(status)')
        .in('monthly_fees.status', ['pendiente', 'vencida', 'comprobante_pendiente'])
        .is('archived_at', null)
        .in('status', ESTADOS_ALCANZABLES);
      if (error) throw error;

      return {
        ids: (data ?? []).map((s) => s.id),
        label: 'Alumnos con cuota pendiente',
      };
    }

    case 'taller': {
      if (!destino.workshop_id) throw new Error('Elegí un taller.');

      const [alumnos, taller] = await Promise.all([
        supabase
          .from('students')
          .select('id, workshop_registrations!inner(status, workshop_id)')
          .eq('workshop_registrations.workshop_id', destino.workshop_id)
          .neq('workshop_registrations.status', 'cancelada')
          .is('archived_at', null)
          .in('status', ESTADOS_ALCANZABLES),
        supabase.from('workshops').select('name').eq('id', destino.workshop_id).maybeSingle(),
      ]);
      if (alumnos.error) throw alumnos.error;

      return {
        ids: (alumnos.data ?? []).map((s) => s.id),
        label: taller.data ? `Taller ${taller.data.name}` : 'Un taller',
      };
    }
  }
}

export type AlumnoOpcion = Pick<
  Tables<'students'>,
  'id' | 'first_name' | 'last_name' | 'status' | 'group_id'
>;

export type OpcionesDestinatarios = {
  grupos: Array<Pick<Tables<'groups'>, 'id' | 'name' | 'weekday' | 'start_time' | 'end_time'>>;
  talleres: Array<Pick<Tables<'workshops'>, 'id' | 'name' | 'event_date'>>;
  /** Todos los alumnos alcanzables. `scope = 'todos'` es exactamente esta lista. */
  alumnos: AlumnoOpcion[];
  /** Ids de alumnos con al menos una cuota impaga. */
  conCuotaPendiente: string[];
  /** Ids de alumnos inscriptos, por taller. */
  inscriptosPorTaller: Record<string, string[]>;
};

/**
 * Todo lo que necesita el selector de destinatarios.
 *
 * Devuelve las LISTAS DE IDS (no solo los recuentos) para que el formulario pueda
 * mostrar «va a llegarle a N alumnos» con el mismo criterio que después aplica el
 * servidor al expandir. Un número que no coincide con la realidad es peor que no
 * mostrar ninguno.
 */
export async function opcionesDestinatarios(): Promise<OpcionesDestinatarios> {
  const supabase = await createClient();

  const [grupos, talleres, alumnos, conCuota, inscripciones] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, weekday, start_time, end_time')
      .eq('is_active', true)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('workshops')
      .select('id, name, event_date')
      .neq('status', 'cancelado')
      .order('event_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('students')
      .select('id, first_name, last_name, status, group_id')
      .is('archived_at', null)
      .in('status', ESTADOS_ALCANZABLES)
      .order('last_name')
      .order('first_name'),
    supabase
      .from('students')
      .select('id, monthly_fees!inner(status)')
      .in('monthly_fees.status', ['pendiente', 'vencida', 'comprobante_pendiente'])
      .is('archived_at', null)
      .in('status', ESTADOS_ALCANZABLES),
    supabase
      .from('workshop_registrations')
      .select('workshop_id, student_id')
      .neq('status', 'cancelada')
      .not('student_id', 'is', null),
  ]);

  const alcanzables = new Set((alumnos.data ?? []).map((a) => a.id));

  const inscriptosPorTaller: Record<string, string[]> = {};
  for (const fila of inscripciones.data ?? []) {
    if (!fila.student_id || !alcanzables.has(fila.student_id)) continue;
    (inscriptosPorTaller[fila.workshop_id] ??= []).push(fila.student_id);
  }

  return {
    grupos: grupos.data ?? [],
    talleres: talleres.data ?? [],
    alumnos: alumnos.data ?? [],
    conCuotaPendiente: (conCuota.data ?? []).map((a) => a.id),
    inscriptosPorTaller,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Adjuntos
// ═══════════════════════════════════════════════════════════════════════════

export type AdjuntoFirmado = Adjunto & { url: string | null };

/**
 * URLs temporales para abrir los adjuntos de un bucket privado.
 *
 * Se firman en el SERVIDOR, con la sesión de quien pide: la política de Storage
 * solo deja abrir la carpeta <id> si esa persona es destinataria. Así el enlace
 * es un <a href> común y no depende de JavaScript.
 */
export async function firmarAdjuntos(
  bucket: string,
  adjuntos: Adjunto[],
  segundos = 3600,
): Promise<AdjuntoFirmado[]> {
  if (adjuntos.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls(adjuntos.map((a) => a.path), segundos);

  const porPath = new Map((data ?? []).map((f) => [f.path, f.signedUrl]));
  return adjuntos.map((a) => ({ ...a, url: porPath.get(a.path) ?? null }));
}

/** URL temporal de un archivo suelto (la imagen de portada de una novedad). */
export async function firmarArchivo(
  bucket: string,
  path: string | null,
  segundos = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Comunicados · administración
// ═══════════════════════════════════════════════════════════════════════════

export type FiltrosComunicado = {
  q?: string;
  estado?: string; // 'borrador' | 'publicada'
  prioridad?: string;
  pagina?: number;
};

/** Comunicado con el recuento de destinatarios y de lecturas. */
export type ComunicadoConLecturas = Comunicado & {
  adjuntos: Adjunto[];
  destinatarios: number;
  leidos: number;
};

export async function listarComunicados(
  filtros: FiltrosComunicado = {},
): Promise<{ items: ComunicadoConLecturas[]; total: number }> {
  const supabase = await createClient();
  const [desde, hasta] = rangoPagina(filtros.pagina ?? 1, POR_PAGINA);

  let query = supabase
    .from('communications')
    .select('*', { count: 'exact' })
    .order('sent_at', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(desde, hasta);

  if (filtros.q) query = query.ilike('subject', `%${filtros.q}%`);
  if (filtros.estado) query = query.eq('status', filtros.estado as Enums<'publish_status'>);
  if (filtros.prioridad) query = query.eq('priority', filtros.prioridad as Enums<'priority_level'>);

  const { data, error, count } = await query;
  if (error) throw error;

  const items = data ?? [];
  const lecturas = await contarLecturas(
    'communication_recipients',
    'communication_id',
    items.map((c) => c.id),
  );

  return {
    items: items.map((c) => ({
      ...c,
      adjuntos: parseAdjuntos(c.attachments),
      destinatarios: lecturas.get(c.id)?.total ?? 0,
      leidos: lecturas.get(c.id)?.leidos ?? 0,
    })),
    total: count ?? 0,
  };
}

export type LecturaDeAlumno = {
  studentId: string;
  nombre: string;
  /** Sin usuario todavía: no puede abrir el comunicado en la app. */
  sinUsuario: boolean;
  leidoEl: string | null;
};

export type DetalleComunicado = {
  comunicado: Comunicado;
  adjuntos: AdjuntoFirmado[];
  leyeron: LecturaDeAlumno[];
  noLeyeron: LecturaDeAlumno[];
};

/** Detalle con el desglose de quién lo leyó y quién no. */
export async function obtenerComunicado(id: string): Promise<DetalleComunicado | null> {
  const supabase = await createClient();

  const [comunicado, destinatarios] = await Promise.all([
    supabase.from('communications').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('communication_recipients')
      .select('read_at, students!inner(id, first_name, last_name, profile_id)')
      .eq('communication_id', id),
  ]);

  if (comunicado.error) throw comunicado.error;
  if (!comunicado.data) return null;
  if (destinatarios.error) throw destinatarios.error;

  const filas = (destinatarios.data ?? []).map(
    (r): LecturaDeAlumno => ({
      studentId: r.students.id,
      nombre: `${r.students.last_name}, ${r.students.first_name}`,
      sinUsuario: r.students.profile_id === null,
      leidoEl: r.read_at,
    }),
  );
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    comunicado: comunicado.data,
    adjuntos: await firmarAdjuntos(BUCKET_COMUNICADOS, parseAdjuntos(comunicado.data.attachments)),
    leyeron: filas.filter((f) => f.leidoEl !== null),
    noLeyeron: filas.filter((f) => f.leidoEl === null),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Novedades · administración
// ═══════════════════════════════════════════════════════════════════════════

export type FiltrosNovedad = {
  q?: string;
  estado?: string;
  prioridad?: string;
  pagina?: number;
};

export type NovedadConLecturas = Novedad & {
  adjuntos: Adjunto[];
  destinatarios: number;
  leidos: number;
  /** Ya venció: no se muestra entre las principales del alumno. */
  vencida: boolean;
};

export async function listarNovedades(
  filtros: FiltrosNovedad = {},
): Promise<{ items: NovedadConLecturas[]; total: number }> {
  const supabase = await createClient();
  const [desde, hasta] = rangoPagina(filtros.pagina ?? 1, POR_PAGINA);

  let query = supabase
    .from('announcements')
    .select('*', { count: 'exact' })
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(desde, hasta);

  if (filtros.q) query = query.ilike('title', `%${filtros.q}%`);
  if (filtros.estado) query = query.eq('status', filtros.estado as Enums<'publish_status'>);
  if (filtros.prioridad) query = query.eq('priority', filtros.prioridad as Enums<'priority_level'>);

  const { data, error, count } = await query;
  if (error) throw error;

  const items = data ?? [];
  const lecturas = await contarLecturas(
    'announcement_recipients',
    'announcement_id',
    items.map((n) => n.id),
  );
  const ahora = Date.now();

  return {
    items: items.map((n) => ({
      ...n,
      adjuntos: parseAdjuntos(n.attachments),
      destinatarios: lecturas.get(n.id)?.total ?? 0,
      leidos: lecturas.get(n.id)?.leidos ?? 0,
      vencida: n.expires_at !== null && new Date(n.expires_at).getTime() <= ahora,
    })),
    total: count ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Portal del alumno
// ═══════════════════════════════════════════════════════════════════════════

export type ComunicadoRecibido = Comunicado & {
  adjuntos: Adjunto[];
  leidoEl: string | null;
};

/**
 * Bandeja de entrada del alumno.
 *
 * La RLS de `communications` ya exige estar en communication_recipients: el
 * `!inner` con el filtro por alumno es explícito, no la única defensa.
 */
export async function bandejaDelAlumno(
  studentId: string,
  soloNoLeidos = false,
): Promise<ComunicadoRecibido[]> {
  const supabase = await createClient();

  let query = supabase
    .from('communications')
    .select('*, communication_recipients!inner(read_at, student_id)')
    .eq('communication_recipients.student_id', studentId)
    .eq('status', 'publicada')
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (soloNoLeidos) query = query.is('communication_recipients.read_at', null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((c) => ({
    ...c,
    adjuntos: parseAdjuntos(c.attachments),
    leidoEl: c.communication_recipients[0]?.read_at ?? null,
  }));
}

export async function contarComunicadosNoLeidos(studentId: string): Promise<number> {
  const supabase = await createClient();
  // Solo existen filas de destinatarios para comunicados ya enviados: el
  // recuento no necesita mirar el estado.
  const { count, error } = await supabase
    .from('communication_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export type ComunicadoAbierto = {
  comunicado: Comunicado;
  adjuntos: AdjuntoFirmado[];
  leidoEl: string | null;
};

export async function abrirComunicado(
  id: string,
  studentId: string,
): Promise<ComunicadoAbierto | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('communications')
    .select('*, communication_recipients!inner(read_at, student_id)')
    .eq('id', id)
    .eq('communication_recipients.student_id', studentId)
    .eq('status', 'publicada')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    comunicado: data,
    adjuntos: await firmarAdjuntos(BUCKET_COMUNICADOS, parseAdjuntos(data.attachments)),
    leidoEl: data.communication_recipients[0]?.read_at ?? null,
  };
}

export type NovedadRecibida = Novedad & {
  adjuntos: AdjuntoFirmado[];
  imagenUrl: string | null;
  leidoEl: string | null;
};

/**
 * Novedades del alumno.
 *
 * `historial = false` → las vigentes (fijadas primero, después por fecha).
 * `historial = true`  → las VENCIDAS. Dejan de ser principales, pero no se
 * pierden: la persona puede volver a buscarlas.
 */
export async function novedadesDelAlumno(
  studentId: string,
  historial = false,
): Promise<NovedadRecibida[]> {
  const supabase = await createClient();
  const ahora = new Date().toISOString();

  let query = supabase
    .from('announcements')
    .select('*, announcement_recipients!inner(read_at, student_id)')
    .eq('announcement_recipients.student_id', studentId)
    .eq('status', 'publicada')
    .limit(100);

  if (historial) {
    query = query.lte('expires_at', ahora).order('expires_at', { ascending: false });
  } else {
    query = query
      .or(`expires_at.is.null,expires_at.gt.${ahora}`)
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  // Las URLs firmadas se piden de a una novedad: son pocas y cada una vive en su
  // propia carpeta del bucket.
  return Promise.all(
    (data ?? []).map(async (n) => ({
      ...n,
      adjuntos: await firmarAdjuntos(BUCKET_NOVEDADES, parseAdjuntos(n.attachments)),
      imagenUrl: await firmarArchivo(BUCKET_NOVEDADES, n.image_path),
      leidoEl: n.announcement_recipients[0]?.read_at ?? null,
    })),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Notificaciones
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Las notificaciones las generan solos los triggers de la base (comprobante
 * subido, cuota generada, cupo completo…). Acá solo se leen: la RLS ya filtra
 * `audience='admin'` para la administradora y las del propio perfil para el alumno.
 */
export async function listarNotificaciones(
  soloNoLeidas = false,
  limite = 100,
): Promise<Notificacion[]> {
  const supabase = await createClient();

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (soloNoLeidas) query = query.eq('is_read', false);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function contarNotificacionesNoLeidas(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Interno
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recuento de destinatarios y de lecturas de varias novedades/comunicados a la
 * vez. Una sola consulta para toda la página: nada de N+1.
 */
async function contarLecturas(
  tabla: 'announcement_recipients' | 'communication_recipients',
  columna: 'announcement_id' | 'communication_id',
  ids: string[],
): Promise<Map<string, { total: number; leidos: number }>> {
  const mapa = new Map<string, { total: number; leidos: number }>();
  if (ids.length === 0) return mapa;

  const supabase = await createClient();

  const { data, error } =
    tabla === 'announcement_recipients'
      ? await supabase
          .from('announcement_recipients')
          .select('announcement_id, read_at')
          .in('announcement_id', ids)
      : await supabase
          .from('communication_recipients')
          .select('communication_id, read_at')
          .in('communication_id', ids);

  if (error) throw error;

  for (const fila of data ?? []) {
    const clave =
      columna === 'announcement_id'
        ? (fila as { announcement_id: string }).announcement_id
        : (fila as { communication_id: string }).communication_id;

    const actual = mapa.get(clave) ?? { total: 0, leidos: 0 };
    actual.total += 1;
    if (fila.read_at !== null) actual.leidos += 1;
    mapa.set(clave, actual);
  }

  return mapa;
}
