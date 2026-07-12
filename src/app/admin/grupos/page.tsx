import type { Metadata } from 'next';

import { listarGrupos } from '@/lib/services/groups';
import { listarPlanesActivos } from '@/lib/services/plans';
import { GroupsClient } from './groups-client';

export const metadata: Metadata = { title: 'Grupos' };

/**
 * Página de servidor: lee los datos (con RLS) y se los pasa al componente de
 * cliente, que maneja diálogos y formularios.
 *
 * Los filtros llegan por searchParams: así se conservan al navegar, al volver
 * atrás y al recargar.
 */
export default async function GruposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; activo?: string; dia?: string }>;
}) {
  const { q, activo, dia } = await searchParams;

  const [grupos, planes] = await Promise.all([
    listarGrupos({ q, activo, dia }),
    listarPlanesActivos(),
  ]);

  return <GroupsClient grupos={grupos} planes={planes} />;
}
