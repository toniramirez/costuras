import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  obtenerTaller,
  listarInscripciones,
  listarCajasActivas,
  listarMediosDePago,
  listarAlumnosParaInscribir,
} from '@/lib/services/workshops';
import { getSettings } from '@/lib/settings';
import { TallerDetalleClient } from './taller-detalle-client';

export const metadata: Metadata = { title: 'Taller' };

/**
 * Ficha del taller e inscripciones.
 *
 * Las tres listas (confirmados, pendientes de pago y lista de espera) salen de la
 * misma consulta. El resumen se calcula sobre TODAS las inscripciones, así que no
 * cambia aunque haya un filtro puesto.
 */
export default async function TallerDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { id } = await params;
  const { q, estado } = await searchParams;

  const taller = await obtenerTaller(id);
  if (!taller) notFound();

  const [{ filas, resumen }, cajas, medios, alumnos, settings] = await Promise.all([
    listarInscripciones(id, { q, estado }),
    listarCajasActivas(),
    listarMediosDePago(),
    listarAlumnosParaInscribir(),
    getSettings(),
  ]);

  return (
    <TallerDetalleClient
      taller={taller}
      inscripciones={filas}
      resumen={resumen}
      cajas={cajas}
      medios={medios}
      alumnos={alumnos}
      filtroEstado={estado ?? ''}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 5,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
