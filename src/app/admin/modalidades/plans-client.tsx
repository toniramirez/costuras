'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layers, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { esquemaPlan, type DatosPlan } from '@/lib/validations/plans';
import { guardarPlan, alternarPlan, eliminarPlan } from '@/app/actions/plans';
import type { Plan } from '@/lib/services/plans';
import { FRECUENCIA_PLAN, opciones } from '@/lib/labels';
import { centsToPesos, formatMoney } from '@/lib/format';

export function PlansClient({ planes }: { planes: Plan[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Plan | null | undefined>(undefined); // undefined = cerrado
  const [aEliminar, setAEliminar] = useState<Plan | null>(null);

  const columnas: ReadonlyArray<Column<Plan>> = [
    {
      header: 'Modalidad',
      primary: true,
      render: (p) => (
        <div>
          <span>{p.name}</span>
          {p.description && <p className="text-xs font-normal text-muted">{p.description}</p>}
        </div>
      ),
    },
    {
      header: 'Clases',
      render: (p) => `${p.classes_included} · ${FRECUENCIA_PLAN[p.frequency].label}`,
    },
    {
      header: 'Precio base',
      render: (p) => (
        <span className="font-medium tabular-nums">{formatMoney(p.price_cents)}</span>
      ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (p) =>
        p.is_active ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Inactiva</Badge>,
    },
  ];

  async function cambiarEstado(plan: Plan) {
    const r = await alternarPlan(plan.id, !plan.is_active);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarPlan(aEliminar.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Modalidades"
        description="Los planes de cursada. El precio base se usa cuando el alumno no tiene una tarifa asignada."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nueva modalidad
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar modalidad…" />
        <FilterSelect
          param="activo"
          label="Estado"
          allLabel="Todas"
          options={[
            { value: 'si', label: 'Activas' },
            { value: 'no', label: 'Inactivas' },
          ]}
        />
      </FiltersBar>

      {planes.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="Todavía no hay modalidades"
          description="Creá al menos una (por ejemplo, «1 clase semanal») para poder asignársela a los alumnos."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva modalidad
            </Button>
          }
        />
      ) : (
        <DataList
          items={planes}
          columns={columnas}
          keyOf={(p) => p.id}
          actions={(p) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cambiarEstado(p)}>
                <Power className="size-3.5" aria-hidden />
                {p.is_active ? 'Desactivar' : 'Activar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAEliminar(p)}>
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </>
          )}
        />
      )}

      {editando !== undefined && (
        <PlanForm plan={editando} onClose={() => setEditando(undefined)} />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar modalidad"
        description={`Vas a eliminar «${aEliminar?.name}». Si tiene alumnos, grupos o tarifas asociados, el sistema no la va a borrar: te va a sugerir desactivarla.`}
      />
    </div>
  );
}

function PlanForm({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosPlan>({
    resolver: zodResolver(esquemaPlan),
    defaultValues: plan
      ? {
          name: plan.name,
          description: plan.description ?? '',
          classes_included: plan.classes_included,
          frequency: plan.frequency,
          precio: centsToPesos(plan.price_cents),
          is_active: plan.is_active,
        }
      : {
          name: '',
          description: '',
          classes_included: 1,
          frequency: 'semanal',
          precio: 0,
          is_active: true,
        },
  });

  async function onSubmit(datos: DatosPlan) {
    const r = await guardarPlan(plan?.id ?? null, datos);
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
      title={plan ? 'Editar modalidad' : 'Nueva modalidad'}
      description="El precio base se aplica si el alumno no tiene una tarifa específica."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="plan-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="1 clase semanal"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <Textarea
          label="Descripción"
          rows={2}
          placeholder="Una clase por semana de 2 horas"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Clases incluidas"
            type="number"
            min={0}
            required
            error={errors.classes_included?.message}
            // valueAsNumber: RHF entrega un número, no un string. Es lo que hace
            // que z.number() encaje sin necesidad de z.coerce.
            {...register('classes_included', { valueAsNumber: true })}
          />
          <Select label="Frecuencia" required error={errors.frequency?.message} {...register('frequency')}>
            {opciones(FRECUENCIA_PLAN).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <MoneyInput
          label="Precio base mensual"
          required
          hint="En pesos. La tarifa asignada al alumno tiene prioridad sobre este valor."
          error={errors.precio?.message}
          {...register('precio', { valueAsNumber: true })}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_active')}
          />
          Modalidad activa
        </label>
      </form>
    </Dialog>
  );
}
