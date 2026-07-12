import { z } from 'zod';

/**
 * Validación de alumnos.
 *
 * El alta es un formulario POR PASOS (son muchos campos). Los pasos comparten un
 * único esquema: cada paso valida solo sus campos con `trigger(CAMPOS_PASO_N)` y
 * el submit final valida todo de nuevo. La server action vuelve a validar con el
 * mismo esquema: el formulario es comodidad, el servidor es la verdad.
 *
 * Reglas del sistema que se ven acá:
 *   · Dinero: el formulario habla en PESOS; la conversión a centavos se hace en
 *     la action con `pesosToCents`.
 *   · Números: `z.number()` + `{ valueAsNumber: true }`. Nunca `z.coerce`.
 *   · Los <select> OPCIONALES (día fijo, grupo, tarifa…) se validan como TEXTO:
 *     un select vacío devuelve '' y con `valueAsNumber` eso sería NaN, que Zod
 *     rechaza y dejaría el formulario trabado por un campo que la persona ni
 *     completó. La conversión a número se hace en la action.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_OPCIONAL = /^(\d{4}-\d{2}-\d{2})?$/;
const HORA_OPCIONAL = /^(\d{2}:\d{2}(:\d{2})?)?$/;

/** Id de un <select> opcional: la opción «sin asignar» manda ''. */
const idOpcional = z.union([z.uuid('Elegí una opción válida'), z.literal('')]).optional();

/** Día de la semana en un <select> opcional: '' o '0'…'6' (0 = domingo). */
const diaOpcional = z
  .union([z.enum(['0', '1', '2', '3', '4', '5', '6']), z.literal('')])
  .optional();

// ── Paso 1 · Datos personales ───────────────────────────────────────────────
const datosPersonales = {
  first_name: z.string().trim().min(1, 'Poné el nombre').max(80, 'Máximo 80 caracteres'),
  last_name: z.string().trim().min(1, 'Poné el apellido').max(80, 'Máximo 80 caracteres'),
  dni: z.string().trim().max(20, 'Máximo 20 caracteres').optional(),
  birth_date: z.string().regex(FECHA_OPCIONAL, 'Poné una fecha válida').optional(),
};

// ── Paso 2 · Contacto ───────────────────────────────────────────────────────
// El correo es OBLIGATORIO: con él se crea el usuario con el que el alumno entra
// al sistema.
const datosContacto = {
  email: z.email('Poné un correo válido').max(160, 'Máximo 160 caracteres'),
  phone: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  address: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  emergency_contact: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  emergency_phone: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
};

// ── Paso 3 · Académico ──────────────────────────────────────────────────────
const datosAcademicos = {
  group_id: idOpcional,
  plan_id: idOpcional,
  rate_id: idOpcional,
  fixed_weekday: diaOpcional,
  fixed_time: z.string().regex(HORA_OPCIONAL, 'Poné una hora válida').optional(),
};

// ── Paso 4 · Inscripción ────────────────────────────────────────────────────
const datosInscripcion = {
  enrollment_date: z.string().regex(FECHA, 'Poné una fecha válida'),
  start_date: z.string().regex(FECHA_OPCIONAL, 'Poné una fecha válida').optional(),
  /** Solo se puede dar de alta como pendiente o activo. Pausa y baja son acciones aparte. */
  status: z.enum(['pendiente', 'activo'], { message: 'Elegí un estado' }),
  registration_fee_exempt: z.boolean(),
  charge_mode: z.enum(['mes_completo', 'proporcional', 'manual', 'mes_siguiente'], {
    message: 'Elegí cómo se cobra el primer mes',
  }),
  first_period_year: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(2020, 'Año inválido')
    .max(2100, 'Año inválido'),
  first_period_month: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Mes inválido')
    .max(12, 'Mes inválido'),
  /**
   * En PESOS. Un solo campo para los dos modos que piden importe: la action lo
   * guarda en `prorated_amount_cents` o en `manual_amount_cents` según el modo.
   * Solo se muestra (y se exige) cuando el modo lo necesita.
   */
  importe_primer_mes: z
    .number({ message: 'Tiene que ser un número' })
    .min(0, 'No puede ser negativo')
    .max(99_999_999, 'El importe es demasiado grande')
    .optional(),
  admin_notes: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional(),
};

/** Alta: los cuatro pasos juntos. */
export const esquemaAlumno = z
  .object({
    ...datosPersonales,
    ...datosContacto,
    ...datosAcademicos,
    ...datosInscripcion,
  })
  .superRefine((v, ctx) => {
    // Los modos «proporcional» y «manual» necesitan un importe sí o sí: sin él,
    // `fee_amount_for_period` caería al importe completo sin avisar.
    const necesitaImporte = v.charge_mode === 'proporcional' || v.charge_mode === 'manual';
    if (necesitaImporte && v.importe_primer_mes === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['importe_primer_mes'],
        message: 'Poné el importe del primer mes',
      });
    }
    if (v.start_date && v.start_date < v.enrollment_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['start_date'],
        message: 'No puede ser anterior a la fecha de inscripción',
      });
    }
  });

export type DatosAlumno = z.infer<typeof esquemaAlumno>;

/** Campos de cada paso del alta (para validar de a un paso con `trigger`). */
export const CAMPOS_PASO = [
  ['first_name', 'last_name', 'dni', 'birth_date'],
  ['email', 'phone', 'address', 'emergency_contact', 'emergency_phone'],
  ['group_id', 'plan_id', 'rate_id', 'fixed_weekday', 'fixed_time'],
  [
    'enrollment_date',
    'start_date',
    'status',
    'registration_fee_exempt',
    'charge_mode',
    'first_period_year',
    'first_period_month',
    'importe_primer_mes',
    'admin_notes',
  ],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof DatosAlumno>>;

export const TITULOS_PASO = [
  'Datos personales',
  'Contacto',
  'Académico',
  'Inscripción',
] as const;

/**
 * Edición de la ficha.
 *
 * No incluye el modo de cobro: eso es un dato de la INSCRIPCIÓN (un hecho que ya
 * ocurrió), no de la ficha. Tampoco incluye el estado: pausar, reactivar y dar
 * de baja son acciones explícitas, con su confirmación.
 */
export const esquemaAlumnoEdicion = z.object({
  ...datosPersonales,
  ...datosContacto,
  ...datosAcademicos,
  enrollment_date: datosInscripcion.enrollment_date,
  start_date: datosInscripcion.start_date,
  registration_fee_exempt: datosInscripcion.registration_fee_exempt,
  admin_notes: datosInscripcion.admin_notes,
});

export type DatosAlumnoEdicion = z.infer<typeof esquemaAlumnoEdicion>;

/** Motivo de la baja: queda escrito en las notas administrativas. */
export const esquemaBaja = z.object({
  motivo: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
});

export type DatosBaja = z.infer<typeof esquemaBaja>;
