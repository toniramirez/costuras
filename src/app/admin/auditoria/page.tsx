import type { Metadata } from 'next';

import { listarAuditoria } from '@/lib/services/settings-admin';
import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'Auditoría' };

/**
 * Página de servidor.
 *
 * Los filtros llegan por searchParams (nunca por estado local): así se conservan
 * al navegar, al volver atrás y al recargar, y el enlace se puede compartir.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    entidad?: string;
    accion?: string;
    usuario?: string;
    desde?: string;
    hasta?: string;
    pagina?: string;
  }>;
}) {
  const { entidad, accion, usuario, desde, hasta, pagina } = await searchParams;

  const { filas, total, porPagina } = await listarAuditoria({
    entidad,
    accion,
    usuario,
    desde,
    hasta,
    pagina,
  });

  return <AuditClient registros={filas} total={total} porPagina={porPagina} />;
}
