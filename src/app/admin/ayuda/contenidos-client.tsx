'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, FolderTree, LifeBuoy, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { CategoriasDialog } from '@/components/library/categorias-dialog';
import { eliminarContenido } from '@/app/actions/library';
import type { Categoria, ContenidoConArchivo } from '@/lib/services/library';
import { TIPO_CONTENIDO } from '@/lib/labels';
import type { LimitesArchivo } from '@/lib/storage';
import { ContenidoForm } from './contenido-form';

/**
 * El material del centro de ayuda.
 *
 * Las categorías se administran desde el mismo lugar (botón «Categorías»): son
 * parte de esta pantalla, no un ajuste escondido en otra. Agregar una sección
 * nueva y publicar en ella tiene que ser un solo movimiento, porque es lo que la
 * academia va a hacer cada vez que aparezca un tema que no estaba previsto.
 */
export function ContenidosClient({
  contenidos,
  total,
  categorias,
  uso,
  limites,
}: {
  contenidos: ContenidoConArchivo[];
  total: number;
  categorias: Categoria[];
  uso: Record<string, number>;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editando, setEditando] = useState<ContenidoConArchivo | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<ContenidoConArchivo | null>(null);
  const [viendoCategorias, setViendoCategorias] = useState(false);

  const hayFiltros = Array.from(searchParams.keys()).some(
    (k) => k !== 'pagina' && k !== 'seccion',
  );

  const columnas: ReadonlyArray<Column<ContenidoConArchivo>> = [
    {
      header: 'Título',
      primary: true,
      render: (c) => (
        <div className="min-w-0">
          <span>{c.title}</span>
          {c.description && (
            <p className="truncate text-xs font-normal text-muted">{c.description}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Tipo',
      render: (c) => <StatusBadge value={c.kind} map={TIPO_CONTENIDO} />,
    },
    {
      header: 'Categoría',
      render: (c) => (
        <span className={c.categoria ? 'text-ink' : 'text-muted'}>
          {c.categoria?.name ?? 'Sin categoría'}
        </span>
      ),
    },
    {
      header: 'Archivo',
      desktopOnly: true,
      render: (c) => {
        if (c.kind === 'texto') return <span className="text-muted">—</span>;
        if (!c.url) {
          return <span className="text-xs font-medium text-warning">Falta subirlo</span>;
        }
        return (
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            Abrir
          </a>
        );
      },
    },
    {
      header: 'Estado',
      trailing: true,
      render: (c) =>
        c.is_published ? (
          <Badge tone="success">Publicado</Badge>
        ) : (
          <Badge tone="neutral">Borrador</Badge>
        ),
    },
  ];

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarContenido(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Videos, imágenes, PDF y textos que las alumnas consultan desde «¡Necesito ayuda!».
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setViendoCategorias(true)}>
            <FolderTree className="size-4" aria-hidden />
            Categorías
          </Button>
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nuevo contenido
          </Button>
        </div>
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar por título, descripción o texto…" />
        <FilterSelect
          param="categoria"
          label="Categoría"
          allLabel="Todas las categorías"
          options={[
            ...categorias.map((c) => ({ value: c.id, label: c.name })),
            { value: 'sin', label: 'Sin categoría' },
          ]}
        />
      </FiltersBar>

      {contenidos.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            icon={<LifeBuoy className="size-5" />}
            title="No hay contenido con esos filtros"
            description="Probá con otra categoría o limpiá la búsqueda."
          />
        ) : (
          <EmptyState
            icon={<LifeBuoy className="size-5" />}
            title="El centro de ayuda está vacío"
            description="Subí el primer material: un video de cómo enhebrar la máquina, una guía en PDF, una explicación escrita."
            action={
              <Button onClick={() => setEditando(null)}>
                <Plus className="size-4" aria-hidden />
                Nuevo contenido
              </Button>
            }
          />
        )
      ) : (
        <>
          <DataList
            items={contenidos}
            columns={columnas}
            keyOf={(c) => c.id}
            actions={(c) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAEliminar(c)}
                  aria-label={`Eliminar ${c.title}`}
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
        <ContenidoForm
          contenido={editando}
          categorias={categorias}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      {viendoCategorias && (
        <CategoriasDialog
          scope="ayuda"
          categorias={categorias}
          uso={uso}
          onClose={() => setViendoCategorias(false)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar contenido"
        description={`Vas a eliminar «${aEliminar?.title ?? ''}» y su archivo. Las alumnas dejan de verlo. Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
