'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Power, Scale, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { TIPO_CAJA, opciones } from '@/lib/labels';
import { centsToPesos, formatMoney, pesosToCents, todayISO } from '@/lib/format';
import {
  esquemaAjusteCaja,
  esquemaCaja,
  type DatosAjusteCaja,
  type DatosCaja,
} from '@/lib/validations/cash';
import { ajustarSaldo, alternarCaja, eliminarCaja, guardarCaja } from '@/app/actions/cash';
import type { CajaConSaldo } from '@/lib/services/cash';

export function CajasClient({ cajas }: { cajas: CajaConSaldo[] }) {
  const router = useRouter();

  const [editando, setEditando] = useState<CajaConSaldo | null | undefined>(undefined); // undefined = cerrado
  const [ajustando, setAjustando] = useState<CajaConSaldo | null>(null);
  const [aEliminar, setAEliminar] = useState<CajaConSaldo | null>(null);

  // Cada saldo ya viene calculado de la vista `cash_account_balances`: acá solo
  // se suman los de las cajas activas para mostrar el total.
  const saldoTotal = cajas
    .filter((c) => c.is_active)
    .reduce((s, c) => s + Number(c.balance_cents), 0);

  async function cambiarEstado(caja: CajaConSaldo) {
    const r = await alternarCaja(caja.id, !caja.is_active);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  const columnas: ReadonlyArray<Column<CajaConSaldo>> = [
    {
      header: 'Caja',
      primary: true,
      render: (c) => (
        <div>
          <span>{c.name}</span>
          {c.description && <p className="text-xs font-normal text-muted">{c.description}</p>}
        </div>
      ),
    },
    {
      header: 'Tipo',
      render: (c) => TIPO_CAJA[c.type].label,
    },
    {
      header: 'Saldo inicial',
      desktopOnly: true,
      render: (c) => (
        <span className="tabular-nums text-muted">{formatMoney(c.initial_balance_cents)}</span>
      ),
    },
    {
      header: 'Saldo actual',
      render: (c) => (
        <span
          className={`font-semibold tabular-nums ${c.balance_cents < 0 ? 'text-danger' : 'text-ink'}`}
        >
          {formatMoney(c.balance_cents)}
        </span>
      ),
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
        title="Cajas"
        description="Dónde está la plata. El saldo no se escribe: sale del libro mayor (saldo inicial + movimientos)."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nueva caja
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Saldo total"
          value={formatMoney(saldoTotal)}
          hint="Suma de las cajas activas"
          tone={saldoTotal < 0 ? 'danger' : 'neutral'}
          icon={<Wallet className="size-4" />}
        />
        <StatCard label="Cajas activas" value={cajas.filter((c) => c.is_active).length} />
      </div>

      {cajas.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="Todavía no hay cajas"
          description="Creá al menos una (por ejemplo, «Efectivo») para poder registrar cobros y gastos."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nueva caja
            </Button>
          }
        />
      ) : (
        <DataList
          items={cajas}
          columns={columnas}
          keyOf={(c) => c.id}
          actions={(c) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setAjustando(c)}>
                <Scale className="size-3.5" aria-hidden />
                Ajustar saldo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cambiarEstado(c)}>
                <Power className="size-3.5" aria-hidden />
                {c.is_active ? 'Desactivar' : 'Activar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAEliminar(c)}>
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </>
          )}
        />
      )}

      {editando !== undefined && (
        <CajaForm caja={editando} onClose={() => setEditando(undefined)} />
      )}

      {ajustando && <AjusteSaldoDialog caja={ajustando} onClose={() => setAjustando(null)} />}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (!aEliminar) return;
          const r = await eliminarCaja(aEliminar.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Eliminar la caja"
        description={`Vas a eliminar «${aEliminar?.name}». Si tiene movimientos registrados, el sistema no la va a borrar: te va a sugerir desactivarla.`}
      />
    </div>
  );
}

