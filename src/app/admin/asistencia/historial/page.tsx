import type { Metadata } from 'next';

import { listarGruposActivos, listarHistorial } from '@/lib/services/attendance';
import { getSettings } from '@/lib/settings';
import { HistoryClient } from './history-client';

export const metadata: Metadata = { title: 'Historial de asistencia' };

const VIGENCIA_POR_DEFECTO = 30;

/**
 * Todos los filtros viajan por searchParams. Los servicios descartan lo que no
 * tenga forma válida (un uuid roto, un estado inexistente): la URL la escribe
 * cualquiera y la página no se puede caer por eso.
 */
export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    grupo?: string;
    estado?: string;
    desde?: string;
    hasta?: string;
    pagina?: string;
  }>;
}) {
  const { q, grupo, estado, desde, hasta, pagina } = await searchParams;

  const [{ filas, total }, grupos, settings] = await Promise.all([
    listarHistorial({ q, grupo, estado, desde, hasta, pagina: Number(pagina) || 1 }),
    listarGruposActivos(),
    getSettings(),
  ]);

  return (
    <HistoryClient
      filas={filas}
      total={total}
      grupos={grupos}
      validezDias={settings?.recovery_validity_days ?? VIGENCIA_POR_DEFECTO}
    />
  );
}
