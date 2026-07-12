import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { paginaDe } from '@/lib/pagination';
import { firmarUrls, listarMisProyectos, tiposDePrenda } from '@/lib/services/projects';
import { ProjectsClient } from './projects-client';

export const metadata: Metadata = { title: 'Mis proyectos' };

/**
 * Los proyectos del alumno.
 *
 * `listarMisProyectos` filtra explícitamente por su `student_id`: la RLS ya lo
 * garantiza, pero no armamos ninguna consulta que dependa solo de eso.
 */
export default async function MisProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; dificultad?: string; pagina?: string }>;
}) {
  const { student } = await requireStudent();
  const { q, estado, dificultad, pagina } = await searchParams;

  const { items, total } = await listarMisProyectos(student.id, {
    q,
    estado,
    dificultad,
    pagina: paginaDe(pagina),
  });

  const [tipos, portadas] = await Promise.all([
    tiposDePrenda(student.id),
    firmarUrls(items.map((p) => p.cover_image_path)),
  ]);

  return (
    <ProjectsClient proyectos={items} total={total} tipos={tipos} portadas={portadas} />
  );
}
