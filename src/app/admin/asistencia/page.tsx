import type { Metadata } from 'next';

import { getHojaAsistencia, listarGruposActivos } from '@/lib/services/attendance';
import { esquemaClase } from '@/lib/validations/attendance';
import { todayISO } from '@/lib/format';
import { AttendanceClient } from './attendance-client';

export const metadata: Metadata = { title: 'Asistencia' };

/**
 * Página de servidor: trae la planilla y se la pasa al cliente, que maneja los
 * toques y los diálogos.
 *
 * El grupo y la fecha viajan por searchParams (patrón del sistema): así el
 * enlace a una clase concreta se puede guardar, compartir y recargar.
 */
export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string; fecha?: string }>;
}) {
  const { grupo, fecha } = await searchParams;

  // Por defecto, hoy. Si en la URL viene cualquier cosa, la ignoramos.
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayISO();

  // El grupo también llega de la URL: validamos antes de consultar, porque un
  // uuid inválido hace fallar a Postgres y voltearía la página entera.
  const seleccion = esquemaClase.safeParse({ group_id: grupo, session_date: dia });

  const [grupos, hoja] = await Promise.all([
    listarGruposActivos(),
    seleccion.success
      ? getHojaAsistencia(seleccion.data.group_id, seleccion.data.session_date)
      : Promise.resolve(null),
  ]);

  return <AttendanceClient grupos={grupos} hoja={hoja} fecha={dia} />;
}
