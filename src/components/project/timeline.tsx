'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Link2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { eliminarEntrada } from '@/app/actions/projects';
import { formatDate } from '@/lib/format';
import type { Archivo, Entrada } from '@/lib/services/projects';
import type { LimitesArchivo } from '@/lib/storage';
import { Attachments, LinkDialog } from './attachments';
import { FileUploader } from './file-uploader';

/**
 * Línea de tiempo de avances: el corazón del cuaderno.
 *
 * Ordenada por fecha, de lo último a lo primero (lo que se hizo hoy es lo que
 * se quiere ver al abrir). Cada avance lleva colgados sus archivos.
 *
 * La administradora la ve igual que el alumno, pero sin poder editar: mira, no
 * interviene. No hay comentarios ni chat (así está especificado).
 */
export function Timeline({
  projectId,
  studentId,
  entradas,
  archivos,
  urls,
  limites,
  puedeEditar,
  onEditar,
}: {
  projectId: string;
  studentId: string;
  entradas: Entrada[];
  archivos: Archivo[];
  urls: Record<string, string>;
  /** Solo hace falta si se puede editar: la administradora no sube archivos. */
  limites?: LimitesArchivo;
  puedeEditar: boolean;
  onEditar?: (entrada: Entrada) => void;
}) {
  const router = useRouter();
  const [aEliminar, setAEliminar] = useState<Entrada | null>(null);
  const [enlazando, setEnlazando] = useState<Entrada | null>(null);

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarEntrada(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  if (entradas.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="Todavía no hay avances"
        description={
          puedeEditar
            ? 'Cada vez que trabajes en el proyecto, agregá un avance con lo que hiciste y las fotos.'
            : 'El alumno todavía no cargó ningún avance en este proyecto.'
        }
      />
    );
  }

  const archivosDe = (entradaId: string) => archivos.filter((a) => a.entry_id === entradaId);

  return (
    <>
      <ol className="space-y-4">
        {entradas.map((entrada) => {
          const adjuntos = archivosDe(entrada.id);

          return (
            <li key={entrada.id} className="relative pl-6">
              {/* Hilo de la línea de tiempo */}
              <span
                aria-hidden
                className="absolute left-[5px] top-2 h-full w-px bg-line last:hidden"
              />
              <span
                aria-hidden
                className="absolute left-0 top-1.5 size-2.5 rounded-full border-2 border-brand bg-surface"
              />

              <article className="rounded-card border border-line bg-surface p-4">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <time
                        dateTime={entrada.entry_date}
                        className="text-xs font-medium uppercase tracking-wide text-muted"
                      >
                        {formatDate(entrada.entry_date)}
                      </time>
                      {entrada.is_draft && <Badge tone="warning">Borrador</Badge>}
                    </div>
                    {entrada.title && (
                      <h3 className="mt-0.5 text-base font-semibold text-ink">{entrada.title}</h3>
                    )}
                  </div>

                  {puedeEditar && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEditar?.(entrada)}>
                        <Pencil className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAEliminar(entrada)}
                        aria-label="Eliminar avance"
                      >
                        <Trash2 className="size-3.5 text-danger" aria-hidden />
                      </Button>
                    </div>
                  )}
                </header>

                {entrada.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entrada.body}</p>
                )}

                {entrada.step_notes && (
                  <div className="mt-3 rounded-xl bg-canvas p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Paso a paso
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                      {entrada.step_notes}
                    </p>
                  </div>
                )}

                {(entrada.materials_used || entrada.measurements) && (
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {entrada.materials_used && (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted">Materiales</dt>
                        <dd className="whitespace-pre-wrap text-sm text-ink">
                          {entrada.materials_used}
                        </dd>
                      </div>
                    )}
                    {entrada.measurements && (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted">Medidas</dt>
                        <dd className="whitespace-pre-wrap text-sm text-ink">
                          {entrada.measurements}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {adjuntos.length > 0 && (
                  <Attachments
                    archivos={adjuntos}
                    urls={urls}
                    puedeEditar={puedeEditar}
                    className="mt-3"
                  />
                )}

                {puedeEditar && limites && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    <FileUploader
                      studentId={studentId}
                      projectId={projectId}
                      entryId={entrada.id}
                      limites={limites}
                      compacto
                      label="Agregar fotos"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEnlazando(entrada)}>
                      <Link2 className="size-3.5" aria-hidden />
                      Enlace de video
                    </Button>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>

      {enlazando && (
        <LinkDialog
          projectId={projectId}
          entryId={enlazando.id}
          onClose={() => setEnlazando(null)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar avance"
        description="Se elimina el avance y también sus fotos, videos y moldes del almacenamiento. No se puede recuperar."
      />
    </>
  );
}
