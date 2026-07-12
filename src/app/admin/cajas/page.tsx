import type { Metadata } from 'next';

import { listarCajas } from '@/lib/services/cash';
import { CajasClient } from './cajas-client';

export const metadata: Metadata = { title: 'Cajas' };

/** El saldo de cada caja se lee de la vista `cash_account_balances`. Nunca se guarda. */
export default async function CajasPage() {
  const cajas = await listarCajas();
  return <CajasClient cajas={cajas} />;
}
