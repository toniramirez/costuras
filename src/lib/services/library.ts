import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { rangoPagina } from '@/lib/pagination';
import { BUCKET_BIBLIOTECA, normalizar } from '@/lib/validations/library';
import type { Enums, Tables } from '@/lib/supabase/database.types';

/**
 * Lectura de la biblioteca: centro de ayuda, glosario y moldería digital.
 *
 * Los servicios SOLO leen (ver PATRONES.md). Todas las consultas usan el cliente
 * con sesión, así que **la RLS decide qué se ve**: la administradora recibe
 * también los borradores; la alumna, únicamente lo publicado. Por eso estas
 * mismas funciones sirven para las dos pantallas y no hay una versión "de
 * alumno" que se pueda olvidar de filtrar.
 */

export type Categoria = Tables<'library_categories'>;
export type Contenido = Tables<'help_contents'>;
export type Termino = Tables<'glossary_terms'>;
export type Sugerencia = Tables<'glossary_suggestions'>;
export type Molde = Tables<'digital_patterns'>;

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Cuánto material se trae de una sola vez para la vista agrupada de la alumna. */
export const TOPE_VISTA_ALUMNA = 500;

/**
 * URLs firmadas de un bucket privado. Una sola llamada para todas las rutas de
 * la pantalla (nada de una firma por tarjeta).
 */
async function firmar(supabase: Cliente, rutas: Array<string | null>): Promise<Record<string, string>> {
  const unicas = [...new Set(rutas.filter((r): r is string => Boolean(r)))];
  if (unicas.length === 0) return {};

  const { data } = await supabase.storage
    .from(BUCKET_BIBLIOTECA)
    .createSignedUrls(unicas, 3600);

  const mapa: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl;
  }
  return mapa;
}

export type FiltrosBiblioteca = {
  q?: string;
  categoria?: string;
  pagina?: number;
  /** Sin paginar: se trae todo (hasta `TOPE_VISTA_ALUMNA`). Para la vista agrupada. */
  todo?: boolean;
};

/** Rango de filas a pedir: una página, o todo hasta el tope de la vista agrupada. */
function rango(filtros: FiltrosBiblioteca): [number, number] {
  return filtros.todo ? [0, TOPE_VISTA_ALUMNA - 1] : rangoPagina(filtros.pagina ?? 1);
}

// ============================================================================
// CATEGORÍAS
// ============================================================================

/** Categorías de un espacio, en el orden en que las puso la administradora. */
export async function listarCategorias(scope: Enums<'library_scope'>): Promise<Categoria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('library_categories')
    .select('*')
    .eq('scope', scope)
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/** Cuánto material cuelga de cada categoría (para avisar antes de borrarla). */
export async function usoDeCategorias(
  scope: Enums<'library_scope'>,
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } =
    scope === 'ayuda'
      ? await supabase.from('help_contents').select('category_id')
      : await supabase.from('digital_patterns').select('category_id');

  if (error) throw error;

  const uso: Record<string, number> = {};
  for (const fila of data ?? []) {
    if (fila.category_id) uso[fila.category_id] = (uso[fila.category_id] ?? 0) + 1;
  }
  return uso;
}

// ============================================================================
// CENTRO DE AYUDA
// ============================================================================

/** Publicación con su archivo ya firmado y su categoría resuelta. */
export type ContenidoConArchivo = Contenido & {
  /** URL para abrir el archivo (firmada) o el enlace externo, si lo hay. */
  url: string | null;
  categoria: Pick<Categoria, 'id' | 'name'> | null;
};

