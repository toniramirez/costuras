import type { Metadata } from 'next';

import { ALUMNOS_POR_PAGINA, listarAlumnos } from '@/lib/services/students';
import { listarGruposParaFiltro } from '@/lib/services/groups';
import { StudentsClient } from './students-client';

export const metadata: Metadata = { title: 'Alumnos' };

/**
 * Página de servidor: lee los datos (con RLS) y se los pasa al componente de
 * cliente.
 *
 * Los filtros y la página llegan por searchParams: así se conservan al navegar,
 * al volver atrás, al recargar y al compartir el enlace.
 */
export default async function AlumnosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; grupo?: string; pagina?: string }>;
}) {
  const { q, estado, grupo, pagina } = await searchParams;

  const [alumnos, grupos] = await Promise.all([
    listarAlumnos({ q, estado, grupo, pagina }),
    listarGruposParaFiltro(),
  ]);

  return (
    <StudentsClient
      alumnos={alumnos.items}
      total={alumnos.total}
      porPagina={ALUMNOS_POR_PAGINA}
      grupos={grupos}
    />
  );
}
