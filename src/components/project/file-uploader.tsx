'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Paperclip, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  categoriaDe,
  nombreSeguro,
  subirArchivo,
  validarArchivo,
  type LimitesArchivo,
} from '@/lib/storage';
import { BUCKET_PROYECTOS, rutaProyecto } from '@/lib/validations/projects';
import { guardarPortada, registrarArchivo } from '@/app/actions/projects';
import type { Enums } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

/**
 * Subida de archivos del cuaderno (fotos, videos cortos, documentos y moldes).
 *
 * Se sube desde el NAVEGADOR con `subirArchivo()` (XHR): es la única forma de
 * mostrar progreso real. Una barra falsa sería mentirle a la persona, y acá se
 * suben videos desde el celular con mala señal: el progreso importa.
 *
 * La ruta la arma `rutaProyecto()` — `<student_id>/<project_id>/<archivo>` —
 * porque la política de Storage mira la PRIMERA carpeta. Si la ruta está mal,
 * la subida se rechaza.
 *
 * Los límites de tamaño llegan de `academy_settings` (nunca escritos a mano) y
 * se validan ANTES de subir: no tiene sentido gastarle los datos del celular a
 * alguien para después rechazarle el archivo.
 */

type Estado = 'subiendo' | 'guardando' | 'listo' | 'error';

type EnCurso = {
  clave: string;
  nombre: string;
  progreso: number;
  estado: Estado;
  error?: string;
};

const ACEPTA_TODO =
  'image/png,image/jpeg,image/webp,image/heic,video/mp4,video/webm,video/quicktime,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ACEPTA_IMAGEN = 'image/png,image/jpeg,image/webp,image/heic';

export function FileUploader({
  studentId,
  projectId,
  entryId = null,
  limites,
  destino = 'adjunto',
  compacto = false,
  label,
  className,
  onListo,
}: {
  studentId: string;
  projectId: string;
  entryId?: string | null;
  limites: LimitesArchivo;
  /** 'portada' sube una sola imagen y la deja como tapa del proyecto. */
  destino?: 'adjunto' | 'portada';
  /** Solo el botón: sin la ayuda de tamaños ni la opción de molde. */
  compacto?: boolean;
  label?: string;
  className?: string;
  onListo?: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [enCurso, setEnCurso] = useState<EnCurso[]>([]);
  const [esMolde, setEsMolde] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const esPortada = destino === 'portada';

  function tipoDe(file: File): Enums<'project_file_kind'> {
    if (esMolde) return 'molde';
    const categoria = categoriaDe(file);
    if (categoria === 'imagen') return 'imagen';
    if (categoria === 'video') return 'video';
    if (categoria === 'documento') return 'documento';
    return 'otro';
  }

  const actualizar = (clave: string, cambios: Partial<EnCurso>) =>
    setEnCurso((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    // Limpiamos el input enseguida: si no, elegir el mismo archivo dos veces
    // seguidas no vuelve a disparar el evento.
    e.target.value = '';
    if (elegidos.length === 0) return;

    const marca = Date.now();
    const tanda = (esPortada ? elegidos.slice(0, 1) : elegidos).map((file, i) => ({
      clave: `${marca}-${i}-${file.name}`,
      file,
    }));

    setTrabajando(true);
    setEnCurso(
      tanda.map(({ clave, file }) => ({
        clave,
        nombre: file.name,
        progreso: 0,
        estado: 'subiendo' as Estado,
      })),
    );

    let fallidos = 0;

    // De a uno: en un celular, cinco subidas en paralelo se pisan entre sí y el
    // progreso deja de significar nada.
    for (const { clave, file } of tanda) {
      const fallo = (error: string) => {
        fallidos++;
        actualizar(clave, { estado: 'error', error });
      };

      const problema = validarArchivo(file, limites);
      if (problema) {
        fallo(problema);
        continue;
      }

      if (esPortada && categoriaDe(file) !== 'imagen') {
        fallo('La portada tiene que ser una imagen.');
        continue;
      }

      const path = rutaProyecto(studentId, projectId, nombreSeguro(file.name));

      const subida = await subirArchivo(BUCKET_PROYECTOS, path, file, (p) =>
        actualizar(clave, { progreso: p }),
      );

      if ('error' in subida) {
        fallo(subida.error);
        continue;
      }

      actualizar(clave, { estado: 'guardando', progreso: 100 });

      const r = esPortada
        ? await guardarPortada(projectId, subida.path)
        : await registrarArchivo(projectId, {
            entry_id: entryId,
            kind: tipoDe(file),
            storage_path: subida.path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          });

      if (!r.ok) {
        fallo(r.error);
        continue;
      }

      actualizar(clave, { estado: 'listo' });
    }

    setTrabajando(false);

    if (fallidos === 0) {
      toast.success(esPortada ? 'Portada actualizada' : 'Archivos subidos');
      // Lo que salió bien se limpia solo; los errores quedan a la vista para
      // que la persona sepa qué archivo hay que volver a intentar.
      setTimeout(() => setEnCurso((prev) => prev.filter((f) => f.estado === 'error')), 1200);
    } else if (fallidos < tanda.length) {
      toast.warning(`Subimos ${tanda.length - fallidos} de ${tanda.length} archivos.`);
    } else {
      toast.error(
        tanda.length === 1 ? 'No pudimos subir el archivo.' : 'No pudimos subir los archivos.',
      );
    }

    onListo?.();
    router.refresh();
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={!esPortada}
          accept={esPortada ? ACEPTA_IMAGEN : ACEPTA_TODO}
          onChange={alElegir}
          className="sr-only"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={trabajando}
          onClick={() => inputRef.current?.click()}
        >
          {esPortada ? (
            <Camera className="size-4" aria-hidden />
          ) : (
            <Paperclip className="size-4" aria-hidden />
          )}
          {label ?? (esPortada ? 'Subir portada' : 'Adjuntar archivos')}
        </Button>

        {!esPortada && !compacto && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={esMolde}
              onChange={(e) => setEsMolde(e.target.checked)}
              className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            />
            Son moldes
          </label>
        )}
      </div>

      {!compacto && (
        <p className="text-xs text-muted">
          Fotos hasta {limites.max_image_mb} MB · Videos hasta {limites.max_video_mb} MB ·
          Documentos y moldes hasta {limites.max_document_mb} MB
        </p>
      )}

      {enCurso.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {enCurso.map((f) => (
            <li
              key={f.clave}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm',
                f.estado === 'error' ? 'border-danger/30 bg-danger-soft' : 'border-line bg-surface',
              )}
            >
              <div className="flex items-center gap-2">
                {f.estado === 'error' ? (
                  <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
                ) : f.estado === 'listo' ? (
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                ) : null}

                <span className="min-w-0 flex-1 truncate text-ink">{f.nombre}</span>

                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {f.estado === 'subiendo' && `${f.progreso}%`}
                  {f.estado === 'guardando' && 'Guardando…'}
                  {f.estado === 'listo' && 'Listo'}
                </span>

                {f.estado === 'error' && (
                  <button
                    type="button"
                    aria-label={`Descartar ${f.nombre}`}
                    onClick={() => setEnCurso((prev) => prev.filter((x) => x.clave !== f.clave))}
                    className="shrink-0 rounded-lg p-1 text-danger hover:bg-danger/10"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>

              {f.estado === 'subiendo' && (
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={f.progreso}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Subiendo ${f.nombre}`}
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-150"
                    style={{ width: `${f.progreso}%` }}
                  />
                </div>
              )}

              {f.error && <p className="mt-1 text-xs font-medium text-danger">{f.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