export async function listarContenidos(
  filtros: FiltrosBiblioteca = {},
): Promise<{ contenidos: ContenidoConArchivo[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('help_contents')
    .select('*, library_categories(id, name)', { count: 'exact' })
    .order('sort_order')
    .order('created_at', { ascending: false });

  const termino = filtros.q ? normalizar(filtros.q) : '';
  // `search_key` es una columna generada sin acentos ni mayúsculas (migración
  // 0022): por eso alcanza con un `like` y no hace falta un `or` de tres campos.
  if (termino) query = query.like('search_key', `%${termino}%`);
  if (filtros.categoria === 'sin') query = query.is('category_id', null);
  else if (filtros.categoria) query = query.eq('category_id', filtros.categoria);

  const [desde, hasta] = rango(filtros);
  const { data, error, count } = await query.range(desde, hasta);
  if (error) throw error;

  const filas = data ?? [];
  const urls = await firmar(
    supabase,
    filas.map((c) => c.storage_path),
  );

  return {
    contenidos: filas.map(({ library_categories, ...c }) => ({
      ...c,
      url: c.storage_path ? (urls[c.storage_path] ?? null) : c.external_url,
      categoria: library_categories,
    })),
    total: count ?? 0,
  };
}

/** Una publicación agrupada bajo el nombre de su sección. */
export type SeccionAyuda = {
  id: string | null;
  nombre: string;
  descripcion: string | null;
  contenidos: ContenidoConArchivo[];
};

/**
 * El centro de ayuda tal como lo ve la alumna: por secciones.
 *
 * Las categorías vacías NO se muestran. Una sección con el título puesto y nada
 * adentro no es información: es una promesa incumplida.
 */
export async function centroDeAyuda(filtros: FiltrosBiblioteca = {}): Promise<SeccionAyuda[]> {
  const [categorias, { contenidos }] = await Promise.all([
    listarCategorias('ayuda'),
    listarContenidos({ ...filtros, todo: true }),
  ]);

  // Solo lo que la alumna puede realmente abrir: un borrador a medio cargar
  // (sin archivo, sin enlace y sin texto) no llegó a ser una publicación.
  const utiles = contenidos.filter((c) => (c.kind === 'texto' ? Boolean(c.body) : Boolean(c.url)));

  const secciones: SeccionAyuda[] = categorias.map((cat) => ({
    id: cat.id,
    nombre: cat.name,
    descripcion: cat.description,
    contenidos: utiles.filter((c) => c.category_id === cat.id),
  }));

  const sueltos = utiles.filter((c) => !c.category_id);
  if (sueltos.length > 0) {
    secciones.push({ id: null, nombre: 'Otros materiales', descripcion: null, contenidos: sueltos });
  }

  return secciones.filter((s) => s.contenidos.length > 0);
}

// ============================================================================
// GLOSARIO
// ============================================================================

export type TerminoConArchivos = Termino & {
  imagenUrl: string | null;
  videoUrl: string | null;
  pdfUrl: string | null;
};

/**
 * Términos del glosario, SIEMPRE en orden alfabético.
 *
 * El orden sale de `sort_key` (minúsculas y sin acentos, columna generada): con
 * `term` a secas, «Ábito» caería después de «Zurcido» en algunas configuraciones
 * regionales y un diccionario mal ordenado no es un diccionario.
 */
export async function listarTerminos(
  filtros: FiltrosBiblioteca = {},
): Promise<{ terminos: TerminoConArchivos[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('glossary_terms')
    .select('*', { count: 'exact' })
    .order('sort_key');

  const termino = filtros.q ? normalizar(filtros.q) : '';
  if (termino) query = query.like('search_key', `%${termino}%`);

  const [desde, hasta] = rango(filtros);
  const { data, error, count } = await query.range(desde, hasta);
  if (error) throw error;

  const filas = data ?? [];
  const urls = await firmar(supabase, [
    ...filas.map((t) => t.image_path),
    ...filas.map((t) => t.video_path),
    ...filas.map((t) => t.pdf_path),
  ]);

  return {
    terminos: filas.map((t) => ({
      ...t,
      imagenUrl: t.image_path ? (urls[t.image_path] ?? null) : null,
      // El video puede estar subido o alojado afuera. Manda el archivo propio.
      videoUrl: t.video_path ? (urls[t.video_path] ?? null) : t.video_url,
      pdfUrl: t.pdf_path ? (urls[t.pdf_path] ?? null) : null,
    })),
    total: count ?? 0,
  };
}

export type FiltrosSugerencia = { estado?: string };

/**
 * Bandeja de sugerencias. Solo la administradora tiene política de SELECT sobre
 * esta tabla, así que para cualquier otra sesión esto devuelve una lista vacía.
 */
export async function listarSugerencias(
  filtros: FiltrosSugerencia = {},
): Promise<Array<Sugerencia & { alumna: string | null }>> {
  const supabase = await createClient();

  let query = supabase
    .from('glossary_suggestions')
    .select('*, students(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (filtros.estado) {
    query = query.eq('status', filtros.estado as Enums<'suggestion_status'>);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(({ students, ...s }) => ({
    ...s,
    alumna: students ? `${students.first_name} ${students.last_name}` : null,
  }));
}

/** Cuántas sugerencias esperan respuesta (para el aviso del panel). */
export async function contarSugerenciasPendientes(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('glossary_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pendiente');

  if (error) throw error;
  return count ?? 0;
}

// ============================================================================
// MOLDERÍA DIGITAL
// ============================================================================

export type MoldeConArchivos = Molde & {
  pdfUrl: string | null;
  portadaUrl: string | null;
  categoria: Pick<Categoria, 'id' | 'name'> | null;
};

export async function listarMoldes(
  filtros: FiltrosBiblioteca = {},
): Promise<{ moldes: MoldeConArchivos[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('digital_patterns')
    .select('*, library_categories(id, name)', { count: 'exact' })
    .order('sort_order')
    .order('created_at', { ascending: false });

  const termino = filtros.q ? normalizar(filtros.q) : '';
  if (termino) query = query.like('search_key', `%${termino}%`);
  if (filtros.categoria === 'sin') query = query.is('category_id', null);
  else if (filtros.categoria) query = query.eq('category_id', filtros.categoria);

  const [desde, hasta] = rango(filtros);
  const { data, error, count } = await query.range(desde, hasta);
  if (error) throw error;

  const filas = data ?? [];
  const urls = await firmar(supabase, [
    ...filas.map((m) => m.storage_path),
    ...filas.map((m) => m.cover_image_path),
  ]);

  return {
    moldes: filas.map(({ library_categories, ...m }) => ({
      ...m,
      pdfUrl: m.storage_path ? (urls[m.storage_path] ?? null) : null,
      portadaUrl: m.cover_image_path ? (urls[m.cover_image_path] ?? null) : null,
      categoria: library_categories,
    })),
    total: count ?? 0,
  };
}

export type SeccionMolderia = {
  id: string | null;
  nombre: string;
  descripcion: string | null;
  moldes: MoldeConArchivos[];
};

/** La moldería como la ve la alumna: por categoría, y solo lo que se puede abrir. */
export async function molderiaDeLaAlumna(
  filtros: FiltrosBiblioteca = {},
): Promise<SeccionMolderia[]> {
  const [categorias, { moldes }] = await Promise.all([
    listarCategorias('molderia'),
    listarMoldes({ ...filtros, todo: true }),
  ]);

  const utiles = moldes.filter((m) => Boolean(m.pdfUrl));

  const secciones: SeccionMolderia[] = categorias.map((cat) => ({
    id: cat.id,
    nombre: cat.name,
    descripcion: cat.description,
    moldes: utiles.filter((m) => m.category_id === cat.id),
  }));

  const sueltos = utiles.filter((m) => !m.category_id);
  if (sueltos.length > 0) {
    secciones.push({ id: null, nombre: 'Otros moldes', descripcion: null, moldes: sueltos });
  }

  return secciones.filter((s) => s.moldes.length > 0);
}
