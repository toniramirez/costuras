import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  CONFIRMADAS,
  OCUPAN_CUPO,
  PENDIENTES,
  VISIBLES_ALUMNO,
} from '@/lib/validations/workshops';
import type { Enums, Tables } from '@/lib/supabase/database.types';

export type Taller = Tables<'workshops'>;

/**
 * Tamaño de página. Tiene que coincidir con el del componente `<Pagination>`.
 *
 * No lo importamos de `@/components/ui/pagination` porque ese módulo es
 * `'use client'`: desde el servidor sus exportaciones son referencias de cliente
 * y llamarlas revienta en tiempo de ejecución. Acá calculamos el rango a mano.
 */
export const POR_PAGINA = 20;

function rango(pagina: number): [number, number] {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * POR_PAGINA, p * POR_PAGINA - 1];
}

/** Taller con el cupo REAL (confirmados) y la URL firmada de su imagen. */
export type TallerConCupo = Taller & {
  confirmados: number;
  imagenUrl: string | null;
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

export const BUCKET_TALLERES = 'workshops';

/**
 * Capa de acceso a datos.
 *
 * Los servicios SOLO leen. Las escrituras van por server actions, para que pasen
 * sí o sí por Zod y por el chequeo de permisos. Toda consulta usa el cliente con
 * sesión: la RLS decide qué filas se ven.
 */

/** Quita lo que rompería la sintaxis de un filtro `or` de PostgREST. */
function limpiar(q: string): string {
  return q.replace(/[,()*\\%]/g, ' ').trim();
}

/** URLs firmadas de las imágenes (el bucket es privado). Path → URL. */
async function imagenesFirmadas(supabase: Cliente, paths: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase.storage.from(BUCKET_TALLERES).createSignedUrls(unicos, 3600);

  const mapa = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

/**
 * Cuántos lugares ocupa cada taller.
 *
 * Una sola consulta para todos los talleres de la página (nada de N+1). Cuenta
 * exactamente lo mismo que `workshop_confirmed_count`: confirmadas + asistió.
 * La administradora puede leer todas las inscripciones; el alumno no (la RLS
 * solo le muestra las suyas), por eso del lado del alumno se usa la función de
 * la base, que es SECURITY DEFINER.
 */
async function confirmadosPorTaller(
  supabase: Cliente,
  ids: string[],
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>();
  if (ids.length === 0) return conteo;

  const { data, error } = await supabase
    .from('workshop_registrations')
    .select('workshop_id')
    .in('workshop_id', ids)
    .in('status', OCUPAN_CUPO);

  if (error) throw error;

  for (const fila of data ?? []) {
    conteo.set(fila.workshop_id, (conteo.get(fila.workshop_id) ?? 0) + 1);
  }
  return conteo;
}

export type FiltrosTaller = {
  q?: string;
  estado?: string;
  pagina?: number;
};

/** Listado de talleres para la administradora, con el cupo real de cada uno. */
export async function listarTalleres(
  filtros: FiltrosTaller = {},
): Promise<{ talleres: TallerConCupo[]; total: number }> {
  const supabase = await createClient();
  const [desde, hasta] = rango(filtros.pagina ?? 1);

  let query = supabase
    .from('workshops')
    .select('*', { count: 'exact' })
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(desde, hasta);

  const termino = filtros.q ? limpiar(filtros.q) : '';
  if (termino) {
    query = query.or(
      `name.ilike.*${termino}*,category.ilike.*${termino}*,responsible_name.ilike.*${termino}*`,
    );
  }
  if (filtros.estado) {
    query = query.eq('status', filtros.estado as Enums<'workshop_status'>);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const talleres = data ?? [];
  const [conteo, imagenes] = await Promise.all([
    confirmadosPorTaller(
      supabase,
      talleres.map((t) => t.id),
    ),
    imagenesFirmadas(
      supabase,
      talleres.map((t) => t.image_path ?? '').filter(Boolean),
    ),
  ]);

  return {
    talleres: talleres.map((t) => ({
      ...t,
      confirmados: conteo.get(t.id) ?? 0,
      imagenUrl: t.image_path ? (imagenes.get(t.image_path) ?? null) : null,
    })),
    total: count ?? 0,
  };
}

/** Un taller con su cupo real. `null` si no existe (o la RLS no lo deja ver). */
export async function obtenerTaller(id: string): Promise<TallerConCupo | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('workshops').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ data: confirmados, error: errorCupo }, imagenes] = await Promise.all([
    supabase.rpc('workshop_confirmed_count', { p_workshop_id: id }),
    imagenesFirmadas(supabase, data.image_path ? [data.image_path] : []),
  ]);
  if (errorCupo) throw errorCupo;

  return {
    ...data,
    confirmados: confirmados ?? 0,
    imagenUrl: data.image_path ? (imagenes.get(data.image_path) ?? null) : null,
  };
}

