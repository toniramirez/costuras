import { z } from 'zod';

/**
 * Validación de la configuración de la academia (tabla `academy_settings`,
 * singleton id=1) y de los medios de pago.
 *
 * El formulario está partido en SECCIONES: cada una se valida y se guarda por
 * separado. Así un error en «Recibos» no bloquea el guardado de «Cuotas», y
 * cada sección viaja con lo mínimo indispensable.
 *
 * Recordá las dos reglas de siempre:
 *   · Dinero: el formulario trabaja en PESOS y la conversión a centavos se hace
 *     en la server action con `pesosToCents`. Nunca antes, nunca con floats.
 *   · Números: `z.number()`, JAMÁS `z.coerce.number()`. En el formulario se
 *     registran con `{ valueAsNumber: true }`.
 */

// ── Piezas reutilizables ────────────────────────────────────────────────────

/** Hex de 6 dígitos: es exactamente lo que produce un <input type="color">. */
const HEX = /^#[0-9a-fA-F]{6}$/;

const color = z
  .string()
  .trim()
  .regex(HEX, 'Usá un color en formato #RRGGBB (por ejemplo, #8C6A5D)');

/** Un correo, o vacío. Los campos opcionales llegan como '' desde el formulario. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const correoOpcional = z
  .string()
  .trim()
  .max(120, 'Máximo 120 caracteres')
  .refine((v) => v === '' || CORREO.test(v), 'Poné un correo válido')
  .optional();

const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

// ── Academia ────────────────────────────────────────────────────────────────

export const esquemaAcademia = z.object({
  academy_name: z
    .string()
    .trim()
    .min(1, 'Poné el nombre de la academia')
    .max(80, 'Máximo 80 caracteres'),
  phone: textoOpcional(40),
  email: correoOpcional,
  address: textoOpcional(200),
});
export type DatosAcademia = z.infer<typeof esquemaAcademia>;

// ── Identidad visual ────────────────────────────────────────────────────────

export const esquemaIdentidad = z.object({
  /** Rutas dentro del bucket público `branding`. Vacío = sin imagen. */
  logo_path: textoOpcional(300),
  isotype_path: textoOpcional(300),
  primary_color: color,
  secondary_color: color,
  accent_color: color,
});
export type DatosIdentidad = z.infer<typeof esquemaIdentidad>;

// ── Recibos ─────────────────────────────────────────────────────────────────

export const esquemaRecibos = z.object({
  receipt_prefix: z
    .string()
    .trim()
    .min(1, 'Poné un prefijo (por ejemplo, «R»)')
    .max(10, 'Máximo 10 caracteres')
    .regex(/^[A-Za-z0-9-]+$/, 'Solo letras, números y guiones'),
  receipt_next_number: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'El próximo número no puede ser menor que 1')
    .max(9_999_999, 'El número es demasiado grande'),
  receipt_footer: textoOpcional(300),
  receipt_legal: z
    .string()
    .trim()
    .min(1, 'Poné la leyenda legal del recibo')
    .max(300, 'Máximo 300 caracteres'),
});
export type DatosRecibos = z.infer<typeof esquemaRecibos>;

// ── Matrícula ───────────────────────────────────────────────────────────────

export const esquemaMatricula = z.object({
  /** En PESOS. Se convierte a centavos en la server action. */
  importe: z
    .number({ message: 'Tiene que ser un número' })
    .min(0, 'No puede ser negativo')
    .max(99_999_999, 'El importe es demasiado grande'),
  registration_mode: z.enum(['unica', 'anual'], { message: 'Elegí un modo' }),
  registration_due_days: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(365, 'Como máximo 365 días'),
});
export type DatosMatricula = z.infer<typeof esquemaMatricula>;

// ── Cuotas ──────────────────────────────────────────────────────────────────

const modoCobro = z.enum(['mes_completo', 'proporcional', 'manual', 'mes_siguiente'], {
  message: 'Elegí un modo de cobro',
});

export const esquemaCuotas = z.object({
  /** 1 a 28: no todos los meses tienen 29, 30 o 31. */
  fee_due_day: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'El día tiene que estar entre 1 y 28')
    .max(28, 'El día tiene que estar entre 1 y 28'),
  default_charge_mode: modoCobro,
  bill_january: z.boolean(),
  bill_february: z.boolean(),
  jan_feb_charge_mode: modoCobro,
});
export type DatosCuotas = z.infer<typeof esquemaCuotas>;

// ── Recuperaciones ──────────────────────────────────────────────────────────

export const esquemaRecuperaciones = z.object({
  recovery_min_notice_hours: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(168, 'Como máximo 168 horas (una semana)'),
  recovery_validity_days: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Tiene que ser al menos 1 día')
    .max(365, 'Como máximo 365 días'),
});
export type DatosRecuperaciones = z.infer<typeof esquemaRecuperaciones>;

// ── Archivos ────────────────────────────────────────────────────────────────

export const esquemaArchivos = z.object({
  max_image_mb: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Tiene que ser al menos 1 MB')
    .max(50, 'Como máximo 50 MB'),
  max_document_mb: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Tiene que ser al menos 1 MB')
    .max(100, 'Como máximo 100 MB'),
  max_video_mb: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Tiene que ser al menos 1 MB')
    .max(500, 'Como máximo 500 MB'),
});
export type DatosArchivos = z.infer<typeof esquemaArchivos>;

// ── Mercado Pago ────────────────────────────────────────────────────────────

/**
 * El ACCESS TOKEN no está acá a propósito: vive en una variable de entorno del
 * servidor (`MERCADOPAGO_ACCESS_TOKEN`) y jamás se guarda en la base ni llega al
 * navegador. La public key, en cambio, es pública por diseño.
 *
 * `mp_enabled` solo se puede activar si el servidor tiene el token: eso se
 * verifica en la server action con `isMercadoPagoConfigured()`.
 */
export const esquemaMercadoPago = z.object({
  mp_enabled: z.boolean(),
  mp_public_key: textoOpcional(200),
});
export type DatosMercadoPago = z.infer<typeof esquemaMercadoPago>;

// ── Medios de pago ──────────────────────────────────────────────────────────

export const esquemaMedioPago = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(60, 'Máximo 60 caracteres'),
  /**
   * Identificador interno. Es INMUTABLE una vez creado: la base busca el medio
   * «mercadopago» por su código para acreditar los pagos del webhook.
   */
  code: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo'),
  is_active: z.boolean(),
  requires_proof: z.boolean(),
  sort_order: z
    .number({ message: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(99, 'Como máximo 99'),
});
export type DatosMedioPago = z.infer<typeof esquemaMedioPago>;
