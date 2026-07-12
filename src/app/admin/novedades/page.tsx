import type { Metadata } from 'next';

import { listarNovedades, opcionesDestinatarios } from '@/lib/services/comms';
import { getSettings } from '@/lib/settings';
import { NovedadesClient } from './news-client';

export const metadata: Metadata = { title: 'Novedades' };

export default async function NovedadesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; prioridad?: string; pagina?: string }>;
}) {
  const { q, estado, prioridad, pagina } = await searchParams;

  const [novedades, destino, settings] = await Promise.all([
    listarNovedades({ q, estado, prioridad, pagina: Number(pagina) || 1 }),
    opcionesDestinatarios(),
    getSettings(),
  ]);

  return (
    <NovedadesClient
      novedades={novedades.items}
      total={novedades.total}
      opcionesDestino={destino}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 10,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
