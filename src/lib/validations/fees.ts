import { z } from 'zod';

/**
 * Validación de cuotas, matrículas y comprobantes.
 *
 * Recordatorios del contrato (ver docs/PATRONES.md):
 *   · El dinero viaja en PESOS desde el formulario y se convierte a CENTAVOS en
 *     la server action con `pesosToCents`. Nunca antes.
 *   · `z.number()`, jamás `z.coerce.number()`: en el formulario se registra con
 *     `{ valueAsNumber: true }` y los tipos de entrada/salida coinciden.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Período de generación de cuotas. */
export const esquemaPeriodo = z.object({
  anio: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un año entero')
    .min(2020, 'El año es demasiado antiguo')
    .max(2100, 'El año es demasiado lejano'),
  mes: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un mes entero')
    .min(1, 'El mes va de 1 a 12')
    .max(12, 'El mes va de 1 a 12'),
});
export type DatosPeriodo = z.infer<typeof esquemaPeriodo>;

/**
 * Cobro de una cuota o de una matrícula.
 *
 * NO lleva importe a propósito: el cobro es SIEMPRE por el total de la cuota.
 * En este sistema no existe el pago parcial (lo garantiza la base: la función
 * `settle_monthly_fee` liquida por `final_amount_cents`, sin excepción).
 */
export const esquemaCobro = z.object({
  method_id: z.uuid('Elegí un medio de pago'),
  cash_account_id: z.uuid('Elegí a qué caja entra el dinero'),
  paid_at: z.string().regex(FECHA, 'Poné una fecha válida'),
  external_reference: z
    .string()
    .trim()
    .max(120, 'Máximo 120 caracteres')
    .optional(),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});
export type DatosCobro = z.infer<typeof esquemaCobro>;

/**
 * Ajuste del importe de una cuota ANTES de cobrarla (descuento o recargo).
 *
 * En PESOS y con signo: negativo descuenta, positivo recarga. La base exige
 * `final_amount_cents = base_amount_cents + manual_adjustment_cents`, así que la
 * action actualiza los dos campos juntos.
 */
export const esquemaAjusteCuota = z.object({
  ajuste: z
    .number({ message: 'Tiene que ser un número' })
    .min(-99_999_999, 'El descuento es demasiado grande')
    .max(99_999_999, 'El recargo es demasiado grande'),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});
export type DatosAjusteCuota = z.infer<typeof esquemaAjusteCuota>;

/** Anulación de un pago ya registrado. El motivo queda asentado en el reverso. */
export const esquemaAnulacion = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, 'Contá brevemente por qué se anula (mínimo 5 caracteres)')
    .max(500, 'Máximo 500 caracteres'),
});
export type DatosAnulacion = z.infer<typeof esquemaAnulacion>;

/** Aprobación de un comprobante de transferencia: hay que elegir la caja. */
export const esquemaAprobacion = z.object({
  cash_account_id: z.uuid('Elegí a qué caja entra el dinero'),
  method_id: z.uuid('Elegí un medio de pago').optional(),
});
export type DatosAprobacion = z.infer<typeof esquemaAprobacion>;

/** Rechazo de un comprobante. El motivo se le muestra al alumno. */
export const esquemaRechazo = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, 'Explicá por qué se rechaza: el alumno va a leer este mensaje')
    .max(500, 'Máximo 500 caracteres'),
});
export type DatosRechazo = z.infer<typeof esquemaRechazo>;
