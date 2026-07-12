import { z } from 'zod';

import type { Enums } from '@/lib/supabase/database.types';

/**
 * Validación de talleres especiales e inscripciones.
 *
 * Dinero: el FORMULARIO trabaja en PESOS (es lo que la persona escribe) y la
 * BASE guarda CENTAVOS enteros. La conversión se hace en la server action con
 * `pesosToCents`, nunca antes.
 *
 * Números: `z.number()` + `{ valueAsNumber: true }` en el registro del campo.
 * Nunca `z.coerce`: en Zod 4 su tipo de entrada es `unknown` y rompe la
 * inferencia de React Hook Form.
 *
 * Campos que el formulario puede dejar en blanco: se validan como texto que
 * ADMITE la cadena vacía (un <input> vacío entrega '', no undefined). La action
 * las convierte a null antes de escribir.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/** Texto libre opcional. */
const texto = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

/** Fecha "YYYY-MM-DD" o vacío. */
const fechaOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || FECHA.test(v), 'Elegí una fecha válida');

/** Hora "HH:MM" o vacío. */
const horaOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || HORA.test(v), 'Elegí una hora válida');

/** UUID o vacío (desplegable con opción «sin asignar»). */
const uuidOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || z.uuid().safeParse(v).success, 'Elegí una opción válida');

export const ESTADOS_TALLER = [
  'borrador',
  'publicado',
  'inscripcion_abierta',
  'cupo_completo',
  'finalizado',
  'cancelado',
] as const;

/* ---------------------------------------------------------------------------
   Grupos de estados. Viven acá (y no en el servicio) porque los necesitan tanto
   el servidor como el navegador, y `src/lib/services` es `server-only`.
   --------------------------------------------------------------------------- */

/**
 * Inscripciones que OCUPAN el cupo. Es exactamente lo que cuenta
 * `workshop_confirmed_count` en la base: nadie ocupa un lugar sin haber pagado.
 */
export const OCUPAN_CUPO: ReadonlyArray<Enums<'workshop_reg_status'>> = ['confirmada', 'asistio'];

/** Ya pagaron: tienen (o tuvieron) su lugar. Incluye a quien después no asistió. */
export const CONFIRMADAS: ReadonlyArray<Enums<'workshop_reg_status'>> = [
  'confirmada',
  'asistio',
  'no_asistio',
];

/** Esperan el pago: todavía NO ocupan lugar. */
export const PENDIENTES: ReadonlyArray<Enums<'workshop_reg_status'>> = [
  'pendiente',
  'pendiente_pago',
];

/** Estados de taller que ve el alumno (los mismos que habilita la política RLS). */
export const VISIBLES_ALUMNO: ReadonlyArray<Enums<'workshop_status'>> = [
  'publicado',
  'inscripcion_abierta',
  'cupo_completo',
  'finalizado',
];

export const esquemaTaller = z
  .object({
    name: z.string().trim().min(1, 'Poné un nombre').max(120, 'Máximo 120 caracteres'),
    description: texto(2000),
    category: texto(60),
    responsible_name: texto(120),
    event_date: fechaOpcional,
    start_time: horaOpcional,
    end_time: horaOpcional,
    /** 0 = sin límite de cupo (así lo interpretan las funciones de la base). */
    capacity: z
      .number({ message: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(0, 'No puede ser negativo')
      .max(500, 'Como máximo 500'),
    /** En PESOS. Se convierte a centavos en la server action. */
    precio: z
      .number({ message: 'Tiene que ser un número' })
      .min(0, 'No puede ser negativo')
      .max(99_999_999, 'El importe es demasiado grande'),
    materials_included: texto(2000),
    materials_to_bring: texto(2000),
    location: texto(200),
    status: z.enum(ESTADOS_TALLER, { message: 'Elegí un estado' }),
    cash_account_id: uuidOpcional,
  })
  // Misma regla que la restricción `workshop_time_range` de la base.
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, {
    message: 'La hora de fin tiene que ser posterior a la de inicio',
    path: ['end_time'],
  });

export type DatosTaller = z.infer<typeof esquemaTaller>;

/** Inscripción de un alumno actual: solo hace falta a quién. */
export const esquemaInscripcionAlumno = z.object({
  student_id: z.uuid('Elegí un alumno'),
  notes: texto(500),
});

export type DatosInscripcionAlumno = z.infer<typeof esquemaInscripcionAlumno>;

/** Inscripción de una persona externa (carga manual de la administradora). */
export const esquemaInscripcionExterna = z.object({
  first_name: z.string().trim().min(1, 'Poné el nombre').max(80, 'Máximo 80 caracteres'),
  last_name: z.string().trim().min(1, 'Poné el apellido').max(80, 'Máximo 80 caracteres'),
  phone: z.string().trim().min(1, 'Poné un teléfono de contacto').max(40, 'Máximo 40 caracteres'),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'El correo no es válido'),
  notes: texto(500),
});

export type DatosInscripcionExterna = z.infer<typeof esquemaInscripcionExterna>;

/**
 * Confirmación del pago de una inscripción.
 * Recién con esto el lugar queda ocupado: lo hace `confirm_workshop_registration`.
 */
export const esquemaConfirmarInscripcion = z.object({
  method_id: z.uuid('Elegí el medio de pago'),
  cash_account_id: z.uuid('Elegí la caja de destino'),
  paid_at: z.string().trim().regex(FECHA, 'Elegí la fecha del pago'),
  reference: texto(120),
});

export type DatosConfirmarInscripcion = z.infer<typeof esquemaConfirmarInscripcion>;
