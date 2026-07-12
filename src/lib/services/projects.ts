import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { rangoPagina } from '@/lib/pagination';
import { BUCKET_PROYECTOS } from '@/lib/validations/projects';
import type { LimitesArchivo } from '@/lib/storage';
import type { Enums, Tables } from '@/lib/supabase/database.types';

/**
 * Capa de acceso a datos del cuaderno virtual. SOLO LEE (las escrituras van por
 * server actions).
 *
 * PRIVACIDAD — lo más importante de este módulo:
 * un proyecto lo ven únicamente su alumno dueño y la administradora. La RLS ya
 * lo garantiza, pero ninguna consulta de acá asume lo contrario: las del portal
 * del alumno filtran explícitamente por `student_id`. Defensa en profundidad:
 * si mañana alguien afloja una política, la aplicación sigue sin filtrar datos
 * de otro alumno.
 */

export type Proyecto = Tables<'projects'>;
export type Entrada = Tables<'project_entries'>;
export type Archivo = Tables<'project_files'>;

export type ProyectoConAlumno = Proyecto & {
  students: { id: string; first_name: string; last_name: string } | null;
};

export type FiltrosProyecto = {
  q?: string;
  estado?: string;
  dificultad?: string;
  alumno?: string;
  pagina?: number;
};

const esEstado = (v?: string): v is Enums<'project_status'> =>
  !!v && ['idea', 'en_proceso', 'pausado', 'terminado', 'archivado'].includes(v);

const esDificultad = (v?: string): v is Enums<'project_difficulty'> =>
  !!v && ['inicial', 'intermedio', 'avanzado', 'personalizado'].includes(v);

// ── Listados ────────────────────────────────────────────────────────────────

/** Los proyectos del alumno. Filtrado explícito por su id, no solo por RLS. */
export async function listarMisProyectos(
  studentId: string,
  filtros: FiltrosProyecto = {},
): Promise<{ items: Proyecto[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select('*', { count: 'exact' })
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false });

  if (filtros.q) query = query.ilike('title', `%${filtros.q}%`);
  if (esEstado(filtros.estado)) query = query.eq('status', filtros.estado);
  if (esDificultad(filtros.dificultad)) query = query.eq('difficulty', filtros.dificultad);

  query = query.range(...rangoPagina(filtros.pagina ?? 1));

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

