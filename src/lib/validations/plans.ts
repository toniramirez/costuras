import { z } from 'zod';

/**
 * Validación de modalidades (planes).
 *
 * OJO con el dinero: el FORMULARIO trabaja en PESOS (es lo que la persona
 * escribe) y la BASE guarda CENTAVOS enteros. La conversión se hace en la server
 * action con `pesosToCents`, nunca antes. Este es el patrón para todo el sistema.
 */
/**
 * Nota sobre los campos numéricos (patrón para TODO el sistema):
 *
 * Usamos `z.number()`, NO `z.coerce.number()`. En Zod 4 el tipo de ENTRADA de
 * `coerce` es `unknown`, y eso rompe la inferencia de React Hook Form (el
 * resolver deja de encajar). En el formulario se registran con
 * `{ valueAsNumber: true }`, así RHF ya entrega un número y los tipos de entrada
 * y salida coinciden. Un input vacío llega como NaN y Zod lo rechaza solo.
 */
export const esquemaPlan = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  classes_included: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(31, 'Como máximo 31'),
  frequency: z.enum(['semanal', 'quincenal', 'mensual', 'unica', 'personalizada'], {
    message: 'Elegí una frecuencia',
  }),
  /** En PESOS. Se convierte a centavos en la server action. */
  precio: z
    .number({ message: 'Tiene que ser un número' })
    .min(0, 'No puede ser negativo')
    .max(99_999_999, 'El importe es demasiado grande'),
  is_active: z.boolean(),
});

export type DatosPlan = z.infer<typeof esquemaPlan>;
