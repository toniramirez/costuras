import type { Metadata } from 'next';

import { listarTarifas } from '@/lib/services/rates';
import { listarPlanesActivos } from '@/lib/services/plans';
import { RatesClient } from './rates-client';

export const metadata: Metadata = { title: 'Tarifas' };

/**
 * Página de servidor: lee los datos (con RLS) y se los pasa al componente de
 * cliente, que maneja diálogos y formularios.
 */
export default async function TarifasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; activa?: string; plan?: string }>;
}) {
  const { q, activa, plan } = await searchParams;

  const [tarifas, planes] = await Promise.all([
    listarTarifas({ q, activa, plan }),
    listarPlanesActivos(),
  ]);

  return <RatesClient tarifas={tarifas} planes={planes} />;
}
