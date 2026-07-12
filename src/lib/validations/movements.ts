import { z } from 'zod';

/**
 * Validación de movimientos (ingresos y gastos) y de sus categorías.
 *
 * Un <select> sin elegir entrega '' (cadena vacía), no undefined: por eso los
 * campos opcionales aceptan '' y la server action los pasa a null.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const uuidOpcional = z.union([z.uuid('Selección inválida'), z.literal('')]).optional();

/**
 * Alta manual de un ingreso o un gasto.
 *
 * El tipo `ajuste` NO se carga desde acá: se genera desde la pantalla de cajas
 * (ver `esquemaAjusteCaja`), que es donde tiene sentido y donde se exige el
 * motivo. Acá el importe es siempre POSITIVO: el signo lo da el tipo.
 */
export const esquemaMovimiento = z.object({
  type: z.enum(['ingreso', 'gasto'], { message: 'Elegí si es un ingreso o un gasto' }),
  movement_date: z.string().regex(FECHA, 'Poné una fecha válida'),
  category_id: z.uuid('Elegí una categoría'),
  /** En PESOS. Se convierte a centavos en la server action. */
  importe: z
    .number({ message: 'Tiene que ser un número' })
    .positive('El importe tiene que ser mayor a cero')
    .max(99_999_999, 'El importe es demasiado grande'),
  cash_account_id: z.uuid('Elegí una caja'),
  payment_method_id: z.uuid('Elegí un medio de pago'),
  description: z
    .string()
    .trim()
    .min(1, 'Poné una descripción')
    .max(300, 'Máximo 300 caracteres'),
  student_id: uuidOpcional,
  workshop_id: uuidOpcional,
  notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});
export type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

/** Categorías de ingreso y de gasto. Las del sistema (`is_system`) no se borran. */
export const esquemaCategoria = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(60, 'Máximo 60 caracteres'),
  kind: z.enum(['ingreso', 'gasto'], { message: 'Elegí si es de ingreso o de gasto' }),
  sort_order: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(999, 'Como máximo 999'),
  is_active: z.boolean(),
});
export type DatosCategoria = z.infer<typeof esquemaCategoria>;
