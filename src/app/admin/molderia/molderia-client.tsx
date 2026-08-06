'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, FolderTree, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { CategoriasDialog } from '@/components/library/categorias-dialog';
import { eliminarMolde } from '@/app/actions/library';
import type { Categoria, MoldeConArchivos } from '@/lib/services/library';
import type { LimitesArchivo } from '@/lib/storage';
import { MoldeForm } from './molde-form';

/** Peso legible del archivo. Un molde de 40 MB no se descarga con datos móviles. */
function peso(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

export function MolderiaClient({
  moldes,
  total,
  categorias,
  uso,
  limites,
}: {
  moldes: MoldeConArchivos[];
  total: number;
  categorias: Categoria[];
  uso: Record<string, number>;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editando, setEditando] = useState<MoldeConArchivos | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<MoldeConArchivos | null>(null);
  const [viendoCategorias, setViendoCategorias] = useState(false);

  const hayFiltros = Array.from(searchParams.keys()).some((k) => k !== 'pagina');

  const columnas: ReadonlyArray<Column<MoldeConArchivos>> = [
    {
      header: 'Molde',
      primary: true,
      render: (m) => (
        <div className="flex items-center gap-3">
          {m.portadaUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
            <img
              src={m.portadaUrl}
              alt=""
              className="hidden size-10 shrink-0 rounded-lg object-cover lg:block"
            />
          )}
          <div className="min-w-0">
            <span>{m.title}</span>
            {m.description && (
              <p className="truncate text-xs font-normal text-muted">{m.description}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Categoría',
      render: (m) => (
        <span className={m.categoria ? 'text-ink' : 'text-muted'}>
          {m.categoria?.name ?? 'Sin categoría'}
        </span>
      ),
    },
    {
      header: 'PDF',
      render: (m) =>
        m.pdfUrl ? (
          <a
            href={m.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            {peso(m.size_bytes)}
          </a>
        ) : (
          <span className="text-xs font-medium text-warning">Falta subirlo</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (m) =>
        m.is_published ? (
          <Badge tone="success">Publicado</Badge>
        ) : (
          <Badge tone="neutral">Borrador</Badge>
        ),
    },
  ];

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarMolde(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Moldería digital"
        description="Moldes en PDF que las alumnas abren y descargan desde su perfil."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setViendoCategorias(true)}>
              <FolderTree className="size-4" aria-hidden />
              Categorías
            </Button>
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo molde
            </Button>
          </div>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar por nombre o descripción…" />
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

      {moldes.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            icon={<Ruler className="size-5" />}
            title="No hay moldes con esos filtros"
            description="Probá con otra categoría o limpiá la búsqueda."
          />
        ) : (
          <EmptyState
            icon={<Ruler className="size-5" />}
            title="Todavía no cargaste ningún molde"
            description="Subí el PDF, ponele un nombre y, si querés, una foto de la prenda terminada."
            action={
              <Button onClick={() => setEditando(null)}>
                <Plus className="size-4" aria-hidden />
                Nuevo molde
              </Button>
            }
          />
        )
      ) : (
        <>
          <DataList
            items={moldes}
            columns={columnas}
            keyOf={(m) => m.id}
            actions={(m) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAEliminar(m)}
                  aria-label={`Eliminar ${m.title}`}
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
        <MoldeForm
          molde={editando}
          categorias={categorias}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      {viendoCategorias && (
        <CategoriasDialog
          scope="molderia"
          categorias={categorias}
          uso={uso}
          onClose={() => setViendoCategorias(false)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar molde"
        description={`Vas a eliminar «${aEliminar?.title ?? ''}», su PDF y su portada. Las alumnas dejan de verlo. Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
