import type { Metadata } from 'next';

import { listarTalleres, listarCajasActivas } from '@/lib/services/workshops';
import { getSettings } from '@/lib/settings';
import { TalleresClient } from './talleres-client';

export const metadata: Metadata = { title: 'Talleres' };

/**
 * Página de servidor: lee (con RLS) y le pasa los datos al componente de cliente,
 * que maneja diálogos y formularios.
 *
 * Los filtros viajan por searchParams: se conservan al navegar, al volver atrás y
 * al recargar.
 */
export default async function TalleresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { q, estado, pagina } = await searchParams;

  const [{ talleres, total }, cajas, settings] = await Promise.all([
    listarTalleres({ q, estado, pagina: Number(pagina) || 1 }),
    listarCajasActivas(),
    getSettings(),
  ]);

  return (
    <TalleresClient
      talleres={talleres}
      total={total}
      cajas={cajas}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 5,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