function CajaForm({ caja, onClose }: { caja: CajaConSaldo | null; onClose: () => void }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosCaja>({
    resolver: zodResolver(esquemaCaja),
    defaultValues: caja
      ? {
          name: caja.name,
          description: caja.description ?? '',
          type: caja.type,
          saldo_inicial: centsToPesos(caja.initial_balance_cents),
          is_active: caja.is_active,
        }
      : {
          name: '',
          description: '',
          type: 'efectivo',
          saldo_inicial: 0,
          is_active: true,
        },
  });

  async function onSubmit(datos: DatosCaja) {
    const r = await guardarCaja(caja?.id ?? null, datos);
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
      title={caja ? 'Editar caja' : 'Nueva caja'}
      description="El saldo se calcula solo: es el saldo inicial más todos los movimientos."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="caja-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="caja-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Efectivo"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <Textarea
          label="Descripción"
          rows={2}
          placeholder="Caja física de la academia"
          error={errors.description?.message}
          {...register('description')}
        />

        <Select label="Tipo" required error={errors.type?.message} {...register('type')}>
          {opciones(TIPO_CAJA).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <MoneyInput
          label="Saldo inicial"
          required
          min={-99_999_999}
          readOnly={Boolean(caja)}
          className={caja ? 'bg-canvas text-muted' : undefined}
          hint={
            caja
              ? 'El saldo inicial de una caja en uso no se retoca: si hay una diferencia, asentá un ajuste.'
              : 'Cuánta plata había en esta caja el día que la creás.'
          }
          error={errors.saldo_inicial?.message}
          {...register('saldo_inicial', { valueAsNumber: true })}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_active')}
          />
          Caja activa
        </label>
      </form>
    </Dialog>
  );
}

/**
 * El saldo NO se edita: se asienta un movimiento de ajuste.
 *
 * Es la única forma honesta de corregir una diferencia: queda en el libro mayor,
 * con fecha, autor y motivo. Editar el saldo directamente sería borrar el rastro.
 */
function AjusteSaldoDialog({ caja, onClose }: { caja: CajaConSaldo; onClose: () => void }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DatosAjusteCaja>({
    resolver: zodResolver(esquemaAjusteCaja),
    defaultValues: {
      cash_account_id: caja.id,
      importe: 0,
      movement_date: todayISO(),
      description: '',
    },
  });

  const importe = useWatch({ control, name: 'importe' });
  const nuevoSaldo =
    caja.balance_cents + (Number.isFinite(importe) ? pesosToCents(importe) : 0);

  async function onSubmit(datos: DatosAjusteCaja) {
    const r = await ajustarSaldo(datos);
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
      title="Ajustar el saldo"
      description={caja.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="ajuste-caja-form" type="submit" loading={isSubmitting}>
            Asentar ajuste
          </Button>
        </>
      }
    >
      <form
        id="ajuste-caja-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-4"
      >
        <Callout tone="info" title="El saldo no se edita a mano">
          Se asienta un movimiento de ajuste en el libro mayor, con tu nombre y el motivo. Así el
          saldo sigue siendo el resultado de los movimientos y la diferencia queda explicada.
        </Callout>

        <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Saldo actual</span>
            <span className="tabular-nums text-ink">{formatMoney(caja.balance_cents)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
            <span className="text-ink">Queda en</span>
            <span className={`tabular-nums ${nuevoSaldo < 0 ? 'text-danger' : 'text-ink'}`}>
              {formatMoney(nuevoSaldo)}
            </span>
          </div>
        </div>

        <input type="hidden" {...register('cash_account_id')} />

        <MoneyInput
          label="Importe del ajuste"
          required
          min={-99_999_999}
          autoFocus
          hint="Negativo si en la caja hay menos plata de la que dice el sistema (por ejemplo −1500); positivo si hay de más."
          error={errors.importe?.message}
          {...register('importe', { valueAsNumber: true })}
        />

        <Input
          label="Fecha"
          type="date"
          required
          error={errors.movement_date?.message}
          {...register('movement_date')}
        />

        <Textarea
          label="Motivo del ajuste"
          rows={2}
          required
          placeholder="Por ejemplo: faltante de caja al cierre del día."
          error={errors.description?.message}
          {...register('description')}
        />
      </form>
    </Dialog>
  );
}
