import type { Metadata } from 'next';
import { listarPlanes } from '@/lib/services/plans';
import { PlansClient } from './plans-client';

export const metadata: Metadata = { title: 'Modalidades' };

/**
 * Página de servidor: lee los datos (con RLS) y se los pasa al componente de
 * cliente, que maneja diálogos y formularios.
 *
 * Los filtros llegan por searchParams: así se conservan al navegar, al volver
 * atrás y al recargar.
 */
export default async function ModalidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; activo?: string }>;
}) {
  const { q, activo } = await searchParams;
  const planes = await listarPlanes({ q, activo });

  return <PlansClient planes={planes} />;
}
