'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, FileText, Film, Link2, Ruler, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { agregarEnlace, eliminarArchivo } from '@/app/actions/projects';
import { esquemaEnlace, type DatosEnlace } from '@/lib/validations/projects';
import type { Archivo } from '@/lib/services/projects';
import { cn } from '@/lib/utils';

/**
 * Galería de adjuntos de un proyecto o de un avance.
 *
 * Las URLs vienen FIRMADAS desde el servidor (`firmarUrls`): el bucket es
 * privado y no existe una URL pública. Si un archivo no se pudo firmar, se
 * muestra igual, avisando: preferimos decirlo a hacer de cuenta que no está.
 *
 * Usamos <img> y no next/image a propósito: las URLs firmadas cambian en cada
 * render y apuntan a un host que habría que declarar en next.config.
 */

const ICONO = {
  documento: FileText,
  molde: Ruler,
  video: Film,
  otro: FileText,
  imagen: FileText,
} as const;

function pesoLegible(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Attachments({
  archivos,
  urls,
  puedeEditar,
  className,
}: {
  archivos: Archivo[];
  urls: Record<string, string>;
  puedeEditar: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [aEliminar, setAEliminar] = useState<Archivo | null>(null);

  if (archivos.length === 0) return null;

  const imagenes = archivos.filter((a) => a.kind === 'imagen' && a.storage_path);
  const videos = archivos.filter((a) => a.kind === 'video');
  const otros = archivos.filter(
    (a) => a.kind !== 'imagen' && a.kind !== 'video',
  );

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarArchivo(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  const botonBorrar = (archivo: Archivo) =>
    puedeEditar && (
      <button
        type="button"
        onClick={() => setAEliminar(archivo)}
        aria-label={`Eliminar ${archivo.file_name ?? 'archivo'}`}
        className="absolute right-1.5 top-1.5 rounded-lg bg-surface/90 p-1.5 text-danger opacity-0 shadow-sm transition-opacity hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Fotos */}
      {imagenes.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {imagenes.map((a) => {
            const url = a.storage_path ? urls[a.storage_path] : undefined;
            return (
              <li
                key={a.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-canvas"
              >
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={a.file_name ?? 'Foto del avance'}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  </a>
                ) : (
                  <p className="flex size-full items-center justify-center p-3 text-center text-xs text-muted">
                    No pudimos cargar esta foto
                  </p>
                )}
                {botonBorrar(a)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Videos: subidos al bucket o enlaces externos */}
      {videos.length > 0 && (
        <ul className="space-y-2">
          {videos.map((a) => {
            const url = a.storage_path ? urls[a.storage_path] : undefined;

            if (a.external_url) {
              return (
                <li
                  key={a.id}
                  className="group relative flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
                  <a
                    href={a.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand hover:underline"
                  >
                    {a.file_name || 'Video (enlace externo)'}
                  </a>
                  <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setAEliminar(a)}
                      aria-label={`Eliminar ${a.file_name ?? 'enlace'}`}
                      className="shrink-0 rounded-lg p-1 text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            }

            return (
              <li key={a.id} className="group relative overflow-hidden rounded-xl border border-line bg-black">
                {url ? (
                  <video src={url} controls preload="metadata" className="w-full max-h-80" />
                ) : (
                  <p className="p-4 text-center text-xs text-muted">
                    No pudimos cargar este video
                  </p>
                )}
                {botonBorrar(a)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Documentos y moldes */}
      {otros.length > 0 && (
        <ul className="space-y-2">
          {otros.map((a) => {
            const Icono = ICONO[a.kind] ?? FileText;
            const url = a.storage_path ? urls[a.storage_path] : a.external_url ?? undefined;
            const peso = pesoLegible(a.size_bytes);

            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <Icono className="size-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-ink hover:text-brand hover:underline"
                    >
                      {a.file_name || 'Archivo'}
                    </a>
                  ) : (
                    <p className="truncate text-sm text-muted">
                      {a.file_name || 'Archivo'} · no pudimos generar el enlace
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    {a.kind === 'molde' ? 'Molde' : 'Documento'}
                    {peso ? ` · ${peso}` : ''}
                  </p>
                </div>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setAEliminar(a)}
                    aria-label={`Eliminar ${a.file_name ?? 'archivo'}`}
                    className="shrink-0 rounded-lg p-1 text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar archivo"
        description={`Vas a eliminar «${aEliminar?.file_name ?? 'este archivo'}». También se borra del almacenamiento y no se puede recuperar.`}
      />
    </div>
  );
}

/**
 * Sistema mixto de video: el video corto se sube al bucket (FileUploader) y el
 * largo se guarda como enlace externo. Este es el segundo camino.
 */
export function LinkDialog({
  projectId,
  entryId = null,
  onClose,
}: {
  projectId: string;
  entryId?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosEnlace>({
    resolver: zodResolver(esquemaEnlace),
    defaultValues: { external_url: '', file_name: '' },
  });

  async function onSubmit(datos: DatosEnlace) {
    const r = await agregarEnlace(projectId, entryId, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Agregar enlace de video"
      description="Para videos largos: subilos a YouTube o Drive y pegá acá el enlace. Los videos cortos conviene subirlos directamente."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="enlace-form" type="submit" loading={isSubmitting}>
            Agregar
          </Button>
        </>
      }
    >
      <form id="enlace-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Enlace"
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          required
          autoFocus
          error={errors.external_url?.message}
          {...register('external_url')}
        />
        <Input
          label="Nombre"
          placeholder="Cómo hice el ruedo"
          hint="Opcional. Para reconocerlo después."
          error={errors.file_name?.message}
          {...register('file_name')}
        />
      </form>
    </Dialog>
  );
}
