import type { Metadata } from 'next';

import {
  listarAlumnosParaSelect,
  listarCategoriasActivas,
  listarMovimientos,
  listarTalleresParaSelect,
  totalesMovimientos,
} from '@/lib/services/movements';
import { listarCajasActivas, listarMediosPago } from '@/lib/services/cash';
import { MovimientosClient } from './movimientos-client';

export const metadata: Metadata = { title: 'Ingresos y gastos' };

type Params = {
  tipo?: string;
  categoria?: string;
  caja?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const filtros = await searchParams;

  const [listado, totales, categorias, cajas, medios, alumnos, talleres] = await Promise.all([
    listarMovimientos(filtros),
    totalesMovimientos(filtros),
    listarCategoriasActivas(),
    listarCajasActivas(),
    listarMediosPago(),
    listarAlumnosParaSelect(),
    listarTalleresParaSelect(),
  ]);

  return (
    <MovimientosClient
      movimientos={listado.filas}
      total={listado.total}
      totales={totales}
      categorias={categorias}
      cajas={cajas}
      medios={medios}
      alumnos={alumnos}
      talleres={talleres}
    />
  );
}
