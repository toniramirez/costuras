'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, MessageSquarePlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { cambiarEstadoSugerencia, eliminarSugerencia } from '@/app/actions/library';
import type { Sugerencia } from '@/lib/services/library';
import { ESTADO_SUGERENCIA, opciones } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { LimitesArchivo } from '@/lib/storage';
import { TerminoForm } from './termino-form';

type Fila = Sugerencia & { alumna: string | null };

/**
 * Bandeja de palabras que las alumnas pidieron para el glosario.
 *
 * Nada de acá se publica solo: es un pedido, no una entrada. La acción principal
 * —«Crear ficha»— abre el formulario del glosario con la palabra ya escrita, y al
 * guardar marca la sugerencia como usada en la misma operación. Si fueran dos
 * pasos separados, la palabra podría quedar publicada y pendiente a la vez.
 */
export function SugerenciasClient({
  sugerencias,
  limites,
}: {
  sugerencias: Fila[];
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState<Fila | null>(null);
  const [aEliminar, setAEliminar] = useState<Fila | null>(null);

  async function descartar(sugerencia: Fila) {
    const r = await cambiarEstadoSugerencia(sugerencia.id, 'descartada');
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarSugerencia(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Palabras que las alumnas no encontraron en el glosario. Solo las ves vos: nada de esto se
        publica hasta que crees la ficha.
      </p>

      <FiltersBar>
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todas"
          options={opciones(ESTADO_SUGERENCIA)}
        />
      </FiltersBar>

      {sugerencias.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="No hay sugerencias"
          description="Cuando una alumna no encuentre una palabra y la sugiera, te va a aparecer acá."
        />
      ) : (
        <ul className="space-y-2">
          {sugerencias.map((sugerencia) => (
            <li
              key={sugerencia.id}
              className="rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(43,37,34,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{sugerencia.term}</h3>
                    <StatusBadge value={sugerencia.status} map={ESTADO_SUGERENCIA} />
                  </div>

                  {sugerencia.notes && (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">
                      {sugerencia.notes}
                    </p>
                  )}

                  <p className="mt-1.5 text-xs text-muted">
                    {sugerencia.alumna ?? 'Alumna dada de baja'} ·{' '}
                    {formatDateTime(sugerencia.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {sugerencia.status === 'pendiente' && (
                    <>
                      <Button size="sm" onClick={() => setCreando(sugerencia)}>
                        <Plus className="size-3.5" aria-hidden />
                        Crear ficha
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => descartar(sugerencia)}>
                        <X className="size-3.5" aria-hidden />
                        Descartar
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAEliminar(sugerencia)}
                    aria-label={`Eliminar la sugerencia «${sugerencia.term}»`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creando && (
        <TerminoForm
          termino={null}
          sugerencia={{ id: creando.id, term: creando.term }}
          limites={limites}
          onClose={() => setCreando(null)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar sugerencia"
        description={`Vas a borrar el pedido de «${aEliminar?.term ?? ''}». Si solo querés sacarlo de la lista de pendientes, usá «Descartar».`}
      />
    </div>
  );
}

/** Aviso del encabezado cuando hay pedidos sin responder. */
export function AvisoSugerencias({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
      <MessageSquarePlus className="size-3" aria-hidden />
      {cantidad}
    </span>
  );
}
