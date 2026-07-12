import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/lib/supabase/database.types';

export type Student = Tables<'students'>;

/**
 * Alumnos por página.
 *
 * Vive acá (y no se importa de `@/components/ui/pagination`) porque ese módulo
 * es de CLIENTE: importarlo desde un servicio de servidor devolvería una
 * referencia de cliente, no la función. El número se le pasa a `<Pagination>`
 * por prop, así hay un único valor y no dos que se puedan desincronizar.
 */
export const ALUMNOS_POR_PAGINA = 20;

export type FiltrosAlumno = {
  q?: string;
  estado?: string; // 'pendiente' | 'activo' | 'pausado' | 'baja'
  grupo?: string; // uuid del grupo
  pagina?: string;
};

/** Fila del listado: la ficha + los nombres que se muestran en la tabla. */
export type AlumnoListado = Student & {
  groups: { id: string; name: string; weekday: number; start_time: string; end_time: string } | null;
  plans: { id: string; name: string } | null;
  rates: { id: string; name: string; amount_cents: number } | null;
};

/**
 * PostgREST separa las condiciones de un `or=(…)` con comas y paréntesis: si el
 * texto buscado los trae, rompe el filtro. Los sacamos (nadie busca por coma).
 */
function limpiarBusqueda(texto: string): string {
  return texto.replace(/[,()\\"]/g, ' ').trim();
}

export async function listarAlumnos(
  filtros: FiltrosAlumno = {},
): Promise<{ items: AlumnoListado[]; total: number; pagina: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('students')
    .select(
      '*, groups(id, name, weekday, start_time, end_time), plans(id, name), rates(id, name, amount_cents)',
      { count: 'exact' },
    )
    .order('last_name')
    .order('first_name');

  const q = filtros.q ? limpiarBusqueda(filtros.q) : '';
  if (q) {
    // Nombre, apellido, DNI o correo: es como la busca una persona en el mostrador.
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,dni.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }
  if (filtros.estado) query = query.eq('status', filtros.estado as Enums<'student_status'>);
  if (filtros.grupo) query = query.eq('group_id', filtros.grupo);

  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const desde = (pagina - 1) * ALUMNOS_POR_PAGINA;
  query = query.range(desde, desde + ALUMNOS_POR_PAGINA - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return { items: data ?? [], total: count ?? 0, pagina };
}

/** Ficha del alumno con sus relaciones. `null` si no existe. */
export type AlumnoDetalle = Student & {
  groups: {
    id: string;
    name: string;
    weekday: number;
    start_time: string;
    end_time: string;
    capacity: number;
  } | null;
  plans: { id: string; name: string; price_cents: number } | null;
  rates: { id: string; name: string; amount_cents: number } | null;
  profiles: { id: string; email: string | null; must_change_password: boolean } | null;
};

/** `cache()`: la ficha se pide en `generateMetadata` y en la página; se consulta una sola vez. */
export const getAlumno = cache(async (id: string): Promise<AlumnoDetalle | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select(
      '*, groups(id, name, weekday, start_time, end_time, capacity), plans(id, name, price_cents), rates(id, name, amount_cents), profiles(id, email, must_change_password)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
});

export type HistorialGrupo = Tables<'student_groups'> & {
  groups: { name: string; weekday: number; start_time: string; end_time: string } | null;
};

export type HistorialTarifa = Tables<'student_rates'> & {
  rates: { name: string } | null;
};

export type ResumenAsistencia = {
  total: number;
  presentes: number;
  ausentesJustificadas: number;
  ausentesSinJustificar: number;
  recuperaciones: number;
  canceladas: number;
  /** Porcentaje de presencias sobre las clases que contaban (excluye las canceladas). */
  porcentaje: number | null;
};

export type AsistenciaReciente = {
  id: string;
  status: Enums<'attendance_status'>;
  fecha: string | null;
};

/**
 * Todo lo que muestra la ficha del alumno, en una sola tanda de consultas.
 * La RLS decide qué se ve: si quien consulta no es la administradora, no ve nada.
 */
export async function getFichaAlumno(id: string) {
  const supabase = await createClient();

  const [grupos, tarifas, cuotas, matriculas, inscripciones, asistencias, ultimas] =
    await Promise.all([
      supabase
        .from('student_groups')
        .select('*, groups(name, weekday, start_time, end_time)')
        .eq('student_id', id)
        .order('from_date', { ascending: false })
        .order('created_at', { ascending: false }),

      supabase
        .from('student_rates')
        .select('*, rates(name)')
        .eq('student_id', id)
        .order('from_date', { ascending: false })
        .order('created_at', { ascending: false }),

      supabase
        .from('monthly_fees')
        .select('*')
        .eq('student_id', id)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(12),

      supabase
        .from('registration_fees')
        .select('*')
        .eq('student_id', id)
        .order('issued_date', { ascending: false }),

      supabase
        .from('enrollments')
        .select('*')
        .eq('student_id', id)
        .order('enrolled_at', { ascending: false })
        .order('created_at', { ascending: false }),

      supabase.from('attendance').select('status').eq('student_id', id),

      supabase
        .from('attendance')
        .select('id, status, class_sessions(session_date)')
        .eq('student_id', id)
        .order('recorded_at', { ascending: false })
        .limit(5),
    ]);

  for (const r of [grupos, tarifas, cuotas, matriculas, inscripciones, asistencias, ultimas]) {
    if (r.error) throw r.error;
  }

  const filas = asistencias.data ?? [];
  const cuenta = (estado: Enums<'attendance_status'>) =>
    filas.filter((f) => f.status === estado).length;

  const presentes = cuenta('presente');
  const recuperaciones = cuenta('recuperacion');
  const canceladas = cuenta('cancelada_academia');
  // Una clase que canceló la academia no puede contar como ausencia del alumno.
  const computables = filas.length - canceladas;

  const resumen: ResumenAsistencia = {
    total: filas.length,
    presentes,
    ausentesJustificadas: cuenta('ausente_justificada'),
    ausentesSinJustificar: cuenta('ausente_sin_justificar'),
    recuperaciones,
    canceladas,
    porcentaje:
      computables > 0 ? Math.round(((presentes + recuperaciones) / computables) * 100) : null,
  };

  const recientes: AsistenciaReciente[] = (ultimas.data ?? []).map((a) => ({
    id: a.id,
    status: a.status,
    fecha: a.class_sessions?.session_date ?? null,
  }));

  return {
    historialGrupos: (grupos.data ?? []) as HistorialGrupo[],
    historialTarifas: (tarifas.data ?? []) as HistorialTarifa[],
    cuotas: cuotas.data ?? [],
    matriculas: matriculas.data ?? [],
    inscripciones: inscripciones.data ?? [],
    asistencia: resumen,
    asistenciasRecientes: recientes,
  };
}

export type FichaAlumno = Awaited<ReturnType<typeof getFichaAlumno>>;

/** ¿Ya hay un alumno con ese correo? (el correo es la llave con la que entra al sistema). */
export async function existeAlumnoConCorreo(email: string, excepto?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from('students').select('id').ilike('email', email).limit(1);
  if (excepto) query = query.neq('id', excepto);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}
