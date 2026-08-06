import { nombreSeguro, subirArchivo } from '@/lib/storage';
import {
  BUCKET_BIBLIOTECA,
  rutaBiblioteca,
  type DatosArchivo,
  type Espacio,
} from '@/lib/validations/library';

/**
 * Subida de un archivo de la biblioteca DESDE EL NAVEGADOR.
 *
 * Vive acá y no en una server action porque el archivo puede ser un video de
 * decenas de megas: subirlo al servidor de Next para que lo reenvíe a Storage
 * sería pagar el viaje dos veces y, encima, sin poder mostrar el progreso real.
 * El navegador lo manda directo al bucket (la política de Storage lo autoriza
 * solo si quien sube es la administradora) y después una server action registra
 * la ruta en la fila.
 *
 * La ruta la arma `rutaBiblioteca()` y NUNCA se escribe a mano: la política mira
 * las dos primeras carpetas (`<espacio>/<id>/`).
 */
export async function subirALaBiblioteca(
  espacio: Espacio,
  id: string,
  file: File,
  onProgress?: (porcentaje: number) => void,
): Promise<{ archivo: DatosArchivo } | { error: string }> {
  const path = rutaBiblioteca(espacio, id, nombreSeguro(file.name));
  const subida = await subirArchivo(BUCKET_BIBLIOTECA, path, file, onProgress);

  if ('error' in subida) return { error: subida.error };

  return {
    archivo: {
      storage_path: subida.path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
  };
}
