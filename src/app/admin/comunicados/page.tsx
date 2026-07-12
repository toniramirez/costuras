import type { Metadata } from 'next';

import { listarComunicados, opcionesDestinatarios } from '@/lib/services/comms';
import { getSettings } from '@/lib/settings';
import { ComunicadosClient } from './comms-client';

export const metadata: Metadata = { title: 'Comunicados' };

/**
 * Bandeja de salida.
 *
 * La página de servidor lee (con RLS) y le pasa todo al cliente, que maneja el
 * formulario y los diálogos. Los filtros viajan por searchParams: se conservan al
 * volver atrás, al recargar y al compartir el enlace.
 */
export default async function ComunicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; prioridad?: string; pagina?: string }>;
}) {
  const { q, estado, prioridad, pagina } = await searchParams;

  const [comunicados, destino, settings] = await Promise.all([
    listarComunicados({ q, estado, prioridad, pagina: Number(pagina) || 1 }),
    opcionesDestinatarios(),
    getSettings(),
  ]);

  return (
    <ComunicadosClient
      comunicados={comunicados.items}
      total={comunicados.total}
      opcionesDestino={destino}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 10,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
