'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookA, FileText, Film, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { eliminarTermino } from '@/app/actions/library';
import type { TerminoConArchivos } from '@/lib/services/library';
import type { LimitesArchivo } from '@/lib/storage';
import { TerminoForm } from './termino-form';

/**
 * El glosario, del lado de la academia.
 *
 * Se muestra como fichas y no como tabla: es lo mismo que ve la alumna, y así
 * quien carga una definición ve enseguida si quedó demasiado corta o demasiado
 * larga. Una tabla de dos columnas escondería justamente eso.
 */
export function GlosarioClient({
  terminos,
  total,
  limites,
}: {
  terminos: TerminoConArchivos[];
  total: number;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editando, setEditando] = useState<TerminoConArchivos | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<TerminoConArchivos | null>(null);

  const buscando = Boolean(searchParams.get('q'));

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarTermino(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Un diccionario de costura adentro de la aplicación. Se ordena solo, alfabéticamente.
        </p>
        <Button onClick={() => setEditando(null)}>
          <Plus className="size-4" aria-hidden />
          Nuevo término
        </Button>
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar una palabra…" />
      </FiltersBar>

      {terminos.length === 0 ? (
        buscando ? (
          <EmptyState
            icon={<BookA className="size-5" />}
            title="Ninguna palabra coincide"
            description="Probá con otra búsqueda, o creá el término que falta."
            action={
              <Button onClick={() => setEditando(null)}>
                <Plus className="size-4" aria-hidden />
                Nuevo término
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<BookA className="size-5" />}
            title="El glosario está vacío"
            description="Cargá las palabras que más se repiten en clase: hilván, bies, entretela, pinza…"
            action={
              <Button onClick={() => setEditando(null)}>
                <Plus className="size-4" aria-hidden />
                Nuevo término
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="space-y-2">
            {terminos.map((termino) => (
              <li
                key={termino.id}
                className="rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(43,37,34,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">{termino.term}</h3>
                      {!termino.is_published && <Badge tone="neutral">Borrador</Badge>}
                    </div>

                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">
                      {termino.definition}
                    </p>

                    {termino.usage_notes && (
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                        <span className="font-medium text-ink">Se usa para: </span>
                        {termino.usage_notes}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                      {termino.imagenUrl && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="size-3.5" aria-hidden />
                          Imagen
                        </span>
                      )}
                      {termino.videoUrl && (
                        <span className="inline-flex items-center gap-1">
                          <Film className="size-3.5" aria-hidden />
                          Video
                        </span>
                      )}
                      {termino.pdfUrl && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3.5" aria-hidden />
                          PDF
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(termino)}
                      aria-label={`Editar ${termino.term}`}
                      className="rounded-lg p-2 text-muted hover:bg-line/40 hover:text-ink"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAEliminar(termino)}
                      aria-label={`Eliminar ${termino.term}`}
                      className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <TerminoForm
          termino={editando}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar término"
        description={`Vas a eliminar «${aEliminar?.term ?? ''}» del glosario, junto con su imagen, su video y su PDF. Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
