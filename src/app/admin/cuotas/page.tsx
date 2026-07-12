import type { Metadata } from 'next';

import {
  aniosConCuotas,
  listarCuotas,
  listarGruposParaFiltro,
  metricasCuotas,
  periodoActual,
} from '@/lib/services/fees';
import { listarCajasActivas, listarMediosPago } from '@/lib/services/cash';
import { CuotasClient } from './cuotas-client';

export const metadata: Metadata = { title: 'Cuotas' };

type Params = {
  anio?: string;
  mes?: string;
  estado?: string;
  grupo?: string;
  q?: string;
  pagina?: string;
};

/**
 * Página de servidor: lee (con RLS) y le pasa todo al componente de cliente.
 *
 * El período es el recorte con el que se trabaja, no un filtro más: si la URL no
 * lo trae, se usa el mes en curso.
 */
export default async function CuotasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const actual = periodoActual();

  const anio = Number(sp.anio) || actual.anio;
  const mes = Number(sp.mes) || actual.mes;

  const filtros = {
    anio: String(anio),
    mes: String(mes),
    estado: sp.estado,
    grupo: sp.grupo,
    q: sp.q,
    pagina: sp.pagina,
  };

  const [listado, metricas, aniosEmitidos, grupos, cajas, medios] = await Promise.all([
    listarCuotas(filtros),
    metricasCuotas(filtros),
    aniosConCuotas(),
    listarGruposParaFiltro(),
    listarCajasActivas(),
    listarMediosPago(),
  ]);

  // El año elegido siempre tiene que estar en el desplegable, aunque todavía no
  // tenga cuotas emitidas.
  const anios = [...new Set([...aniosEmitidos, anio])].sort((a, b) => b - a);

  return (
    <CuotasClient
      cuotas={listado.filas}
      total={listado.total}
      metricas={metricas}
      anio={anio}
      mes={mes}
      anios={anios}
      grupos={grupos}
      medios={medios}
      cajas={cajas}
    />
  );
}
