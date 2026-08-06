import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { listarTerminos } from '@/lib/services/library';
import { GlosarioClient } from './glosario-client';

export const metadata: Metadata = { title: 'Glosario de costura' };

/**
 * El glosario se trae ENTERO (hasta el tope de la vista agrupada) en vez de
 * paginado: un diccionario se recorre de arriba abajo, y partirlo en páginas de
 * veinte obligaría a adivinar en cuál está la letra que se busca. Si algún día
 * pasa de unos cientos de términos, el buscador ya está y el tope avisa.
 */
export default async function GlosarioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStudent();
  const { q } = await searchParams;

  const { terminos } = await listarTerminos({ q, todo: true });

  return <GlosarioClient terminos={terminos} buscando={Boolean(q?.trim())} />;
}
