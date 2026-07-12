import { z } from 'zod';

/**
 * Validación de tarifas.
 *
 * OJO con el dinero: el FORMULARIO trabaja en PESOS (es lo que la persona
 * escribe) y la BASE guarda CENTAVOS enteros. La conversión se hace en la server
 * action con `pesosToCents`, nunca antes.
 *
 * Números: `z.number()` + `{ valueAsNumber: true }` en el register. Nunca
 * `z.coerce` (en Zod 4 su tipo de entrada es `unknown` y rompe React Hook Form).
 */
const FECHA_OPCIONAL = /^(\d{4}-\d{2}-\d{2})?$/; // '' o YYYY-MM-DD

/** Id de un <select> opcional: la opción «sin modalidad» manda ''. */
const idOpcional = z.union([z.uuid('Elegí una opción válida'), z.literal('')]).optional();

export const esquemaTarifa = z
  .object({
    name: z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres'),
    plan_id: idOpcional,
    valid_from: z.string().regex(FECHA_OPCIONAL, 'Poné una fecha válida').optional(),
    valid_until: z.string().regex(FECHA_OPCIONAL, 'Poné una fecha válida').optional(),
    /** En PESOS. Se convierte a centavos en la server action. */
    importe: z
      .number({ message: 'Tiene que ser un número' })
      .min(0, 'No puede ser negativo')
      .max(99_999_999, 'El importe es demasiado grande'),
    is_active: z.boolean(),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  })
  // Misma regla que la restricción `rates_valid_range` de la base.
  .refine((v) => !v.valid_from || !v.valid_until || v.valid_until >= v.valid_from, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['valid_until'],
  });

export type DatosTarifa = z.infer<typeof esquemaTarifa>;
