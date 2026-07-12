import { createClient } from '@/lib/supabase/client';

/**
 * Subida de archivos a Supabase Storage desde el navegador.
 *
 * Los buckets son PRIVADOS y las políticas se apoyan en la primera carpeta de la
 * ruta (ver migración 0013). Respetar esta convención no es opcional: si la ruta
 * está mal armada, la política rechaza la subida.
 *
 *   avatars/<profile_id>/<archivo>
 *   proofs/<student_id>/<fee_id>/<archivo>
 *   projects/<student_id>/<project_id>/<archivo>
 *   announcements/<announcement_id>/<archivo>
 *   communications/<communication_id>/<archivo>
 *   workshops/<workshop_id>/<archivo>
 *   branding/<archivo>
 */

export type LimitesArchivo = {
  max_image_mb: number;
  max_document_mb: number;
  max_video_mb: number;
};

export const TIPOS = {
  imagen: ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
  documento: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
} as const;

/** Categoría del archivo según su tipo MIME. */
export function categoriaDe(file: File): 'imagen' | 'documento' | 'video' | null {
  if ((TIPOS.imagen as readonly string[]).includes(file.type)) return 'imagen';
  if ((TIPOS.documento as readonly string[]).includes(file.type)) return 'documento';
  if ((TIPOS.video as readonly string[]).includes(file.type)) return 'video';
  return null;
}

/**
 * Valida tipo y tamaño ANTES de subir.
 * Los límites son configurables desde el panel (academy_settings): nunca se
 * escriben a mano en el código.
 */
export function validarArchivo(file: File, limites: LimitesArchivo): string | null {
  const categoria = categoriaDe(file);
  if (!categoria) {
    return `El formato "${file.type || 'desconocido'}" no está permitido.`;
  }

  const maxMb = {
    imagen: limites.max_image_mb,
    documento: limites.max_document_mb,
    video: limites.max_video_mb,
  }[categoria];

  if (file.size > maxMb * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${mb} MB y el máximo para ${categoria} es ${maxMb} MB.`;
  }

  return null;
}

/** Nombre de archivo seguro y único (sin acentos ni espacios, con marca de tiempo). */
export function nombreSeguro(original: string): string {
  const limpio = original
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .slice(-60);
  return `${Date.now()}_${limpio}`;
}

export type ResultadoSubida = { path: string } | { error: string };

/**
 * Sube un archivo mostrando el progreso.
 *
 * `onProgress` recibe 0–100. Supabase no expone progreso real en su SDK, así que
 * usamos XHR contra el endpoint de Storage para poder informarlo de verdad
 * (una barra falsa sería mentirle a la persona).
 */
export async function subirArchivo(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (porcentaje: number) => void,
): Promise<ResultadoSubida> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('x-upsert', 'true');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ path });
      } else {
        let mensaje = 'No pudimos subir el archivo.';
        try {
          const cuerpo = JSON.parse(xhr.responseText);
          if (cuerpo.message?.includes('exceeded')) {
            mensaje = 'El archivo supera el tamaño máximo permitido.';
          } else if (xhr.status === 403) {
            mensaje = 'No tenés permiso para subir este archivo.';
          }
        } catch {
          /* respuesta no-JSON: dejamos el mensaje genérico */
        }
        resolve({ error: mensaje });
      }
    };

    xhr.onerror = () => resolve({ error: 'Se cortó la conexión durante la subida.' });
    xhr.send(file);
  });
}

/**
 * URL temporal firmada para VER un archivo de un bucket privado.
 * Vence: por defecto, 1 hora.
 */
export async function urlFirmada(
  bucket: string,
  path: string,
  segundos = 3600,
): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}

export async function borrarArchivo(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(bucket).remove(paths);
}
