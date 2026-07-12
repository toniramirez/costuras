import { z } from 'zod';

/**
 * Validación de novedades, comunicados y sus destinatarios.
 *
 * Nota sobre los números (patrón del sistema): `z.number()`, NUNCA
 * `z.coerce.number()`. En el formulario se registran con `{ valueAsNumber: true }`.
 *
 * Las fechas viajan como texto "YYYY-MM-DD" (es lo que entrega un <input
 * type="date">). La conversión a `timestamptz` se hace en la server action, en la
 * zona horaria de Córdoba: nunca `new Date('2026-07-20')`, que se interpreta como
 * medianoche UTC y en Argentina cae el día anterior.
 */

// ── Adjuntos ────────────────────────────────────────────────────────────────
// Se guardan como jsonb en announcements.attachments / communications.attachments.
// La ruta SIEMPRE es <announcement_id>/<archivo> o <communication_id>/<archivo>:
// las políticas de Storage se apoyan en esa primera carpeta.

/**
 * Los buckets viven acá y no en el servicio a propósito: el servicio es
 * `server-only` y el FORMULARIO (que corre en el navegador) necesita el nombre
 * del bucket para subir los archivos.
 */
export const BUCKET_NOVEDADES = 'announcements';
export const BUCKET_COMUNICADOS = 'communications';

export const esquemaAdjunto = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
});

export type Adjunto = z.infer<typeof esquemaAdjunto>;

/** Lee la columna jsonb sin confiar en su contenido. Si está corrupta, lista vacía. */
export function parseAdjuntos(valor: unknown): Adjunto[] {
  const r = z.array(esquemaAdjunto).safeParse(valor);
  return r.success ? r.data : [];
}

/**
 * Tipos que aceptan los buckets `announcements` y `communications` (migración
 * 0013). Validarlos ANTES de subir evita el rechazo opaco del bucket.
 */
export const MIMES_ADJUNTO = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export const MIMES_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'] as const;

// ── Destinatarios ───────────────────────────────────────────────────────────
// Al publicar/enviar, el `scope` se EXPANDE a una fila por alumno en
// announcement_recipients / communication_recipients.

const ESCALA_DESTINO = ['todos', 'grupo', 'alumno', 'cuota_pendiente', 'taller'] as const;

const camposDestino = {
  scope: z.enum(ESCALA_DESTINO, { message: 'Elegí a quién va dirigido' }),
  /** Solo si scope = 'grupo'. */
  group_id: z.string().optional(),
  /** Solo si scope = 'taller'. */
  workshop_id: z.string().optional(),
  /** Solo si scope = 'alumno'. Uno o varios. */
  student_ids: z.array(z.string()).max(500, 'Demasiados alumnos seleccionados').optional(),
};

export type DatosDestino = {
  scope: (typeof ESCALA_DESTINO)[number];
  group_id?: string;
  workshop_id?: string;
  student_ids?: string[];
};

/** El campo obligatorio depende del alcance elegido. */
function validarDestino(v: DatosDestino, ctx: z.RefinementCtx) {
  if (v.scope === 'grupo' && !v.group_id) {
    ctx.addIssue({ code: 'custom', path: ['group_id'], message: 'Elegí un grupo' });
  }
  if (v.scope === 'taller' && !v.workshop_id) {
    ctx.addIssue({ code: 'custom', path: ['workshop_id'], message: 'Elegí un taller' });
  }
  if (v.scope === 'alumno' && (v.student_ids?.length ?? 0) === 0) {
    ctx.addIssue({ code: 'custom', path: ['student_ids'], message: 'Elegí al menos un alumno' });
  }
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/** "" (campo vacío) o "YYYY-MM-DD". */
const fechaOpcional = z
  .union([
    z.literal(''),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné una fecha válida'),
  ])
  .optional();

// ── Comunicado ──────────────────────────────────────────────────────────────

export const esquemaComunicado = z
  .object({
    subject: z.string().trim().min(1, 'Poné un asunto').max(140, 'Máximo 140 caracteres'),
    body: z.string().trim().min(1, 'Escribí el mensaje').max(5000, 'Máximo 5000 caracteres'),
    priority: z.enum(['baja', 'normal', 'alta', 'urgente'], { message: 'Elegí una prioridad' }),
    /** Opcional: a partir de esta fecha deja de ser un comunicado vigente. */
    expires_at: fechaOpcional,
    attachments: z.array(esquemaAdjunto).max(10, 'Como máximo 10 adjuntos'),
    ...camposDestino,
  })
  .superRefine(validarDestino);

export type DatosComunicado = z.infer<typeof esquemaComunicado>;

// ── Novedad ─────────────────────────────────────────────────────────────────

export const esquemaNovedad = z
  .object({
    title: z.string().trim().min(1, 'Poné un título').max(140, 'Máximo 140 caracteres'),
    content: z.string().trim().min(1, 'Escribí el contenido').max(5000, 'Máximo 5000 caracteres'),
    /** Ruta de la imagen de portada dentro del bucket `announcements`. */
    image_path: z.string().optional(),
    attachments: z.array(esquemaAdjunto).max(10, 'Como máximo 10 adjuntos'),
    /** Vacío = se publica en el momento. Con fecha futura, queda programada. */
    published_at: fechaOpcional,
    /** Vencida = sale de las principales, pero queda en el historial. */
    expires_at: fechaOpcional,
    priority: z.enum(['baja', 'normal', 'alta', 'urgente'], { message: 'Elegí una prioridad' }),
    is_pinned: z.boolean(),
    status: z.enum(['borrador', 'publicada'], { message: 'Elegí un estado' }),
    ...camposDestino,
  })
  .superRefine((v, ctx) => {
    validarDestino(v, ctx);

    if (v.published_at && v.expires_at && v.expires_at < v.published_at) {
      ctx.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'El vencimiento no puede ser anterior a la publicación',
      });
    }
  });

export type DatosNovedad = z.infer<typeof esquemaNovedad>;
