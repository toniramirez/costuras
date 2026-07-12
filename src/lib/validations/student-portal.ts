import { z } from 'zod';

import { todayISO } from '@/lib/format';

/**
 * Validación del portal del alumno.
 *
 * El alumno NUNCA mueve dinero. Lo único que informa es cuánto dice haber
 * transferido (`informed_amount_cents` del comprobante): un dato declarativo que
 * la administradora verifica al aprobar. Como todo importe del sistema, en el
 * FORMULARIO va en PESOS y se convierte a CENTAVOS en la server action con
 * `pesosToCents`, nunca antes.
 *
 * Números con `z.number()`, jamás `z.coerce.number()` (ver docs/PATRONES.md):
 * en el formulario se registran con `{ valueAsNumber: true }`.
 */

const EMAIL = z.email();

/** Texto opcional: el formulario manda '' y la base guarda null. */
const opcional = (max: number, mensaje = `Máximo ${max} caracteres`) =>
  z.string().trim().max(max, mensaje).optional();

// ── Comprobante de transferencia ────────────────────────────────────────────

/** Lo que el alumno completa en el diálogo. El archivo se maneja aparte. */
export const esquemaComprobante = z.object({
  /** En PESOS. Se convierte a centavos en la server action. */
  importe: z
    .number({ message: 'Poné el importe que transferiste' })
    .positive('Tiene que ser mayor a cero')
    .max(99_999_999, 'El importe es demasiado grande'),
  reference: opcional(80),
  note: opcional(500),
});

export type DatosComprobante = z.infer<typeof esquemaComprobante>;

/**
 * Lo que recibe la server action: los campos del formulario + a qué deuda
 * corresponde y dónde quedó el archivo.
 *
 * El archivo lo sube el NAVEGADOR con `subirArchivo()` (así se puede mostrar el
 * progreso real). `filePath` es la ruta DENTRO del bucket `proofs`:
 * `<student_id>/<fee_id>/<archivo>`. La action verifica el prefijo antes de
 * guardar la fila: la política del bucket ya lo impone, pero el texto de la
 * columna no se da por bueno sin mirarlo.
 */
export const esquemaSubirComprobante = esquemaComprobante.extend({
  tipo: z.enum(['cuota', 'matricula'], { message: 'No sabemos a qué deuda corresponde' }),
  feeId: z.uuid('No sabemos a qué deuda corresponde'),
  filePath: z.string().min(1, 'Elegí el archivo del comprobante'),
});

export type DatosSubirComprobante = z.infer<typeof esquemaSubirComprobante>;

// ── Perfil ──────────────────────────────────────────────────────────────────

/**
 * SOLO datos de contacto.
 *
 * Tarifa, grupo, modalidad, estado, historial: no están acá a propósito. Los
 * administra la academia y el trigger `students_guard_protected_columns()` los
 * bloquea aunque alguien arme la petición a mano.
 */
export const esquemaPerfil = z.object({
  phone: opcional(30),
  /** Correo de CONTACTO (no es el correo con el que ingresa al sistema). */
  email: opcional(120).refine((v) => !v || EMAIL.safeParse(v).success, 'Escribí un correo válido'),
  birth_date: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha inválida')
    .refine((v) => !v || v <= todayISO(), 'La fecha no puede ser futura')
    .optional(),
  address: opcional(200),
  emergency_contact: opcional(80),
  emergency_phone: opcional(30),
});

export type DatosPerfil = z.infer<typeof esquemaPerfil>;

/** Foto de perfil: ruta dentro del bucket `avatars` (`<profile_id>/<archivo>`). */
export const esquemaFotoPerfil = z.object({
  filePath: z.string().min(1, 'Elegí una foto'),
});

// ── Contraseña ──────────────────────────────────────────────────────────────

/**
 * Mismas reglas que /nueva-clave: 8 caracteres, con letra y número.
 * El cambio lo hace el CLIENTE contra Supabase Auth (`updateUser`), después de
 * verificar la contraseña actual con `signInWithPassword`.
 */
export const esquemaClave = z
  .object({
    actual: z.string().min(1, 'Escribí tu contraseña actual'),
    nueva: z
      .string()
      .min(8, 'Usá al menos 8 caracteres')
      .regex(/[a-zA-Z]/, 'Incluí al menos una letra')
      .regex(/[0-9]/, 'Incluí al menos un número'),
    confirmacion: z.string().min(1, 'Repetí la contraseña'),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  })
  .refine((d) => d.nueva !== d.actual, {
    message: 'Tiene que ser distinta de la actual',
    path: ['nueva'],
  });

export type DatosClave = z.infer<typeof esquemaClave>;
