'use client';

import { useEffect, useMemo, useRef } from 'react';
import { FileText, Film, ImagePlus, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { validarArchivo, type LimitesArchivo } from '@/lib/storage';
import { cn } from '@/lib/utils';

type Tipo = 'imagen' | 'video' | 'pdf';

const ICONO: Record<Tipo, typeof ImagePlus> = {
  imagen: ImagePlus,
  video: Film,
  pdf: FileText,
};

/**
 * Campo de archivo de la biblioteca: elegir, ver lo que ya hay y quitarlo.
 *
 * Es SOLO la parte visual y la validación previa (tipo y tamaño). Quién sube y
 * cuándo lo decide el formulario que lo usa, porque la ruta del bucket necesita
 * el id de la fila y ese id, en un alta, recién existe después de guardar.
 *
 * La validación pasa ANTES de subir a propósito: no tiene sentido gastarle los
 * datos del celular a alguien para después rechazarle el archivo.
 */
export function CampoArchivo({
  label,
  hint,
  tipo,
  accept,
  limites,
  /** Lo que ya está guardado en la ficha. */
  actual,
  archivo,
  progreso,
  onElegir,
  onQuitar,
  onError,
}: {
  label: string;
  hint?: string;
  tipo: Tipo;
  accept: string;
  limites: LimitesArchivo;
  actual?: { url: string | null; nombre: string | null } | null;
  /** Archivo elegido y todavía sin subir. */
  archivo: File | null;
  progreso: number | null;
  onElegir: (file: File) => void;
  onQuitar?: () => void;
  onError: (mensaje: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  // La vista previa se DERIVA del archivo elegido: no es estado, es una función
  // de lo que ya tenemos. Guardarla en `useState` desde un efecto provocaría un
  // render en cascada por cada archivo elegido.
  const vistaPrevia = useMemo(
    () => (archivo && tipo === 'imagen' ? URL.createObjectURL(archivo) : null),
    [archivo, tipo],
  );

  // Una URL de objeto que no se libera es memoria retenida hasta que se recargue
  // la página.
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Se limpia siempre: si vuelve a elegir el MISMO archivo, tiene que
    // dispararse el evento otra vez.
    e.target.value = '';
    if (!file) return;

    const problema = validarArchivo(file, limites);
    if (problema) {
      onError(problema);
      return;
    }

    onElegir(file);
  }

  const Icono = ICONO[tipo];
  const subiendo = progreso !== null;
  const hayAlgo = Boolean(archivo || actual?.url);

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-start gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
          {vistaPrevia || (tipo === 'imagen' && actual?.url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
            <img
              src={vistaPrevia ?? actual?.url ?? ''}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Icono className={cn('size-5', hayAlgo ? 'text-brand' : 'text-muted')} aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm text-ink">
            {archivo?.name ?? actual?.nombre ?? (
              <span className="text-muted">Todavía no cargaste nada.</span>
            )}
          </p>

          <input
            ref={input}
            type="file"
            accept={accept}
            onChange={elegir}
            className="sr-only"
            aria-label={label}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={subiendo}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-3.5" aria-hidden />
              {hayAlgo ? 'Cambiar' : 'Elegir archivo'}
            </Button>

            {onQuitar && actual?.url && !archivo && (
              <Button type="button" size="sm" variant="ghost" disabled={subiendo} onClick={onQuitar}>
                <Trash2 className="size-3.5 text-danger" aria-hidden />
                Quitar
              </Button>
            )}
          </div>

          {subiendo && (
            <div
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Subiendo ${label}`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${progreso}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </Field>
  );
}
