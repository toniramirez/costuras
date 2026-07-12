'use client';

import { useRouter } from 'next/navigation';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import type { AlumnoListado } from '@/lib/services/students';
import { ESTADO_ALUMNO, opciones } from '@/lib/labels';
import { formatMoney, formatSchedule, formatTime, formatWeekday } from '@/lib/format';

type GrupoFiltro = { id: string; name: string; weekday: number; start_time: string };

export function StudentsClient({
  alumnos,
  total,
  porPagina,
  grupos,
}: {
  alumnos: AlumnoListado[];
  total: number;
  porPagina: number;
  grupos: GrupoFiltro[];
}) {
  const router = useRouter();
  const irANuevo = () => router.push('/admin/alumnos/nuevo');

  const columnas: ReadonlyArray<Column<AlumnoListado>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (a) => (
        <div>
          <span>
            {a.last_name}, {a.first_name}
          </span>
          <p className="text-xs font-normal text-muted">
            {[a.dni && `DNI ${a.dni}`, a.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
          </p>
        </div>
      ),
    },
    {
      header: 'Grupo',
      render: (a) =>
        a.groups ? (
          <span>
            {a.groups.name}
            <span className="block text-xs text-muted">
              {formatSchedule(a.groups.weekday, a.groups.start_time, a.groups.end_time)}
            </span>
          </span>
        ) : (
          <span className="text-muted">Sin grupo</span>
        ),
    },
    {
      header: 'Modalidad',
      desktopOnly: true,
      render: (a) => a.plans?.name ?? <span className="text-muted">—</span>,
    },
    {
      header: 'Cuota',
      render: (a) =>
        a.rates ? (
          <span className="tabular-nums">{formatMoney(a.rates.amount_cents)}</span>
        ) : (
          <span className="text-muted">Precio base</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (a) => <StatusBadge value={a.status} map={ESTADO_ALUMNO} />,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Alumnos"
        description="La ficha de cada alumno: sus datos, su grupo, su tarifa y su historial."
        action={
          <Button onClick={irANuevo}>
            <Plus className="size-4" aria-hidden />
            Nuevo alumno
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar por nombre, apellido, DNI o correo…" />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={opciones(ESTADO_ALUMNO)}
        />
        <FilterSelect
          param="grupo"
          label="Grupo"
          allLabel="Todos los grupos"
          options={grupos.map((g) => ({
            value: g.id,
            label: `${g.name} · ${formatWeekday(g.weekday)} ${formatTime(g.start_time)}`,
          }))}
        />
      </FiltersBar>

      {alumnos.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No hay alumnos para mostrar"
          description="Puede que no haya ninguno todavía o que los filtros sean muy específicos."
          action={
            <Button onClick={irANuevo}>
              <Plus className="size-4" aria-hidden />
              Nuevo alumno
            </Button>
          }
        />
      ) : (
        <>
          {/* Sin botones en la fila: toda la fila lleva a la ficha, que es donde
              están las acciones. En el celular, una tarjeta con cinco botones no
              se puede tocar con el pulgar. */}
          <DataList
            items={alumnos}
            columns={columnas}
            keyOf={(a) => a.id}
            hrefOf={(a) => `/admin/alumnos/${a.id}`}
          />
          <Pagination total={total} porPagina={porPagina} />
        </>
      )}
    </div>
  );
}
