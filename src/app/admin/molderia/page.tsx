import type { Metadata } from 'next';

import { listarCategorias, listarMoldes, usoDeCategorias } from '@/lib/services/library';
import { getSettings } from '@/lib/settings';
import { paginaDe } from '@/lib/pagination';
import { MolderiaClient } from './molderia-client';

export const metadata: Metadata = { title: 'Moldería digital' };

/**
 * Página de servidor: lee (con RLS) y le pasa los datos al componente de cliente,
 * que maneja diálogos y formularios. Los filtros viajan por searchParams.
 */
export default async function MolderiaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; pagina?: string }>;
}) {
  const { q, categoria, pagina } = await searchParams;

  const [{ moldes, total }, categorias, uso, settings] = await Promise.all([
    listarMoldes({ q, categoria, pagina: paginaDe(pagina) }),
    listarCategorias('molderia'),
    usoDeCategorias('molderia'),
    getSettings(),
  ]);

  return (
    <MolderiaClient
      moldes={moldes}
      total={total}
      categorias={categorias}
      uso={uso}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 5,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
