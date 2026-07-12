import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/auth';
import {
  firmarUrls,
  getProyectoCompleto,
  listarAlumnos,
  tiposDePrenda,
} from '@/lib/services/projects';
import { AdminDetailClient } from './detail-client';

export const metadata: Metadata = { title: 'Proyecto' };

/**
 * Detalle de un proyecto (panel). La administradora mira: no comenta ni sube
 * archivos (la política de Storage solo deja subir al alumno dueño).
 */
export default async function AdminProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const completo = await getProyectoCompleto(id);
  if (!completo) notFound();

  const { proyecto, entradas, archivos } = completo;

  const [urls, alumnos, tipos] = await Promise.all([
    firmarUrls([proyecto.cover_image_path, ...archivos.map((a) => a.storage_path)]),
    listarAlumnos(),
    tiposDePrenda(null),
  ]);

  return (
    <AdminDetailClient
      proyecto={proyecto}
      entradas={entradas}
      archivos={archivos}
      urls={urls}
      alumnos={alumnos}
      tipos={tipos}
    />
  );
}
