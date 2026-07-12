'use client';

import { useEffect, useRef } from 'react';

import { marcarNovedadesLeidas } from '@/app/actions/comms';

/**
 * Marca como leídas las novedades que el alumno tiene en pantalla.
 *
 * Una novedad es un tablón: se da por leída al verla, no hace falta un botón.
 * Con eso, el «leída por N de M» de la administración dice algo real.
 */
export function MarcarNovedadesLeidas({ ids }: { ids: string[] }) {
  const yaAvisado = useRef(false);
  const clave = ids.join(',');

  useEffect(() => {
    if (!clave || yaAvisado.current) return;
    yaAvisado.current = true;
    marcarNovedadesLeidas(clave.split(','));
  }, [clave]);

  return null;
}
