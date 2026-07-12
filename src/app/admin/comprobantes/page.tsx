import type { Metadata } from 'next';

import { listarComprobantes } from '@/lib/services/fees';
import { listarCajasActivas, listarMediosPago } from '@/lib/services/cash';
import { ComprobantesClient } from './comprobantes-client';

export const metadata: Metadata = { title: 'Comprobantes' };

/**
 * Bandeja de comprobantes. Por defecto muestra los que están esperando revisión:
 * es para eso que se entra a esta pantalla.
 *
 * Las URLs firmadas del bucket privado `proofs` se generan en el servicio (lado
 * servidor) y duran una hora.
 */
export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const estado = sp.estado ?? 'pendiente';

  const [listado, cajas, medios] = await Promise.all([
    listarComprobantes({ estado, q: sp.q, pagina: sp.pagina }),
    listarCajasActivas(),
    listarMediosPago(),
  ]);

  return (
    <ComprobantesClient
      comprobantes={listado.filas}
      total={listado.total}
      pendientes={listado.pendientes}
      estado={estado}
      medios={medios}
      cajas={cajas}
    />
  );
}
