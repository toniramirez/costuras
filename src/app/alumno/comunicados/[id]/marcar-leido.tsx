'use client';

import { useEffect, useRef } from 'react';

import { marcarComunicadoLeido } from '@/app/actions/comms';

/**
 * Marca el comunicado como leído al abrirlo.
 *
 * No dibuja nada: es un efecto. Se marca al ABRIR (no con un botón «marcar como
 * leído»), que es lo que la persona espera de una bandeja de entrada.
 *
 * La server action hace `revalidatePath`, así que al volver a la bandeja el
 * contador ya está actualizado: no hace falta refrescar esta pantalla.
 */
export function MarcarLeido({
  comunicadoId,
  yaLeido,
}: {
  comunicadoId: string;
  yaLeido: boolean;
}) {
  const yaAvisado = useRef(false);

  useEffect(() => {
    if (yaLeido || yaAvisado.current) return;
    yaAvisado.current = true;
    marcarComunicadoLeido(comunicadoId);
  }, [comunicadoId, yaLeido]);

  return null;
}
