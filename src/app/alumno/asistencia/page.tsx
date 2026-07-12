import type { Metadata } from 'next';
import { CalendarCheck, CalendarX, RefreshCcw, UserCheck } from 'lucide-react';

import { StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
// rangoPagina va desde @/lib/pagination: el módulo del componente es 'use client'
// y llamar una función suya desde el servidor revienta en runtime.
import { paginaDe, rangoPagina } from '@/lib/pagination';
import { requireStudent } from '@/lib/auth';
import { getAsistencia, type AsistenciaFila } from '@/lib/services/student-portal';
import { ESTADO_ASISTENCIA, opciones } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { FiltroFechas } from './filtro-fechas';

export const metadata: Metadata = { title: 'Mi asistencia' };

/**
 * Historial de asistencias. Solo lectura: la asistencia la registra la academia.
 *
 * Los filtros viajan por la URL (searchParams), nunca en estado local: así se
 * conservan al volver atrás, al recargar y al compartir el enlace.
 */
export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; desde?: string; hasta?: string; pagina?: string }>;
}) {
  const { student } = await requireStudent();
  const { estado, desde, hasta, pagina } = await searchParams;

  const { filas, resumen } = await getAsistencia(student.id, { estado, desde, hasta });

  const paginaActual = paginaDe(pagina);
  const [inicio, fin] = rangoPagina(paginaActual);
  const visibles = filas.slice(inicio, fin + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Mi asistencia"
        description="El registro de tus clases. Lo lleva la academia."
      />

      {/* El resumen cuenta TODOS los estados del período elegido (no le afecta
          el filtro de estado: si no, sería un solo número mirándose al espejo). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Presentes"
          value={resumen.presentes}
          icon={<UserCheck className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Justificadas"
          value={resumen.justificadas}
          icon={<CalendarCheck className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Sin justificar"
          value={resumen.sinJustificar}
          icon={<CalendarX className="size-4" />}
          tone="danger"
        />
        <StatCard
          label="Recuperaciones"
          value={resumen.recuperaciones}
          icon={<RefreshCcw className="size-4" />}
        />
      </div>

      <FiltersBar>
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={opciones(ESTADO_ASISTENCIA)}
        />
        <FiltroFechas />
      </FiltersBar>

      {filas.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="size-5" />}
          title={
            resumen.total === 0
              ? 'Todavía no hay clases registradas'
              : 'No hay clases con esos filtros'
          }
          description={
            resumen.total === 0
              ? 'Cuando la academia tome asistencia, tus clases van a aparecer acá.'
              : 'Probá con otro estado o ampliá el rango de fechas.'
          }
        />
      ) : (
        <div className="space-y-3">
          <DataList items={visibles} columns={COLUMNAS} keyOf={(f) => f.id} />
          <Pagination total={filas.length} />
        </div>
      )}
    </div>
  );
}

const COLUMNAS: ReadonlyArray<Column<AsistenciaFila>> = [
  {
    header: 'Fecha',
    primary: true,
    render: (f) => (
      <div className="flex items-center gap-2">
        <span>{formatDate(f.fecha)}</span>
        {f.esRecuperacion && <Badge tone="brand">Recuperación</Badge>}
      </div>
    ),
  },
  { header: 'Grupo', render: (f) => f.grupo ?? '—' },
  { header: 'Observación', render: (f) => f.observacion ?? '—' },
  {
    header: 'Estado',
    trailing: true,
    render: (f) => <StatusBadge value={f.estado} map={ESTADO_ASISTENCIA} />,
  },
];
