import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth';
import { paginaDe } from '@/lib/pagination';
import {
  firmarUrls,
  listarAlumnos,
  listarProyectosAdmin,
  tiposDePrenda,
} from '@/lib/services/projects';
import { AdminProjectsClient } from './projects-client';

export const metadata: Metadata = { title: 'Proyectos' };

/**
 * Los proyectos de todos los alumnos.
 *
 * La RLS deja ver todo solo a la administradora: si esta consulta la hiciera un
 * alumno, la base le devolvería únicamente los suyos.
 */
export default async function AdminProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    dificultad?: string;
    alumno?: string;
    pagina?: string;
  }>;
}) {
  await requireAdmin();
  const { q, estado, dificultad, alumno, pagina } = await searchParams;

  const { items, total } = await listarProyectosAdmin({
    q,
    estado,
    dificultad,
    alumno,
    pagina: paginaDe(pagina),
  });

  const [alumnos, tipos, portadas] = await Promise.all([
    listarAlumnos(),
    tiposDePrenda(null),
    firmarUrls(items.map((p) => p.cover_image_path)),
  ]);

  return (
    <AdminProjectsClient
      proyectos={items}
      total={total}
      alumnos={alumnos}
      tipos={tipos}
      portadas={portadas}
    />
  );
}
