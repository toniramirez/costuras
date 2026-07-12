'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { eliminarTaller } from '@/app/actions/workshops';
import type { TallerConCupo } from '@/lib/services/workshops';
import { ESTADO_TALLER, opciones } from '@/lib/labels';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import type { LimitesArchivo } from '@/lib/storage';
import { TallerForm, type Caja } from './taller-form';

/** "3 / 12" con el cupo REAL: solo cuentan los lugares pagados. */
function TextoCupo({ taller }: { taller: TallerConCupo }) {
  if (taller.capacity === 0) {
    return (
      <span className="tabular-nums text-muted">
        {taller.confirmados} · <span className="text-xs">sin límite</span>
      </span>
    );
  }

  const completo = taller.confirmados >= taller.capacity;
  return (
    <span className={completo ? 'font-medium tabular-nums text-warning' : 'tabular-nums text-ink'}>
      {taller.confirmados} / {taller.capacity}
    </span>
  );
}

export function TalleresClient({
  talleres,
  total,
  cajas,
  limites,
}: {
  talleres: TallerConCupo[];
  total: number;
  cajas: Caja[];
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editando, setEditando] = useState<TallerConCupo | null | undefined>(undefined); // undefined = cerrado
  const [aEliminar, setAEliminar] = useState<TallerConCupo | null>(null);

  const hayFiltros = Array.from(searchParams.keys()).some((k) => k !== 'pagina');

  const columnas: ReadonlyArray<Column<TallerConCupo>> = [
    {
      header: 'Taller',
      primary: true,
      render: (t) => (
        <div className="flex items-center gap-3">
          {t.imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
            <img
              src={t.imagenUrl}
              alt=""
              className="hidden size-10 shrink-0 rounded-lg object-cover lg:block"
            />
          )}
          <div className="min-w-0">
            <span>{t.name}</span>
            {(t.category || t.responsible_name) && (
              <p className="truncate text-xs font-normal text-muted">
                {[t.category, t.responsible_name].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Fecha',
      render: (t) => (
        <div>
          <span>{formatDate(t.event_date)}</span>
          {t.start_time && (
            <p className="text-xs text-muted">
              {formatTime(t.start_time)}
              {t.end_time ? ` a ${formatTime(t.end_time)}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Cupo',
      render: (t) => <TextoCupo taller={t} />,
    },
    {
      header: 'Precio',
      render: (t) =>
        Number(t.price_cents) === 0 ? (
          <Badge tone="brand">Gratuito</Badge>
        ) : (
          <span className="font-medium tabular-nums">{formatMoney(Number(t.price_cents))}</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (t) => <StatusBadge value={t.status} map={ESTADO_TALLER} />,
    },
  ];

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarTaller(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Talleres"
        description="Talleres especiales de una sola clase. El cupo se ocupa recién cuando se confirma el pago de cada inscripción."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nuevo taller
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar por nombre, categoría o responsable…" />
        <FilterSelect param="estado" label="Estado" allLabel="Todos los estados" options={opciones(ESTADO_TALLER)} />
      </FiltersBar>

      {talleres.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No hay talleres con esos filtros"
            description="Probá con otro estado o limpiá la búsqueda."
          />
        ) : (
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="Todavía no hay talleres"
            description="Creá el primero: cargá la fecha, el cupo y el precio, y después anotá a las personas."
            action={
              <Button onClick={() => setEditando(null)}>
                <Plus className="size-4" aria-hidden />
                Nuevo taller
              </Button>
            }
          />
        )
      ) : (
        <>
          <DataList
            items={talleres}
            columns={columnas}
            keyOf={(t) => t.id}
            hrefOf={(t) => `/admin/talleres/${t.id}`}
            actions={(t) => (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(`/admin/talleres/${t.id}`)}
                >
                  <Eye className="size-3.5" aria-hidden />
                  Inscripciones
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(t)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(t)} aria-label="Eliminar taller">
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </>
            )}
          />
          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <TallerForm
          taller={editando}
          cajas={cajas}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar taller"
        description={`Vas a eliminar «${aEliminar?.name}». Si ya tiene inscripciones, el sistema no lo va a borrar: en ese caso, cambiale el estado a «Cancelado».`}
      />
    </div>
  );
}
