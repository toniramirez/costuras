import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireStudent } from '@/lib/auth';
import {
  firmarUrls,
  getLimitesArchivo,
  getProyectoCompleto,
  tiposDePrenda,
} from '@/lib/services/projects';
import { DetailClient } from './detail-client';

export const metadata: Metadata = { title: 'Proyecto' };

/**
 * Detalle de un proyecto del alumno: la ficha y la línea de tiempo de avances.
 *
 * Si la RLS no devuelve el proyecto (no existe, o es de otra persona) → 404.
 * A propósito no distinguimos los dos casos: un mensaje distinto le confirmaría
 * a alguien que el proyecto de otra persona existe.
 */
export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { student } = await requireStudent();

  const completo = await getProyectoCompleto(id);
  if (!completo || completo.proyecto.student_id !== student.id) notFound();

  const { proyecto, entradas, archivos } = completo;

  const [limites, urls, tipos] = await Promise.all([
    getLimitesArchivo(),
    firmarUrls([proyecto.cover_image_path, ...archivos.map((a) => a.storage_path)]),
    tiposDePrenda(student.id),
  ]);

  return (
    <DetailClient
      proyecto={proyecto}
      entradas={entradas}
      archivos={archivos}
      urls={urls}
      limites={limites}
      tipos={tipos}
      studentId={student.id}
    />
  );
}
