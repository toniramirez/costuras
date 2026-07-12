'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Power, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { esquemaCategoria, type DatosCategoria } from '@/lib/validations/movements';
import {
  alternarCategoria,
  eliminarCategoria,
  guardarCategoria,
} from '@/app/actions/movements';
import type { Categoria } from '@/lib/services/movements';
import { TabsMovimientos } from '../tabs';

export function CategoriasClient({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter();

  const [editando, setEditando] = useState<Categoria | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);

  async function cambiarEstado(c: Categoria) {
    const r = await alternarCategoria(c.id, !c.is_active);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  const columnas: ReadonlyArray<Column<Categoria>> = [
    {
      header: 'Categoría',
      primary: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span>{c.name}</span>
          {c.is_system && <Badge tone="info">Del sistema</Badge>}
        </div>
      ),
    },
    {
      header: 'Tipo',
      render: (c) =>
        c.kind === 'ingreso' ? (
          <Badge tone="success">Ingreso</Badge>
        ) : (
          <Badge tone="danger">Gasto</Badge>
        ),
    },
    {
      header: 'Orden',
      desktopOnly: true,
      render: (c) => <span className="tabular-nums text-muted">{c.sort_order}</span>,
    },
    {
      header: 'Estado',
      trailing: true,
      render: (c) =>
        c.is_active ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Inactiva</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Categorías"
        description="Con qué se clasifican los ingresos y los gastos. Las del sistema las usan los cobros automáticos."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nueva categoría
          </Button>
        }
      />

      <TabsMovimientos />

      <FiltersBar>
        <FilterSelect
          param="kind"
          label="Tipo"
          allLabel="Todas"
          options={[
            { value: 'ingreso', label: 'De ingreso' },
            { value: 'gasto', label: 'De gasto' },
          ]}
        />
      </FiltersBar>

      {categorias.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-5" />}
          title="No hay categorías con ese filtro"
          description="Creá las que necesites para ordenar los gastos: alquiler, servicios, materiales…"
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva categoría
            </Button>
          }
        />
      ) : (
        <DataList
          items={categorias}
          columns={columnas}
          keyOf={(c) => c.id}
          actions={(c) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cambiarEstado(c)}>
                <Power className="size-3.5" aria-hidden />
                {c.is_active ? 'Desactivar' : 'Activar'}
              </Button>
              {/* Las del sistema no se borran: no mostramos un botón que no va a funcionar. */}
              {!c.is_system && (
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(c)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              )}
            </>
          )}
        />
      )}

      {editando !== undefined && (
        <CategoriaForm categoria={editando} onClose={() => setEditando(undefined)} />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (!aEliminar) return;
          const r = await eliminarCategoria(aEliminar.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Eliminar la categoría"
        description={`Vas a eliminar «${aEliminar?.name}». Si ya tiene movimientos, el sistema no la va a borrar: te va a sugerir desactivarla.`}
      />
    </div>
  );
}

function CategoriaForm({
  categoria,
  onClose,
}: {
  categoria: Categoria | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosCategoria>({
    resolver: zodResolver(esquemaCategoria),
    defaultValues: categoria
      ? {
          name: categoria.name,
          kind: categoria.kind,
          sort_order: categoria.sort_order,
          is_active: categoria.is_active,
        }
      : { name: '', kind: 'gasto', sort_order: 0, is_active: true },
  });

  async function onSubmit(datos: DatosCategoria) {
    const r = await guardarCategoria(categoria?.id ?? null, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={categoria ? 'Editar categoría' : 'Nueva categoría'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="categoria-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="categoria-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Materiales"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Tipo" required error={errors.kind?.message} {...register('kind')}>
            <option value="ingreso">De ingreso</option>
            <option value="gasto">De gasto</option>
          </Select>

          <Input
            label="Orden"
            type="number"
            min={0}
            required
            hint="Para ordenar la lista."
            error={errors.sort_order?.message}
            {...register('sort_order', { valueAsNumber: true })}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_active')}
          />
          Categoría activa
        </label>
      </form>
    </Dialog>
  );
}
