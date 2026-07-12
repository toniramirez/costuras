'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Power, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { esquemaTarifa, type DatosTarifa } from '@/lib/validations/rates';
import { alternarTarifa, eliminarTarifa, guardarTarifa } from '@/app/actions/rates';
import type { TarifaConUso } from '@/lib/services/rates';
import { centsToPesos, formatDate, formatMoney } from '@/lib/format';

type Plan = { id: string; name: string; price_cents: number };

export function RatesClient({ tarifas, planes }: { tarifas: TarifaConUso[]; planes: Plan[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<TarifaConUso | null | undefined>(undefined); // undefined = cerrado
  const [aEliminar, setAEliminar] = useState<TarifaConUso | null>(null);

  const columnas: ReadonlyArray<Column<TarifaConUso>> = [
    {
      header: 'Tarifa',
      primary: true,
      render: (t) => (
        <div>
          <span>{t.name}</span>
          <p className="text-xs font-normal text-muted">
            {t.plans ? t.plans.name : 'Todas las modalidades'}
          </p>
        </div>
      ),
    },
    {
      header: 'Vigencia',
      render: (t) => <Vigencia desde={t.valid_from} hasta={t.valid_until} />,
    },
    {
      header: 'Importe',
      render: (t) => <span className="font-medium tabular-nums">{formatMoney(t.amount_cents)}</span>,
    },
    {
      header: 'Alumnos',
      render: (t) => <span className="tabular-nums">{t.alumnos}</span>,
    },
    {
      header: 'Estado',
      trailing: true,
      render: (t) =>
        t.is_active ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Inactiva</Badge>,
    },
  ];

  async function cambiarEstado(tarifa: TarifaConUso) {
    const r = await alternarTarifa(tarifa.id, !tarifa.is_active);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarTarifa(aEliminar.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Tarifas"
        description="El importe que se le cobra al alumno. Tiene prioridad sobre el precio base de la modalidad."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nueva tarifa
          </Button>
        }
      />

      <Callout tone="info" title="Los aumentos no son retroactivos">
        Cambiar el importe de una tarifa <strong>no modifica las cuotas ya emitidas</strong>: cada
        cuota guarda el importe con el que se emitió y queda congelado. El importe nuevo rige a
        partir de la próxima generación de cuotas.
      </Callout>

      <FiltersBar>
        <SearchInput placeholder="Buscar tarifa…" />
        <FilterSelect
          param="plan"
          label="Modalidad"
          allLabel="Todas las modalidades"
          options={planes.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          param="activa"
          label="Estado"
          allLabel="Todas"
          options={[
            { value: 'si', label: 'Activas' },
            { value: 'no', label: 'Inactivas' },
          ]}
        />
      </FiltersBar>

      {tarifas.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-5" />}
          title="Todavía no hay tarifas"
          description="Creá una (por ejemplo, «Marzo–Junio 2026») para asignársela a los alumnos. Sin tarifa, se cobra el precio base de la modalidad."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva tarifa
            </Button>
          }
        />
      ) : (
        <DataList
          items={tarifas}
          columns={columnas}
          keyOf={(t) => t.id}
          actions={(t) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditando(t)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cambiarEstado(t)}>
                <Power className="size-3.5" aria-hidden />
                {t.is_active ? 'Desactivar' : 'Activar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAEliminar(t)}
                aria-label="Eliminar tarifa"
              >
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </>
          )}
        />
      )}

      {editando !== undefined && (
        <RateForm tarifa={editando} planes={planes} onClose={() => setEditando(undefined)} />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar tarifa"
        description={`Vas a eliminar «${aEliminar?.name}». Si la usa algún alumno, el historial o alguna cuota emitida, el sistema no la va a borrar: te va a sugerir desactivarla.`}
      />
    </div>
  );
}

function Vigencia({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  if (!desde && !hasta) return <span className="text-muted">Sin límite</span>;
  if (desde && hasta) {
    return (
      <span className="whitespace-nowrap tabular-nums">
        {formatDate(desde)} – {formatDate(hasta)}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap tabular-nums">
      {desde ? `Desde ${formatDate(desde)}` : `Hasta ${formatDate(hasta)}`}
    </span>
  );
}

function RateForm({
  tarifa,
  planes,
  onClose,
}: {
  tarifa: TarifaConUso | null;
  planes: Plan[];
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosTarifa>({
    resolver: zodResolver(esquemaTarifa),
    defaultValues: tarifa
      ? {
          name: tarifa.name,
          plan_id: tarifa.plan_id ?? '',
          valid_from: tarifa.valid_from ?? '',
          valid_until: tarifa.valid_until ?? '',
          // El formulario trabaja en PESOS; la base guarda centavos.
          importe: centsToPesos(tarifa.amount_cents),
          is_active: tarifa.is_active,
          notes: tarifa.notes ?? '',
        }
      : {
          name: '',
          plan_id: '',
          valid_from: '',
          valid_until: '',
          importe: 0,
          is_active: true,
          notes: '',
        },
  });

  async function onSubmit(datos: DatosTarifa) {
    const r = await guardarTarifa(tarifa?.id ?? null, datos);
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
      title={tarifa ? 'Editar tarifa' : 'Nueva tarifa'}
      description="Las cuotas ya emitidas conservan su importe: cambiar esto solo afecta a las que se generen de acá en adelante."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="tarifa-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="tarifa-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Marzo–Junio 2026"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <Select
          label="Modalidad"
          hint="Dejala vacía si la tarifa sirve para cualquier modalidad."
          error={errors.plan_id?.message}
          {...register('plan_id')}
        >
          <option value="">Todas las modalidades</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Vigente desde"
            type="date"
            error={errors.valid_from?.message}
            {...register('valid_from')}
          />
          <Input
            label="Vigente hasta"
            type="date"
            error={errors.valid_until?.message}
            {...register('valid_until')}
          />
        </div>

        <MoneyInput
          label="Importe mensual"
          required
          hint="En pesos. Es lo que se le cobra al alumno que tenga esta tarifa."
          error={errors.importe?.message}
          // valueAsNumber: RHF entrega un número, no un string. Es lo que hace
          // que z.number() encaje sin necesidad de z.coerce.
          {...register('importe', { valueAsNumber: true })}
        />

        <Textarea
          label="Observaciones"
          rows={2}
          error={errors.notes?.message}
          {...register('notes')}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_active')}
          />
          Tarifa activa
        </label>
      </form>
    </Dialog>
  );
}