export type FiltrosInscripcion = {
  q?: string;
  estado?: string;
};

async function inscripcionesDelTaller(supabase: Cliente, tallerId: string) {
  const { data, error } = await supabase
    .from('workshop_registrations')
    .select('*, students(id, first_name, last_name, email, phone)')
    .eq('workshop_id', tallerId)
    .order('waitlist_position', { ascending: true, nullsFirst: false })
    .order('registered_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

type InscripcionConPersona = Awaited<ReturnType<typeof inscripcionesDelTaller>>[number];

/** Inscripción lista para mostrar: ya trae el nombre y el contacto resueltos. */
export type FilaInscripcion = InscripcionConPersona & {
  /** Nombre de la persona, sea alumna de la academia o externa. */
  nombre: string;
  /** Teléfono y correo, vengan de la ficha del alumno o de la carga manual. */
  contacto: string[];
  /** Persona sin ficha de alumno (carga manual). */
  esExterna: boolean;
};

/**
 * Números de la ficha del taller.
 *
 * El cupo ocupado NO está acá a propósito: sale de `workshop_confirmed_count`
 * (ver `obtenerTaller`), que es la única fuente de verdad. Duplicar ese cálculo
 * sería pedirle a dos relojes distintos la hora.
 */
export type ResumenInscripciones = {
  /** Todavía no ocupan lugar: están esperando el pago. */
  pendientes: number;
  espera: number;
  canceladas: number;
  /** Total efectivamente cobrado (solo inscripciones confirmadas). */
  cobradoCents: number;
  /** Alumnos ya anotados (sin contar canceladas): no se los ofrece de nuevo. */
  alumnosInscriptos: string[];
};

function decorar(i: InscripcionConPersona): FilaInscripcion {
  const nombre = i.students
    ? `${i.students.first_name} ${i.students.last_name}`
    : `${i.external_first_name ?? ''} ${i.external_last_name ?? ''}`.trim() || 'Sin nombre';

  const telefono = i.students?.phone ?? i.external_phone;
  const correo = i.students?.email ?? i.external_email;

  return {
    ...i,
    nombre,
    contacto: [telefono, correo].filter((v): v is string => Boolean(v)),
    esExterna: !i.students,
  };
}

/**
 * Inscripciones de un taller: las filas (ya filtradas) y el resumen (sobre TODAS).
 *
 * El resumen se calcula sobre el conjunto completo a propósito: es la ficha del
 * taller y no debe cambiar porque haya un filtro puesto en la lista.
 *
 * El filtro por nombre se resuelve en memoria: el nombre puede estar en la ficha
 * del alumno (tabla `students`) o cargado a mano en la inscripción, y un taller
 * tiene, como mucho, unas decenas de personas. Cruzar dos tablas en PostgREST
 * complicaría la consulta sin ninguna ganancia real.
 */
export async function listarInscripciones(
  tallerId: string,
  filtros: FiltrosInscripcion = {},
): Promise<{ filas: FilaInscripcion[]; resumen: ResumenInscripciones }> {
  const supabase = await createClient();
  const todas = (await inscripcionesDelTaller(supabase, tallerId)).map(decorar);

  const resumen: ResumenInscripciones = {
    pendientes: todas.filter((i) => PENDIENTES.includes(i.status)).length,
    espera: todas.filter((i) => i.status === 'lista_espera').length,
    canceladas: todas.filter((i) => i.status === 'cancelada').length,
    cobradoCents: todas
      .filter((i) => CONFIRMADAS.includes(i.status))
      .reduce((suma, i) => suma + Number(i.amount_cents), 0),
    alumnosInscriptos: todas
      .filter((i) => i.status !== 'cancelada')
      .map((i) => i.student_id)
      .filter((id): id is string => Boolean(id)),
  };

  const termino = filtros.q?.trim().toLowerCase() ?? '';

  const filas = todas.filter((i) => {
    if (filtros.estado && i.status !== filtros.estado) return false;
    if (!termino) return true;
    return [i.nombre, ...i.contacto].join(' ').toLowerCase().includes(termino);
  });

  return { filas, resumen };
}

/** Cuántas inscripciones tiene un taller (para no borrarlo con historial). */
export async function inscripcionesDelTallerCount(tallerId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('workshop_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('workshop_id', tallerId);

  if (error) throw error;
  return count ?? 0;
}

/** Medios de pago activos (para el diálogo de confirmación). */
export async function listarMediosDePago(): Promise<Pick<Tables<'payment_methods'>, 'id' | 'name'>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/** Cajas activas (destino del ingreso del taller). */
export async function listarCajasActivas(): Promise<Pick<Tables<'cash_accounts'>, 'id' | 'name'>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cash_accounts')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export type AlumnoBuscable = Pick<Tables<'students'>, 'id' | 'first_name' | 'last_name' | 'dni' | 'status'>;

/**
 * Alumnos para el buscador de inscripción.
 *
 * Se envían todos (sin archivar) y el buscador filtra en el navegador: son unos
 * cientos como mucho y así la búsqueda es instantánea, sin ida y vuelta al servidor.
 */
export async function listarAlumnosParaInscribir(): Promise<AlumnoBuscable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name, dni, status')
    .is('archived_at', null)
    .order('last_name')
    .order('first_name');

  if (error) throw error;
  return data ?? [];
}

// ── Lado del alumno ──────────────────────────────────────────────────────────

/**
 * Talleres que el alumno puede ver.
 *
 * El cupo se pide con `workshop_confirmed_count` (SECURITY DEFINER): el alumno
 * NO puede leer las inscripciones de las demás personas, así que contarlas desde
 * la tabla le daría siempre 0.
 */
export async function listarTalleresVisibles(limite = POR_PAGINA): Promise<TallerConCupo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workshops')
    .select('*')
    .in('status', VISIBLES_ALUMNO)
    .order('event_date', { ascending: true, nullsFirst: false })
    .limit(limite);

  if (error) throw error;
  const talleres = data ?? [];

  const [conteos, imagenes] = await Promise.all([
    Promise.all(
      talleres.map(async (t) => {
        const { data: n } = await supabase.rpc('workshop_confirmed_count', { p_workshop_id: t.id });
        return n ?? 0;
      }),
    ),
    imagenesFirmadas(
      supabase,
      talleres.map((t) => t.image_path ?? '').filter(Boolean),
    ),
  ]);

  return talleres.map((t, i) => ({
    ...t,
    confirmados: conteos[i] ?? 0,
    imagenUrl: t.image_path ? (imagenes.get(t.image_path) ?? null) : null,
  }));
}

async function inscripcionesDelAlumno(supabase: Cliente, studentId: string) {
  const { data, error } = await supabase
    .from('workshop_registrations')
    .select('*, workshops(id, name, event_date, start_time, end_time, location, status)')
    .eq('student_id', studentId)
    .neq('status', 'cancelada')
    .order('registered_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export type MiInscripcion = Awaited<ReturnType<typeof inscripcionesDelAlumno>>[number];

/** Las inscripciones del alumno autenticado. La RLS ya garantiza que solo vea las suyas. */
export async function listarMisInscripciones(studentId: string): Promise<MiInscripcion[]> {
  const supabase = await createClient();
  return inscripcionesDelAlumno(supabase, studentId);
}
