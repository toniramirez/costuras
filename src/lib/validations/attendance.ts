import { z } from 'zod';

/**
 * Validación de asistencia.
 *
 * Los estados son los del enum `attendance_status` de la base. Se listan acá
 * como tupla para poder usarlos también como opciones de la UI y como guarda de
 * los filtros que llegan por la URL (donde puede venir cualquier cosa).
 *
 * Nota sobre los números (patrón del sistema): no hay ninguno acá, pero si lo
 * hubiera iría con `z.number()` + `{ valueAsNumber: true }` en el formulario,
 * NUNCA con `z.coerce`.
 */
export const ESTADOS_ASISTENCIA = [
  'presente',
  'ausente_justificada',
  'ausente_sin_justificar',
  'recuperacion',
  'cancelada_academia',
] as const;

/** Fecha de la clase: columna `date`, siempre "YYYY-MM-DD". */
export const esquemaFecha = z.iso.date('Poné una fecha válida');

const observacion = z.string().trim().max(500, 'Máximo 500 caracteres').optional();

/**
 * Abrir la clase de un grupo en una fecha.
 * La base tiene un unique en (group_id, session_date): la clase se crea una sola
 * vez, por más que se abra la pantalla mil veces.
 */
export const esquemaClase = z.object({
  group_id: z.uuid('Elegí un grupo'),
  session_date: esquemaFecha,
});
export type DatosClase = z.infer<typeof esquemaClase>;

/**
 * Marcar el estado de un alumno. Un toque = un guardado.
 *
 * `recovery_credit_id` viaja solo cuando el alumno vino a recuperar: en ese caso
 * la server action delega en `use_recovery_credit`, que es la única que puede
 * consumir el crédito (y que impide usarlo dos veces).
 */
export const esquemaMarca = z.object({
  group_id: z.uuid('Elegí un grupo'),
  session_date: esquemaFecha,
  student_id: z.uuid('Elegí un alumno'),
  status: z.enum(ESTADOS_ASISTENCIA, { message: 'Elegí un estado' }),
  observation: observacion,
  recovery_credit_id: z.uuid().nullish(),
});
export type DatosMarca = z.infer<typeof esquemaMarca>;

/** "Marcar todos presentes": solo a los que todavía no tienen registro. */
export const esquemaMarcarTodos = z.object({
  group_id: z.uuid('Elegí un grupo'),
  session_date: esquemaFecha,
  student_ids: z.array(z.uuid()).min(1, 'No hay alumnos para marcar'),
});
export type DatosMarcarTodos = z.infer<typeof esquemaMarcarTodos>;

/** Editar un registro ya hecho, con su observación (desde el historial). */
export const esquemaEdicion = z.object({
  status: z.enum(ESTADOS_ASISTENCIA, { message: 'Elegí un estado' }),
  observation: observacion,
});
export type DatosEdicion = z.infer<typeof esquemaEdicion>;
