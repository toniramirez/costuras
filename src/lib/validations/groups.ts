import { z } from 'zod';

/**
 * Validación de grupos (día + horario fijo).
 *
 * Sobre los números (patrón del sistema): `z.number()`, NUNCA `z.coerce.number()`.
 * En Zod 4 el tipo de ENTRADA de `coerce` es `unknown` y rompe la inferencia de
 * React Hook Form. En el formulario se registran con `{ valueAsNumber: true }`.
 *
 * `weekday` es un <select> OBLIGATORIO (la columna es NOT NULL), así que siempre
 * llega un número válido: no hay opción vacía que pueda convertirse en NaN.
 */
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/** Id de un <select> opcional: la opción «sin modalidad» manda ''. */
const idOpcional = z.union([z.uuid('Elegí una opción válida'), z.literal('')]).optional();

export const esquemaGrupo = z
  .object({
    name: z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres'),
    weekday: z
      .number({ message: 'Elegí un día' })
      .int('Elegí un día')
      .min(0, 'Elegí un día')
      .max(6, 'Elegí un día'),
    start_time: z.string().regex(HORA, 'Poné una hora válida'),
    end_time: z.string().regex(HORA, 'Poné una hora válida'),
    capacity: z
      .number({ message: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(0, 'No puede ser negativo')
      .max(200, 'Como máximo 200'),
    plan_id: idOpcional,
    is_active: z.boolean(),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  })
  // Misma regla que la restricción `groups_time_range` de la base: la avisamos
  // en el formulario antes de que la base tenga que rechazarla.
  .refine((v) => v.end_time.slice(0, 5) > v.start_time.slice(0, 5), {
    message: 'La hora de fin tiene que ser posterior a la de inicio',
    path: ['end_time'],
  });

export type DatosGrupo = z.infer<typeof esquemaGrupo>;
