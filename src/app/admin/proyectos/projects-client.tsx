'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageOff, Images, Pencil, Plus, Scissors, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { AdminProjectForm } from '@/components/project/project-form';
import { alternarDestacado, eliminarProyecto } from '@/app/actions/projects';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO, opciones } from '@/lib/labels';
import { formatTimestampAsDate } from '@/lib/format';
import type { ProyectoConAlumno } from '@/lib/services/projects';
import { cn } from '@/lib/utils';

type Alumno = { id: string; first_name: string; last_name: string };

export function AdminProjectsClient({
  proyectos,
  total,
  alumnos,
  tipos,
  portadas,
}: {
  proyectos: ProyectoConAlumno[];
  total: number;
  alumnos: Alumno[];
  tipos: string[];
  portadas: Record<string, string>;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<ProyectoConAlumno | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<ProyectoConAlumno | null>(null);

  const columnas: ReadonlyArray<Column<ProyectoConAlumno>> = [
    {
      header: 'Proyecto',
      primary: true,
      render: (p) => {
        const url = p.cover_image_path ? portadas[p.cover_image_path] : undefined;
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <ImageOff className="size-4 text-muted" aria-hidden />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate">{p.title}</span>
                {p.is_featured && (
                  <Star className="size-3.5 shrink-0 fill-current text-accent" aria-label="Destacado" />
                )}
              </span>
              <span className="block truncate text-xs font-normal text-muted">
                {p.students ? `${p.students.first_name} ${p.students.last_name}` : 'Sin alumno'}
              </span>
            </span>
          </div>
        );
      },
    },
    {
      header: 'Dificultad',
      render: (p) => <StatusBadge value={p.difficulty} map={DIFICULTAD_PROYECTO} />,
    },
    {
      header: 'Actualizado',
      desktopOnly: true,
      // formatTimestampAsDate y no un slice del ISO: `updated_at` es timestamptz
      // y de noche el UTC ya es el día siguiente que en Córdoba.
      render: (p) => <span className="text-muted">{formatTimestampAsDate(p.updated_at)}</span>,
    },
    {
      header: 'Estado',
      trailing: true,
      render: (p) => <StatusBadge value={p.status} map={ESTADO_PROYECTO} />,
    },
  ];

  async function destacar(p: ProyectoConAlumno) {
    const r = await alternarDestacado(p.id, !p.is_featured);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarProyecto(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Proyectos"
        description="El cuaderno de cada alumno. Solo vos y el dueño de cada proyecto pueden verlo."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/proyectos/galeria"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              <Images className="size-4" aria-hidden />
              Galería
            </Link>
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo proyecto
            </Button>
          </div>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar proyecto…" />
        <FilterSelect
          param="alumno"
          label="Alumno"
          allLabel="Todos los alumnos"
          options={alumnos.map((a) => ({
            value: a.id,
            label: `${a.last_name}, ${a.first_name}`,
          }))}
        />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={opciones(ESTADO_PROYECTO)}
        />
        <FilterSelect
          param="dificultad"
          label="Dificultad"
          allLabel="Toda dificultad"
          options={opciones(DIFICULTAD_PROYECTO)}
        />
      </FiltersBar>

      {proyectos.length === 0 ? (
        <EmptyState
          icon={<Scissors className="size-5" />}
          title="No hay proyectos"
          description="Cuando los alumnos empiecen a cargar su cuaderno, los vas a ver acá. También podés crear uno a nombre de un alumno."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo proyecto
            </Button>
          }
        />
      ) : (
        <>
          <DataList
            items={proyectos}
            columns={columnas}
            keyOf={(p) => p.id}
            hrefOf={(p) => `/admin/proyectos/${p.id}`}
            actions={(p) => (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => destacar(p)}
                  aria-label={p.is_featured ? 'Quitar destacado' : 'Destacar'}
                >
                  <Star
                    className={cn('size-3.5', p.is_featured && 'fill-current text-accent')}
                    aria-hidden
                  />
                  {p.is_featured ? 'Sin destacar' : 'Destacar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAEliminar(p)}
                  aria-label={`Eliminar ${p.title}`}
                >
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </>
            )}
          />
          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <AdminProjectForm
          proyecto={editando}
          alumnos={alumnos}
          tipos={tipos}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar proyecto"
        description={`Vas a eliminar «${aEliminar?.title}» con todos sus avances, fotos, videos y moldes. El alumno lo pierde también. No se puede recuperar.`}
      />
    </div>
  );
}
