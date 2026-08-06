import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { centroDeAyuda } from '@/lib/services/library';
import { AyudaClient } from './ayuda-client';

export const metadata: Metadata = { title: '¡Necesito ayuda!' };

/**
 * Centro de ayuda de la alumna.
 *
 * `requireStudent()` no está por seguridad —de eso se ocupa la RLS, que solo
 * devuelve lo publicado— sino por coherencia: esta ruta vive bajo /alumno y la
 * administradora tiene su propia pantalla para el mismo material.
 */
export default async function AyudaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStudent();
  const { q } = await searchParams;

  const secciones = await centroDeAyuda({ q });

  return <AyudaClient secciones={secciones} buscando={Boolean(q?.trim())} />;
}
