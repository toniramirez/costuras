import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { firmarUrls, listarGaleria, tiposDePrenda } from '@/lib/services/projects';
import { GalleryClient } from './gallery-client';

export const metadata: Metadata = { title: 'Mi galería' };

/**
 * La galería del alumno: SOLO sus proyectos terminados.
 *
 * Es su vitrina, no la de la academia: `listarGaleria` recibe su `student_id` y
 * filtra por él. Ningún alumno ve los proyectos de otro.
 */
export default async function GaleriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; dificultad?: string }>;
}) {
  const { student } = await requireStudent();
  const { tipo, dificultad } = await searchParams;

  const proyectos = await listarGaleria(student.id, { tipo, dificultad });

  const [tipos, portadas] = await Promise.all([
    tiposDePrenda(student.id),
    firmarUrls(proyectos.map((p) => p.cover_image_path)),
  ]);

  return <GalleryClient proyectos={proyectos} tipos={tipos} portadas={portadas} />;
}
