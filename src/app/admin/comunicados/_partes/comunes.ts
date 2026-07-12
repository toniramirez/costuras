import { formatInTimeZone } from 'date-fns-tz';

import { TIMEZONE } from '@/lib/format';
import type { Tone } from '@/lib/labels';
import type { Enums } from '@/lib/supabase/database.types';

/**
 * Piezas compartidas por Comunicados y Novedades: son el mismo mecanismo de
 * destinatarios y de adjuntos, así que se escriben una sola vez.
 *
 * Viven en `_partes` (carpeta privada: Next no la convierte en ruta) y las usan
 * las dos secciones.
 */

type Etiqueta = { label: string; tone: Tone };

export const ESTADO_PUBLICACION: Record<Enums<'publish_status'>, Etiqueta> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  publicada: { label: 'Publicada', tone: 'success' },
  archivada: { label: 'Archivada', tone: 'neutral' },
};

/** Estados que se ofrecen en el formulario (`archivada` no se usa todavía). */
export const ESTADOS_EDITABLES = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'publicada', label: 'Publicada' },
] as const;

export const ALCANCE: Record<Enums<'recipient_scope'>, { label: string; hint: string }> = {
  todos: {
    label: 'Todos los alumnos',
    hint: 'Los alumnos activos, pausados y los que todavía no empezaron.',
  },
  grupo: {
    label: 'Un grupo',
    hint: 'Los alumnos que hoy cursan en ese grupo.',
  },
  alumno: {
    label: 'Alumnos puntuales',
    hint: 'Uno o varios, elegidos a mano.',
  },
  cuota_pendiente: {
    label: 'Con la cuota pendiente',
    hint: 'Cuotas pendientes, vencidas o con un comprobante a revisar.',
  },
  taller: {
    label: 'Inscriptos a un taller',
    hint: 'Los inscriptos que no cancelaron (incluye la lista de espera).',
  },
};

export const OPCIONES_ALCANCE = (
  Object.keys(ALCANCE) as Array<Enums<'recipient_scope'>>
).map((value) => ({ value, label: ALCANCE[value].label }));

/** timestamptz → "YYYY-MM-DD" en hora de Córdoba, listo para un <input type="date">. */
export function fechaParaInput(instante: string | null | undefined): string {
  if (!instante) return '';
  return formatInTimeZone(new Date(instante), TIMEZONE, 'yyyy-MM-dd');
}

/** 24576 → "24 KB" */
export function tamanioArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
