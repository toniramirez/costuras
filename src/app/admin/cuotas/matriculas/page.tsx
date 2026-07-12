import type { Metadata } from 'next';

import { listarMatriculas } from '@/lib/services/fees';
import { listarCajasActivas, listarMediosPago } from '@/lib/services/cash';
import { MatriculasClient } from './matriculas-client';

export const metadata: Metadata = { title: 'Matrículas' };

export default async function MatriculasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string }>;
}) {
  const { estado, q, pagina } = await searchParams;

  const [listado, cajas, medios] = await Promise.all([
    listarMatriculas({ estado, q, pagina }),
    listarCajasActivas(),
    listarMediosPago(),
  ]);

  return (
    <MatriculasClient
      matriculas={listado.filas}
      total={listado.total}
      impagas={listado.impagas}
      totalPorCobrar={listado.totalPorCobrar}
      medios={medios}
      cajas={cajas}
    />
  );
}
