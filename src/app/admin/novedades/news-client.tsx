'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Newspaper, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { eliminarNovedad, fijarNovedad } from '@/app/actions/comms';
import type { NovedadConLecturas, OpcionesDestinatarios } from '@/lib/services/comms';
import type { LimitesArchivo } from '@/lib/storage';
import { PRIORIDAD, opciones } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { ESTADO_PUBLICACION } from '@/app/admin/comunicados/_partes/comunes';
import { NovedadForm } from './novedad-form';

export function NovedadesClient({
  novedades,
  total,
  opcionesDestino,
  limites,
}: {
  novedades: NovedadConLecturas[];
  total: number;
  opcionesDestino: OpcionesDestinatarios;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<NovedadConLecturas | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<NovedadConLecturas | null>(null);

  const columnas: ReadonlyArray<Column<NovedadConLecturas>> = [
    {
      header: 'Novedad',
      primary: true,
      render: (n) => (
        <div className="min-w-0">
          <span className="flex items-center gap-1.5">
            {n.is_pinned && <Pin className="size-3.5 shrink-0 text-brand" aria-label="Fijada" />}
            <span className="truncate">{n.title}</span>
          </span>
          <p className="truncate text-xs font-normal text-muted">
            {n.scope_label ?? '—'}
            {n.priority !== 'normal' && ` · Prioridad ${PRIORIDAD[n.priority].label.toLowerCase()}`}
          </p>
        </div>
      ),
    },
    {
      header: 'Publicada',
      render: (n) => (
        <span className="text-sm text-muted">
          {n.published_at ? formatDateTime(n.published_at) : 'Sin publicar'}
        </span>
      ),
    },
    {
      header: 'Leída por',
      render: (n) =>
        n.status === 'borrador' ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="tabular-nums">
            {n.leidos} de {n.destinatarios}
          </span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (n) =>
        n.vencida && n.status === 'publicada' ? (
          <Badge tone="neutral">Vencida</Badge>
        ) : (
          <StatusBadge value={n.status} map={ESTADO_PUBLICACION} />
        ),
    },
  ];

  async function alternarFijada(n: NovedadConLecturas) {
    const r = await fijarNovedad(n.id, !n.is_pinned);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarNovedad(aEliminar.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Novedades"
        description="Se ven en el inicio del alumno. Las fijadas van siempre arriba; las vencidas dejan de ser principales pero quedan en el historial."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nueva novedad
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar por título…" />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todas"
          options={[
            { value: 'borrador', label: 'Borradores' },
            { value: 'publicada', label: 'Publicadas' },
          ]}
        />
        <FilterSelect
          param="prioridad"
          label="Prioridad"
          allLabel="Toda prioridad"
          options={opciones(PRIORIDAD)}
        />
      </FiltersBar>

      {novedades.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-5" />}
          title="Todavía no hay novedades"
          description="Una novedad es un aviso general: un feriado, una muestra, un cambio en la academia."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva novedad
            </Button>
          }
        />
      ) : (
        <>
          <DataList
            items={novedades}
            columns={columnas}
            keyOf={(n) => n.id}
            actions={(n) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditando(n)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => alternarFijada(n)}>
                  {n.is_pinned ? (
                    <PinOff className="size-3.5" aria-hidden />
                  ) : (
                    <Pin className="size-3.5" aria-hidden />
                  )}
                  {n.is_pinned ? 'Desfijar' : 'Fijar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(n)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </>
            )}
          />
          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <NovedadForm
          novedad={editando}
          opcionesDestino={opcionesDestino}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar novedad"
        description={`Vas a eliminar «${aEliminar?.title}», su imagen y sus adjuntos. Si estaba publicada, desaparece del portal de los alumnos.`}
      />
    </div>
  );
}
