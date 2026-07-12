import type { Metadata } from 'next';

import { listarCategorias } from '@/lib/services/movements';
import { CategoriasClient } from './categorias-client';

export const metadata: Metadata = { title: 'Categorías' };

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const categorias = await listarCategorias(kind);

  return <CategoriasClient categorias={categorias} />;
}
