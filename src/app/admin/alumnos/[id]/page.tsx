import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getAlumno, getFichaAlumno } from '@/lib/services/students';
import { listarGruposActivos, ocupacionPorGrupo } from '@/lib/services/groups';
import { listarTarifasActivas } from '@/lib/services/rates';
import { listarPlanesActivos } from '@/lib/services/plans';
import { StudentDetail } from './student-detail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const alumno = await getAlumno(id); // cacheado: no repite la consulta de la página
  return { title: alumno ? `${alumno.first_name} ${alumno.last_name}` : 'Alumno' };
}

/**
 * Ficha del alumno.
 *
 * El servidor trae todo (con RLS) y el cliente solo maneja los diálogos: editar,
 * pausar, reactivar y dar de baja.
 */
export default async function AlumnoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const alumno = await getAlumno(id);
  if (!alumno) notFound();

  const [ficha, grupos, planes, tarifas, ocupaciones] = await Promise.all([
    getFichaAlumno(id),
    listarGruposActivos(),
    listarPlanesActivos(),
    listarTarifasActivas(),
    ocupacionPorGrupo(),
  ]);

  // Ocupación del grupo en el que está hoy (para mostrarla en la ficha).
  const ocupacionActual = alumno.group_id ? (ocupaciones.get(alumno.group_id) ?? null) : null;

  return (
    <StudentDetail
      alumno={alumno}
      ficha={ficha}
      grupos={grupos}
      planes={planes}
      tarifas={tarifas}
      ocupacionActual={
        ocupacionActual
          ? {
              current_students: ocupacionActual.current_students ?? 0,
              capacity: ocupacionActual.capacity ?? 0,
              is_full: ocupacionActual.is_full ?? false,
            }
          : null
      }
    />
  );
}
