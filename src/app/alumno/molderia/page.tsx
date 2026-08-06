import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { molderiaDeLaAlumna } from '@/lib/services/library';
import { MolderiaClient } from './molderia-client';

export const metadata: Metadata = { title: 'Moldería digital' };

export default async function MolderiaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStudent();
  const { q } = await searchParams;

  const secciones = await molderiaDeLaAlumna({ q });

  return <MolderiaClient secciones={secciones} buscando={Boolean(q?.trim())} />;
}