/** Todos los proyectos (panel). La RLS solo se lo permite a la administradora. */
export async function listarProyectosAdmin(
  filtros: FiltrosProyecto = {},
): Promise<{ items: ProyectoConAlumno[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select('*, students(id, first_name, last_name)', { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (filtros.q) query = query.ilike('title', `%${filtros.q}%`);
  if (esEstado(filtros.estado)) query = query.eq('status', filtros.estado);
  if (esDificultad(filtros.dificultad)) query = query.eq('difficulty', filtros.dificultad);
  if (filtros.alumno) query = query.eq('student_id', filtros.alumno);

  query = query.range(...rangoPagina(filtros.pagina ?? 1));

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export type FiltrosGaleria = { tipo?: string; dificultad?: string; alumno?: string };

/**
 * Galería: SOLO proyectos terminados.
 * `studentId` acota a los del alumno (portal); sin él, la RLS decide (panel).
 */
export async function listarGaleria(
  studentId: string | null,
  filtros: FiltrosGaleria = {},
): Promise<ProyectoConAlumno[]> {
  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select('*, students(id, first_name, last_name)')
    .eq('status', 'terminado')
    .order('is_featured', { ascending: false })
    .order('end_date', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (studentId) query = query.eq('student_id', studentId);
  if (filtros.alumno) query = query.eq('student_id', filtros.alumno);
  if (filtros.tipo) query = query.eq('garment_type', filtros.tipo);
  if (esDificultad(filtros.dificultad)) query = query.eq('difficulty', filtros.dificultad);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Tipos de prenda ya cargados, para el desplegable de filtros.
 * Son texto libre: la lista sale de los datos, no de una constante inventada.
 */
export async function tiposDePrenda(studentId: string | null): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase.from('projects').select('garment_type').not('garment_type', 'is', null);
  if (studentId) query = query.eq('student_id', studentId);

  const { data } = await query;
  const tipos = new Set(
    (data ?? []).map((f) => f.garment_type?.trim()).filter((t): t is string => !!t),
  );
  return [...tipos].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Alumnos para los desplegables del panel (nombre y apellido, nada más). */
export async function listarAlumnos(): Promise<
  Array<{ id: string; first_name: string; last_name: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .is('archived_at', null)
    .order('last_name')
    .order('first_name');
  if (error) throw error;
  return data ?? [];
}

// ── Detalle ─────────────────────────────────────────────────────────────────

/**
 * Un proyecto por id, o null si no existe O no es tuyo.
 *
 * La RLS no distingue entre "no existe" y "no es tuyo": en los dos casos no
 * devuelve la fila. Eso es exactamente lo que queremos — un 404 no le confirma
 * a nadie que el proyecto de otra persona existe.
 */
export async function getProyecto(id: string): Promise<ProyectoConAlumno | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('*, students(id, first_name, last_name)')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

/** Entradas del proyecto, de la más reciente a la más vieja (línea de tiempo). */
export async function listarEntradas(projectId: string): Promise<Entrada[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false })
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Todos los archivos del proyecto (los del proyecto y los de sus entradas). */
export async function listarArchivos(projectId: string): Promise<Archivo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export type ProyectoCompleto = {
  proyecto: ProyectoConAlumno;
  entradas: Entrada[];
  archivos: Archivo[];
};

/**
 * Todo el cuaderno de un proyecto de una sola vez.
 * Lo usan la pantalla de detalle y las descargas (PDF y ZIP).
 * Devuelve null si la RLS no deja verlo: quien llama responde 404.
 */
export async function getProyectoCompleto(id: string): Promise<ProyectoCompleto | null> {
  const proyecto = await getProyecto(id);
  if (!proyecto) return null;

  const [entradas, archivos] = await Promise.all([listarEntradas(id), listarArchivos(id)]);
  return { proyecto, entradas, archivos };
}

// ── Archivos: URLs firmadas ─────────────────────────────────────────────────

/**
 * URLs temporales para ver los archivos del bucket privado.
 *
 * Se firman en el servidor y en un solo viaje: si cada tarjeta de la galería
 * pidiera su firma por separado, serían decenas de llamadas desde el celular.
 * Un archivo que no se pueda firmar simplemente no aparece en el mapa; quien
 * renderiza decide qué mostrar en su lugar.
 */
export async function firmarUrls(
  paths: Array<string | null | undefined>,
  segundos = 3600,
): Promise<Record<string, string>> {
  const limpias = [...new Set(paths.filter((p): p is string => !!p))];
  if (limpias.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(BUCKET_PROYECTOS)
    .createSignedUrls(limpias, segundos);

  const mapa: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error && item.path) mapa[item.path] = item.signedUrl;
  }
  return mapa;
}

/**
 * Baja un archivo del bucket privado desde el SERVIDOR (para el PDF y el ZIP).
 *
 * Usa el cliente con sesión, así que la RLS se aplica igual que en todo lo
 * demás: nadie se lleva un archivo de otra persona por esta puerta.
 * Devuelve null si no se pudo: quien llama decide qué contarle a la persona
 * (nunca lo omitimos en silencio).
 */
export async function descargarArchivo(path: string): Promise<Buffer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_PROYECTOS).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// ── Configuración ───────────────────────────────────────────────────────────

/**
 * Límites de tamaño de archivo. Salen de `academy_settings`: son configurables
 * desde el panel y NO se escriben a mano en ningún lado.
 */
export async function getLimitesArchivo(): Promise<LimitesArchivo> {
  const settings = await getSettings();
  if (!settings) {
    throw new Error('No pudimos leer la configuración de la academia. Volvé a intentar.');
  }
  return {
    max_image_mb: settings.max_image_mb,
    max_document_mb: settings.max_document_mb,
    max_video_mb: settings.max_video_mb,
  };
}
