import { z } from 'zod';

/**
 * Validación del cuaderno virtual: proyectos, avances y archivos.
 *
 * Se usa en el formulario Y en la server action (nunca confiamos en el cliente).
 *
 * Números: `z.number()`, jamás `z.coerce.number()` (ver PATRONES.md). En el
 * formulario se registran con `{ valueAsNumber: true }`.
 *
 * Fechas: las columnas `date` viajan como texto "YYYY-MM-DD", que es justo lo
 * que entrega un <input type="date">. Un campo vacío llega como '' y lo
 * convertimos a null en la action.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha opcional: '' (vacío) o "YYYY-MM-DD". */
const fechaOpcional = z
  .union([z.literal(''), z.string().regex(FECHA, 'Poné una fecha válida')])
  .optional();

/** Fecha obligatoria: "YYYY-MM-DD". */
const fechaRequerida = z.string().regex(FECHA, 'Poné una fecha válida');

/**
 * Enlace externo (videos largos alojados afuera).
 * Exigimos http/https a propósito: así un `javascript:…` no llega nunca a un
 * href. La validación se repite en el servidor.
 */
const enlaceHttp = z
  .string()
  .trim()
  .min(1, 'Pegá el enlace del video')
  .max(2000, 'El enlace es demasiado largo')
  .refine((v) => /^https?:\/\//i.test(v), 'El enlace tiene que empezar con http:// o https://')
  .refine((v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, 'Ese enlace no es válido');

export const DIFICULTADES = ['inicial', 'intermedio', 'avanzado', 'personalizado'] as const;
export const ESTADOS = ['idea', 'en_proceso', 'pausado', 'terminado', 'archivado'] as const;
export const TIPOS_ARCHIVO = ['imagen', 'video', 'documento', 'molde', 'otro'] as const;

// ── La ruta en el bucket ────────────────────────────────────────────────────
//
// Las políticas de Storage se apoyan en la PRIMERA carpeta de la ruta:
//
//   bucket 'projects'  ·  <student_id>/<project_id>/<archivo>
//
// Si la ruta no arranca con el student_id de quien sube, la política rechaza la
// subida. Por eso la ruta se arma en UN solo lugar (esta función), que usan el
// navegador al subir y la server action al registrar la fila.

export const BUCKET_PROYECTOS = 'projects';

export function rutaProyecto(studentId: string, projectId: string, archivo: string): string {
  return `${studentId}/${projectId}/${archivo}`;
}

/** Carpeta del proyecto (útil para borrar todo de una). */
export function carpetaProyecto(studentId: string, projectId: string): string {
  return `${studentId}/${projectId}`;
}

/** ¿La ruta pertenece de verdad a este alumno y a este proyecto? */
export function rutaValida(path: string, studentId: string, projectId: string): boolean {
  return path.startsWith(`${carpetaProyecto(studentId, projectId)}/`) && !path.includes('..');
}

// ── Proyecto ────────────────────────────────────────────────────────────────

const camposProyecto = {
  title: z.string().trim().min(1, 'Poné un título').max(120, 'Máximo 120 caracteres'),
  description: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
  garment_type: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  fabric_type: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  measurements: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional(),
  materials: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional(),
  difficulty: z.enum(DIFICULTADES, { message: 'Elegí una dificultad' }),
  start_date: fechaOpcional,
  end_date: fechaOpcional,
  status: z.enum(ESTADOS, { message: 'Elegí un estado' }),
  notes: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
  // La portada NO se edita en este formulario: se sube aparte (necesita el id
  // del proyecto para armar la ruta del bucket) y la guarda `guardarPortada`.
};

/** Un proyecto no puede terminar antes de empezar. */
const noTerminaAntesDeEmpezar = (v: { start_date?: string; end_date?: string }) =>
  !v.start_date || !v.end_date || v.end_date >= v.start_date;

const errorFechas = {
  message: 'La fecha de fin no puede ser anterior a la de inicio',
  path: ['end_date'],
};

/** Alta/edición desde el portal del alumno: el dueño es siempre quien lo crea. */
export const esquemaProyecto = z
  .object(camposProyecto)
  .refine(noTerminaAntesDeEmpezar, errorFechas);

/**
 * Alta/edición desde el panel: la administradora crea el proyecto A NOMBRE de
 * un alumno, así que acá el alumno es un campo más del formulario.
 */
export const esquemaProyectoAdmin = z
  .object({
    ...camposProyecto,
    student_id: z.uuid({ message: 'Elegí un alumno' }),
    is_featured: z.boolean(),
  })
  .refine(noTerminaAntesDeEmpezar, errorFechas);

export type DatosProyecto = z.infer<typeof esquemaProyecto>;
export type DatosProyectoAdmin = z.infer<typeof esquemaProyectoAdmin>;

/** Para el cambio rápido de estado desde el detalle. */
export const esquemaEstado = z.enum(ESTADOS, { message: 'Ese estado no existe' });

// ── Entrada de avance ───────────────────────────────────────────────────────

export const esquemaEntrada = z.object({
  title: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  body: z.string().trim().max(5000, 'Máximo 5000 caracteres').optional(),
  step_notes: z.string().trim().max(5000, 'Máximo 5000 caracteres').optional(),
  entry_date: fechaRequerida,
  materials_used: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional(),
  measurements: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional(),
});

export type DatosEntrada = z.infer<typeof esquemaEntrada>;

/**
 * Borrador del autoguardado: la persona está escribiendo, todavía no terminó.
 * Por eso acá NO exigimos nada — guardar a medias es justamente la gracia.
 */
export const esquemaBorrador = esquemaEntrada.partial().extend({
  entry_date: fechaRequerida,
});

export type DatosBorrador = z.infer<typeof esquemaBorrador>;

// ── Archivos y enlaces ──────────────────────────────────────────────────────

/**
 * Registro de un archivo ya subido al bucket.
 *
 * La subida la hace el navegador (para poder mostrar progreso real); la fila se
 * inserta después desde el servidor. La action vuelve a verificar que la ruta
 * caiga dentro de `<student_id>/<project_id>/`: la RLS de `project_files` mira
 * el proyecto, no la ruta, así que ese chequeo lo tenemos que hacer nosotros.
 */
export const esquemaArchivo = z.object({
  entry_id: z.uuid().nullable().optional(),
  kind: z.enum(TIPOS_ARCHIVO, { message: 'Tipo de archivo desconocido' }),
  storage_path: z.string().trim().min(1, 'Falta la ruta del archivo').max(500),
  file_name: z.string().trim().max(200).optional(),
  mime_type: z.string().trim().max(150).optional(),
  size_bytes: z
    .number({ message: 'Tamaño inválido' })
    .int()
    .min(0, 'Tamaño inválido')
    .max(1_000_000_000, 'El archivo es demasiado grande'),
});

export type DatosArchivo = z.infer<typeof esquemaArchivo>;

/** Enlace externo: el video largo vive afuera (YouTube, Drive…). */
export const esquemaEnlace = z.object({
  external_url: enlaceHttp,
  file_name: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
});

export type DatosEnlace = z.infer<typeof esquemaEnlace>;
