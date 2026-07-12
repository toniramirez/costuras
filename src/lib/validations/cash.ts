import { z } from 'zod';

/**
 * Validación de cajas.
 *
 * El SALDO no se valida ni se edita: se calcula desde la vista
 * `cash_account_balances` (saldo inicial + movimientos). Lo único que se define
 * a mano es el saldo INICIAL, al crear la caja.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaCaja = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  type: z.enum(['efectivo', 'banco', 'billetera_virtual', 'tarjetas', 'otra'], {
    message: 'Elegí un tipo de caja',
  }),
  /** En PESOS. Se convierte a centavos en la server action. */
  saldo_inicial: z
    .number({ message: 'Tiene que ser un número' })
    .min(-99_999_999, 'El importe es demasiado grande')
    .max(99_999_999, 'El importe es demasiado grande'),
  is_active: z.boolean(),
});
export type DatosCaja = z.infer<typeof esquemaCaja>;

/**
 * Ajuste de saldo.
 *
 * El saldo NUNCA se edita: se corrige asentando un movimiento de tipo `ajuste`
 * en el libro mayor. El importe lleva signo (negativo = falta plata en la caja)
 * y la descripción es obligatoria, porque un ajuste sin explicación es un
 * agujero en la contabilidad.
 */
export const esquemaAjusteCaja = z.object({
  cash_account_id: z.uuid('Elegí una caja'),
  /** En PESOS, con signo. Cero no es un ajuste (la base lo rechaza). */
  importe: z
    .number({ message: 'Tiene que ser un número' })
    .min(-99_999_999, 'El importe es demasiado grande')
    .max(99_999_999, 'El importe es demasiado grande')
    .refine((v) => v !== 0, 'El ajuste no puede ser cero'),
  movement_date: z.string().regex(FECHA, 'Poné una fecha válida'),
  description: z
    .string()
    .trim()
    .min(5, 'Explicá el motivo del ajuste (mínimo 5 caracteres)')
    .max(300, 'Máximo 300 caracteres'),
});
export type DatosAjusteCaja = z.infer<typeof esquemaAjusteCaja>;
