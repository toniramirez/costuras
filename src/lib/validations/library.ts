import { z } from 'zod';

import type { Enums } from '@/lib/supabase/database.types';

/**
 * Validación de la biblioteca: centro de ayuda, glosario y moldería digital.
 *
 * Se usa en el formulario Y en la server action (ver PATRONES.md). Las reglas de
 * acá son las mismas que las restricciones de la migración 0022: si algo cambia,
 * cambia en los dos lados.
 *
 * Campos que el formulario puede dejar en blanco: se validan como texto que
 * ADMITE la cadena vacía (un <input> vacío entrega '', no undefined). La action
 * las convierte a null antes de escribir.
 */

/** Bucket privado donde vive TODO el material de la biblioteca. */
export const BUCKET_BIBLIOTECA = 'library';

/**
 * Primera carpeta de la ruta, por espacio. La política de Storage la mira
 * (`library/<espacio>/<id>/<archivo>`), así que no es un detalle cosmético.
 */
export const CARPETA = {
  ayuda: 'ayuda',
  glosario: 'glosario',
  molderia: 'molderia',
} as const;

export type Espacio = keyof typeof CARPETA;

/** Ruta de un archivo de la biblioteca. Única forma de armarla. */
export function rutaBiblioteca(espacio: Espacio, id: string, archivo: string): string {
  return `${CARPETA[espacio]}/${id}/${archivo}`;
}

/**
 * ¿La ruta cae dentro de la carpeta de ESTE registro?
 *
 * La RLS de las tablas no mira rutas, así que sin este chequeo la administradora
 * podría registrar en una ficha un archivo que en realidad pertenece a otra.
 */
export function rutaValida(ruta: string, espacio: Espacio, id: string): boolean {
  return ruta.startsWith(`${CARPETA[espacio]}/${id}/`) && !ruta.includes('..');
}

/**
 * Normaliza para buscar: sin acentos, sin mayúsculas.
 *
 * Tiene que dar EXACTAMENTE lo mismo que las columnas generadas `sort_key` y
 * `search_key` de la migración 0022. Si divergen, la alumna escribe «bies» y no
 * encuentra «Biés».
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/* ---------------------------------------------------------------------------
   Piezas comunes
   --------------------------------------------------------------------------- */

/** Texto libre opcional (admite ''). */
const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

