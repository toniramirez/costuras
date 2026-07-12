'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarPlus, ClipboardList, Pencil, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { editarAsistencia } from '@/app/actions/attendance';
import type { GrupoBasico, RegistroHistorial } from '@/lib/services/attendance';
import { ESTADO_ASISTENCIA, opciones } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { DialogRegistro, FechaUrl, type EstadoAsistencia } from '../attendance-ui';
import { DialogEmision, type AusenciaEmitible } from '@/app/admin/recuperaciones/recovery-client';

/** Los estados que pueden generar un crédito de recuperación. */
const ES_AUSENCIA = (e: EstadoAsistencia) =>
  e === 'ausente_justificada' || e === 'ausente_sin_justificar';

export function HistoryClient({
  filas,
  total,
  grupos,
  validezDias,
}: {
  filas: RegistroHistorial[];
  total: number;
  grupos: GrupoBasico[];
  validezDias: number;
}) {
  const router = useRouter();

  const [aEditar, setAEditar] = useState<RegistroHistorial | null>(null);
  const [aEmitir, setAEmitir] = useState<AusenciaEmitible | null>(null);

  async function guardarEdicion(estado: EstadoAsistencia, observacion: string) {
    if (!aEditar) return;

    const r = await editarAsistencia(aEditar.id, { status: estado, observation: observacion });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success(r.message);
    setAEditar(null);
    router.refresh();
  }

  const columnas: ReadonlyArray<Column<RegistroHistorial>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span>{r.alumno}</span>
          {r.is_recovery && (
            <RotateCcw className="size-3.5 shrink-0 text-brand" aria-label="Recuperación" />
          )}
        </div>
      ),
    },
    {
      header: 'Fecha',
      render: (r) => <span className="tabular-nums">{formatDate(r.fecha)}</span>,
    },
    {
      header: 'Grupo',
      render: (r) => r.grupo ?? <span className="text-muted">—</span>,
    },
    {
      header: 'Observación',
      desktopOnly: true,
      render: (r) =>
        r.observation ? (
          <span className="text-sm text-muted">{r.observation}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (r) => <StatusBadge value={r.status} map={ESTADO_ASISTENCIA} />,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link
          href="/admin/asistencia"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver a tomar asistencia
        </Link>

        <PageHeader
          title="Historial de asistencia"
          description="Todo lo registrado. Podés corregir un registro y generar la recuperación de una ausencia."
        />
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar alumno…" />

        <FilterSelect
          param="grupo"
          label="Grupo"
          allLabel="Todos los grupos"
          options={grupos.map((g) => ({ value: g.id, label: g.name }))}
        />

        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={opciones(ESTADO_ASISTENCIA)}
        />

        <RangoFechas />
      </FiltersBar>

      {filas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="No hay registros"
          description="Probá con otros filtros, o tomá asistencia de una clase para empezar a ver el historial."
        />
      ) : (
        <>
          <DataList
            items={filas}
            columns={columnas}
            keyOf={(r) => r.id}
            actions={(r) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setAEditar(r)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>

                {ES_AUSENCIA(r.status) &&
                  (r.tiene_credito ? (
                    <Badge tone="brand">Con recuperación</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setAEmitir({
                          attendance_id: r.id,
                          alumno: r.alumno,
                          fecha: r.fecha,
                          grupo: r.grupo,
                          status: r.status,
                        })
                      }
                    >
                      <CalendarPlus className="size-3.5" aria-hidden />
                      Generar recuperación
                    </Button>
                  ))}
              </>
            )}
          />

          <Pagination total={total} />
        </>
      )}

      {aEditar && (
        <DialogRegistro
          nombre={aEditar.alumno}
          estado={aEditar.status}
          observacion={aEditar.observation}
          onClose={() => setAEditar(null)}
          onSave={guardarEdicion}
        />
      )}

      {aEmitir && (
        <DialogEmision
          ausencia={aEmitir}
          validezDias={validezDias}
          onClose={() => setAEmitir(null)}
        />
      )}
    </div>
  );
}

/**
 * Rango de fechas de la CLASE (no de cuándo se cargó el registro).
 * Sin valor por defecto: vacío significa "sin límite", así que lee de la URL.
 */
function RangoFechas() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">Del</span>
      <FechaUrl param="desde" label="Desde" />
      <span className="text-xs text-muted">al</span>
      <FechaUrl param="hasta" label="Hasta" />
    </div>
  );
}
