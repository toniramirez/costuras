'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  MIMES_ADJUNTO,
  MIMES_IMAGEN,
  type Adjunto,
} from '@/lib/validations/comms';
import {
  borrarArchivo,
  nombreSeguro,
  subirArchivo,
  urlFirmada,
  validarArchivo,
  type LimitesArchivo,
} from '@/lib/storage';
import { tamanioArchivo } from './comunes';

/**
 * Subida de adjuntos e imagen de portada.
 *
 * La ruta es SIEMPRE `<id>/<archivo>`: las políticas de los buckets
 * `announcements` y `communications` autorizan por la primera carpeta. Por eso el
 * formulario genera el id ANTES de guardar la fila.
 *
 * Los dos buckets aceptan solo imágenes y PDF. Lo validamos acá para dar un
 * mensaje claro, en vez de dejar que el bucket rechace la subida sin explicación.
 */

type Comun = {
  bucket: string;
  /** El id de la novedad o del comunicado: es la carpeta. */
  carpeta: string;
  limites: LimitesArchivo;
};

function tipoPermitido(file: File, permitidos: readonly string[]): string | null {
  if (permitidos.includes(file.type)) return null;
  const lista = permitidos.includes('application/pdf') ? 'imágenes (PNG, JPG, WEBP) o PDF' : 'imágenes (PNG, JPG, WEBP)';
  return `«${file.name}»: acá solo se pueden adjuntar ${lista}.`;
}

export function AdjuntosField({
  bucket,
  carpeta,
  limites,
  value,
  onChange,
  error,
}: Comun & {
  value: Adjunto[];
  onChange: (adjuntos: Adjunto[]) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);

  async function alElegir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;

    const nuevos: Adjunto[] = [];

    for (const file of Array.from(archivos)) {
      const problemaTipo = tipoPermitido(file, MIMES_ADJUNTO);
      if (problemaTipo) {
        toast.error(problemaTipo);
        continue;
      }

      const problemaTamanio = validarArchivo(file, limites);
      if (problemaTamanio) {
        toast.error(problemaTamanio);
        continue;
      }

      setSubiendo(file.name);
      setProgreso(0);

      const r = await subirArchivo(
        bucket,
        `${carpeta}/${nombreSeguro(file.name)}`,
        file,
        setProgreso,
      );

      if ('error' in r) {
        toast.error(r.error);
        continue;
      }

      nuevos.push({ path: r.path, name: file.name, size: file.size, mime: file.type });
    }

    setSubiendo(null);
    if (nuevos.length > 0) onChange([...value, ...nuevos]);
    if (input.current) input.current.value = '';
  }

  async function quitar(adjunto: Adjunto) {
    onChange(value.filter((a) => a.path !== adjunto.path));
    // El archivo ya está en el bucket: si no lo borramos, queda huérfano.
    await borrarArchivo(bucket, [adjunto.path]);
  }

  return (
    <Field label="Adjuntos" error={error} hint="Imágenes o PDF. Hasta 10 archivos.">
      <div className="space-y-2">
        {value.length > 0 && (
          <ul className="space-y-1.5">
            {value.map((a) => (
              <li
                key={a.path}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2"
              >
                {a.mime.startsWith('image/') ? (
                  <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {tamanioArchivo(a.size)}
                </span>
                <button
                  type="button"
                  onClick={() => quitar(a)}
                  aria-label={`Quitar ${a.name}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-line/40 hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {subiendo && (
          <div className="rounded-xl border border-line bg-canvas px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{subiendo}</span>
              <span className="tabular-nums">{progreso}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        )}

        <input
          ref={input}
          type="file"
          multiple
          accept={MIMES_ADJUNTO.join(',')}
          className="hidden"
          onChange={(e) => alElegir(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={subiendo !== null || value.length >= 10}
        >
          <Paperclip className="size-3.5" aria-hidden />
          Adjuntar archivo
        </Button>
      </div>
    </Field>
  );
}

export function ImagenField({
  bucket,
  carpeta,
  limites,
  value,
  onChange,
  error,
}: Comun & {
  /** Ruta dentro del bucket. */
  value: string;
  onChange: (path: string) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  // Guardamos la ruta junto con la URL: si la imagen cambió, la firma vieja ya no
  // corresponde y no queremos mostrarla ni por un instante.
  const [firma, setFirma] = useState<{ path: string; url: string | null } | null>(null);

  // El bucket es privado: la vista previa necesita una URL firmada.
  useEffect(() => {
    if (!value) return;

    let vigente = true;
    urlFirmada(bucket, value).then((url) => {
      if (vigente) setFirma({ path: value, url });
    });
    return () => {
      vigente = false;
    };
  }, [bucket, value]);

  const preview = firma?.path === value ? firma.url : null;

  async function alElegir(archivos: FileList | null) {
    const file = archivos?.[0];
    if (!file) return;

    const problemaTipo = tipoPermitido(file, MIMES_IMAGEN);
    if (problemaTipo) {
      toast.error(problemaTipo);
      return;
    }

    const problemaTamanio = validarArchivo(file, limites);
    if (problemaTamanio) {
      toast.error(problemaTamanio);
      return;
    }

    setSubiendo(true);
    setProgreso(0);

    const r = await subirArchivo(bucket, `${carpeta}/${nombreSeguro(file.name)}`, file, setProgreso);
    setSubiendo(false);
    if (input.current) input.current.value = '';

    if ('error' in r) {
      toast.error(r.error);
      return;
    }

    const anterior = value;
    onChange(r.path);
    if (anterior && anterior !== r.path) await borrarArchivo(bucket, [anterior]);
  }

  async function quitar() {
    const anterior = value;
    onChange('');
    if (anterior) await borrarArchivo(bucket, [anterior]);
  }

  return (
    <Field label="Imagen" error={error} hint="Se muestra arriba de la novedad. Opcional.">
      <div className="space-y-2">
        {value ? (
          <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-48 w-full object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
              </div>
            )}
            <button
              type="button"
              onClick={quitar}
              aria-label="Quitar la imagen"
              className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-surface/90 text-muted shadow-sm hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ) : subiendo ? (
          <div className="rounded-xl border border-line bg-canvas px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span className="flex-1">Subiendo…</span>
              <span className="tabular-nums">{progreso}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        ) : null}

        <input
          ref={input}
          type="file"
          accept={MIMES_IMAGEN.join(',')}
          className="hidden"
          onChange={(e) => alElegir(e.target.files)}
        />
        {!value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={subiendo}
          >
            <Upload className="size-3.5" aria-hidden />
            Subir imagen
          </Button>
        )}
      </div>
    </Field>
  );
}
