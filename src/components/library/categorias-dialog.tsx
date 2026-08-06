'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/field';
import { guardarCategoria, eliminarCategoria } from '@/app/actions/library';
import { esquemaCategoria, type DatosCategoria } from '@/lib/validations/library';
import type { Categoria } from '@/lib/services/library';
import type { Enums } from '@/lib/supabase/database.types';

/**
 * Alta, edición y baja de categorías, sin salir de la pantalla donde se carga el
 * material.
 *
 * Es a propósito que NO sea una pantalla aparte: crear una sección es algo que
 * se necesita justo cuando se está publicando algo que no entra en ninguna de
 * las que hay. Mandar a la persona a otro lado, crear la categoría y hacerla
 * volver a empezar el formulario es la forma más rápida de que termine tirando
 * todo en «Otros».
 */
export function CategoriasDialog({
  scope,
  categorias,
  uso,
  onClose,
}: {
  scope: Enums<'library_scope'>;
  categorias: Categoria[];
  /** Cuánto material cuelga de cada categoría (para avisar antes de borrarla). */
  uso: Record<string, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Categoria | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarCategoria(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  const cantidad = aEliminar ? (uso[aEliminar.id] ?? 0) : 0;

  return (
    <>
      <Dialog
        open={editando === undefined}
        onClose={onClose}
        title="Categorías"
        description="Son las secciones en las que las alumnas van a encontrar el material. Podés agregar las que quieras."
        className="max-w-lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva categoría
            </Button>
          </>
        }
      >
        {categorias.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-canvas/60 px-4 py-6 text-center text-sm text-muted">
            Todavía no hay categorías. Creá la primera y empezá a ordenar el material.
          </p>
        ) : (
          <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto">
            {categorias.map((categoria) => (
              <li key={categoria.id} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{categoria.name}</p>
                  {categoria.description && (
                    <p className="mt-0.5 text-xs text-muted">{categoria.description}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    Orden {categoria.sort_order} · {uso[categoria.id] ?? 0} publicación(es)
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditando(categoria)}
                    aria-label={`Editar ${categoria.name}`}
                    className="rounded-lg p-2 text-muted hover:bg-line/40 hover:text-ink"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAEliminar(categoria)}
                    aria-label={`Eliminar ${categoria.name}`}
                    className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {editando !== undefined && (
        <CategoriaForm
          scope={scope}
          categoria={editando}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title={`Eliminar «${aEliminar?.name ?? ''}»`}
        description={
          cantidad > 0
            ? `Esta categoría tiene ${cantidad} publicación(es). No se borran: quedan sin categoría y las vas a poder reubicar.`
            : 'La categoría está vacía. Se elimina y listo.'
        }
      />
    </>
  );
}

function CategoriaForm({
  scope,
  categoria,
  onClose,
}: {
  scope: Enums<'library_scope'>;
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
    defaultValues: {
      scope,
      name: categoria?.name ?? '',
      description: categoria?.description ?? '',
      // Cada categoría nueva va al final: reordenar es más fácil que descubrir
      // que la última que cargaste se metió primera.
      sort_order: categoria?.sort_order ?? 100,
    },
  });

  async function onSubmit(datos: DatosCategoria) {
    const r = await guardarCategoria(categoria?.id ?? null, { ...datos, scope });
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
            <X className="size-4" aria-hidden />
            Cancelar
          </Button>
          <Button form="categoria-form" type="submit" loading={isSubmitting}>
            <Check className="size-4" aria-hidden />
            Guardar
          </Button>
        </>
      }
    >
      <form id="categoria-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Máquinas y herramientas"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />
        <Textarea
          label="Descripción (opcional)"
          rows={2}
          placeholder="Una línea que explique qué va a encontrar la alumna acá."
          error={errors.description?.message}
          {...register('description')}
        />
        <Input
          label="Orden"
          type="number"
          min={0}
          hint="Las categorías se muestran de menor a mayor."
          error={errors.sort_order?.message}
          {...register('sort_order', { valueAsNumber: true })}
        />
      </form>
    </Dialog>
  );
}
