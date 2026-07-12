import { z } from 'zod';

import { esquemaFecha } from './attendance';

/**
 * Validación de recuperaciones.
 *
 * Ojo: acá NO se valida la regla de negocio (que la ausencia sea justificada,
 * que el grupo tenga cupo, que el crédito no se use dos veces, cuándo vence).
 * Todo eso vive en las funciones de la base y ya está probado. Esto solo
 * comprueba que los datos tengan la forma correcta antes de llamarlas.
 */

/** Estados del enum `recovery_status`. Sirven de guarda para el filtro de la URL. */
export const ESTADOS_RECUPERACION = [
  'disponible',
  'reservada',
  'utilizada',
  'vencida',
  'cancelada',
] as const;

/**
 * Generar el crédito a partir de una ausencia.
 *
 * `force` es la excepción manual de la administradora: permite generar la
 * recuperación de una ausencia SIN justificar. La base lo exige explícitamente,
 * y la UI lo pide con una confirmación aparte.
 */
export const esquemaEmision = z.object({
  attendance_id: z.uuid('Elegí la ausencia'),
  reason: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  force: z.boolean(),
});
export type DatosEmision = z.infer<typeof esquemaEmision>;

/**
 * Grupo y fecha de destino. Sirve para reservar y para registrar el uso.
 * Si el grupo no tiene cupo, la reserva la rechaza la base.
 */
export const esquemaDestino = z.object({
  credit_id: z.uuid(),
  group_id: z.uuid('Elegí un grupo'),
  date: esquemaFecha,
});
export type DatosDestino = z.infer<typeof esquemaDestino>;

/** Cancelar un crédito. El motivo queda asentado: no se cancela "porque sí". */
export const esquemaCancelacion = z.object({
  credit_id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, 'Contá por qué la cancelás')
    .max(300, 'Máximo 300 caracteres'),
});
export type DatosCancelacion = z.infer<typeof esquemaCancelacion>;