/** Texto obligatorio. */
const obligatorio = (max: number, mensaje: string) =>
  z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`);

/** UUID o vacío (desplegable con opción «sin categoría»). */
const uuidOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || z.uuid().safeParse(v).success, 'Elegí una opción válida');

/**
 * Enlace externo opcional. Solo http/https: un `javascript:` acá terminaría
 * ejecutándose en el navegador de la alumna al tocar el enlace.
 */
const enlaceOpcional = z
  .string()
  .trim()
  .max(2000, 'El enlace es demasiado largo')
  .refine(
    (v) => v === '' || /^https?:\/\/\S+$/i.test(v),
    'Pegá un enlace que empiece con http:// o https://',
  );

const orden = z
  .number({ message: 'Tiene que ser un número' })
  .int('Tiene que ser un número entero')
  .min(0, 'No puede ser negativo')
  .max(9999, 'Como máximo 9999');

/* ---------------------------------------------------------------------------
   Categorías
   --------------------------------------------------------------------------- */

export const ESPACIOS = ['ayuda', 'molderia'] as const;

export const esquemaCategoria = z.object({
  scope: z.enum(ESPACIOS, { message: 'Elegí a qué biblioteca pertenece' }),
  name: obligatorio(80, 'Poné un nombre'),
  description: texto(300),
  sort_order: orden,
});

export type DatosCategoria = z.infer<typeof esquemaCategoria>;

/* ---------------------------------------------------------------------------
   Centro de ayuda
   --------------------------------------------------------------------------- */

export const TIPOS_CONTENIDO = ['video', 'imagen', 'pdf', 'texto'] as const;

/** Qué archivo acepta cada tipo de publicación (`accept` del <input file>). */
export const ACEPTA: Record<Enums<'help_content_kind'>, string> = {
  video: 'video/mp4,video/webm,video/quicktime',
  imagen: 'image/png,image/jpeg,image/webp,image/heic',
  pdf: 'application/pdf',
  texto: '',
};

/** Los tipos que necesitan un archivo (o, para el video, un enlace). */
export const CON_ARCHIVO: ReadonlyArray<Enums<'help_content_kind'>> = ['video', 'imagen', 'pdf'];

export const esquemaContenido = z
  .object({
    kind: z.enum(TIPOS_CONTENIDO, { message: 'Elegí el tipo de contenido' }),
    title: obligatorio(160, 'Poné un título'),
    description: texto(500),
    body: texto(20_000),
    /** Solo para videos alojados afuera (YouTube, Drive…). */
    external_url: enlaceOpcional,
    category_id: uuidOpcional,
    sort_order: orden,
    is_published: z.boolean(),
  })
  // Misma regla que la restricción `help_content_body_ck` de la base.
  .refine((v) => v.kind !== 'texto' || Boolean(v.body?.trim()), {
    message: 'Escribí el texto que van a leer las alumnas',
    path: ['body'],
  });
// El enlace externo solo tiene sentido en un video, pero eso NO se valida acá:
// el campo solo se muestra cuando el tipo es «video», así que un enlace que
// quedó escrito antes de cambiar de tipo produciría un error sobre un campo
// invisible —el formulario no enviaría y nadie sabría por qué—. La action lo
// resuelve en silencio, que es lo correcto: guarda null si el tipo no es video.

export type DatosContenido = z.infer<typeof esquemaContenido>;

/** Datos de un archivo ya subido al bucket, para registrarlo en la ficha. */
export const esquemaArchivo = z.object({
  storage_path: z.string().trim().min(1, 'Falta la ruta del archivo'),
  file_name: texto(255),
  mime_type: texto(120),
  size_bytes: z
    .number({ message: 'Tamaño inválido' })
    .int()
    .min(0)
    .max(1_073_741_824, 'El archivo es demasiado grande'),
});

export type DatosArchivo = z.infer<typeof esquemaArchivo>;

/* ---------------------------------------------------------------------------
   Glosario
   --------------------------------------------------------------------------- */

export const esquemaTermino = z.object({
  term: obligatorio(80, 'Poné la palabra'),
  definition: obligatorio(4000, 'Explicá qué es'),
  usage_notes: texto(4000),
  video_url: enlaceOpcional,
  is_published: z.boolean(),
});

export type DatosTermino = z.infer<typeof esquemaTermino>;

/** Los tres archivos opcionales de una ficha del glosario. */
export const CAMPOS_TERMINO = ['image_path', 'video_path', 'pdf_path'] as const;
export type CampoTermino = (typeof CAMPOS_TERMINO)[number];

export const esquemaCampoTermino = z.enum(CAMPOS_TERMINO, {
  message: 'Ese archivo no existe en la ficha',
});

/** Lo que escribe la alumna cuando no encuentra una palabra. */
export const esquemaSugerencia = z.object({
  term: obligatorio(80, 'Escribí la palabra que buscabas'),
  notes: texto(500),
});

export type DatosSugerencia = z.infer<typeof esquemaSugerencia>;

/* ---------------------------------------------------------------------------
   Moldería digital
   --------------------------------------------------------------------------- */

export const esquemaMolde = z.object({
  title: obligatorio(160, 'Poné un nombre'),
  description: texto(500),
  category_id: uuidOpcional,
  sort_order: orden,
  is_published: z.boolean(),
});

export type DatosMolde = z.infer<typeof esquemaMolde>;

/** Los dos archivos de un molde: el PDF y la portada. */
export const CAMPOS_MOLDE = ['storage_path', 'cover_image_path'] as const;
export type CampoMolde = (typeof CAMPOS_MOLDE)[number];

export const esquemaCampoMolde = z.enum(CAMPOS_MOLDE, {
  message: 'Ese archivo no existe en el molde',
});
