'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Callout } from '@/components/ui/states';
import { formatMoney, todayISO } from '@/lib/format';
import {
  esquemaAnulacion,
  esquemaCobro,
  type DatosAnulacion,
  type DatosCobro,
} from '@/lib/validations/fees';
import type { ActionResult } from '@/lib/action-result';

export type OpcionMedio = { id: string; name: string; code?: string };
export type OpcionCaja = { id: string; name: string };

/**
 * Cobro de una cuota o de una matrícula.
 *
 * NO tiene campo de importe, y no es un olvido: el cobro es SIEMPRE por el total.
 * En este sistema no existe el pago parcial (la función de la base liquida por
 * el importe final de la cuota, sin excepción). Lo decimos explícito en pantalla
 * para que nadie lo busque.
 */
export function CobroDialog({
  titulo,
  alumno,
  concepto,
  importeCents,
  medios,
  cajas,
  onClose,
  onConfirm,
}: {
  titulo: string;
  alumno: string;
  concepto: string;
  importeCents: number;
  medios: OpcionMedio[];
  cajas: OpcionCaja[];
  onClose: () => void;
  onConfirm: (datos: DatosCobro) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosCobro>({
    resolver: zodResolver(esquemaCobro),
    defaultValues: {
      method_id: medios[0]?.id ?? '',
      cash_account_id: cajas[0]?.id ?? '',
      paid_at: todayISO(),
      external_reference: '',
      notes: '',
    },
  });

  async function onSubmit(datos: DatosCobro) {
    const r = await onConfirm(datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message ?? 'Cobro registrado');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={titulo}
      description={`${alumno} · ${concepto}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="cobro-form" type="submit" loading={isSubmitting}>
            Registrar cobro
          </Button>
        </>
      }
    >
      <form id="cobro-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Callout tone="info" title={`Se cobra el total: ${formatMoney(importeCents)}`}>
          El cobro es siempre por el importe completo. No se registran pagos parciales: si querés
          bajarle el importe, editalo antes de cobrar.
        </Callout>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Medio de pago"
            required
            autoFocus
            error={errors.method_id?.message}
            {...register('method_id')}
          >
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>

          <Select
            label="Entra a la caja"
            required
            error={errors.cash_account_id?.message}
            {...register('cash_account_id')}
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Fecha del pago"
          type="date"
          required
          error={errors.paid_at?.message}
          {...register('paid_at')}
        />

        <Input
          label="Número de operación"
          placeholder="Referencia de la transferencia, si tiene"
          hint="Opcional. Se imprime en el recibo."
          error={errors.external_reference?.message}
          {...register('external_reference')}
        />

        <Textarea
          label="Notas"
          rows={2}
          placeholder="Observaciones internas"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}

/**
 * Anulación de un pago YA registrado.
 *
 * Es irreversible y mueve plata: la base genera el movimiento de reverso en la
 * caja y devuelve la cuota a impaga. Por eso pedimos las dos cosas: el motivo
 * (queda asentado en el reverso) y que se escriba ANULAR.
 */
export function AnularPagoDialog({
  alumno,
  concepto,
  importeCents,
  onClose,
  onConfirm,
}: {
  alumno: string;
  concepto: string;
  importeCents: number;
  onClose: () => void;
  onConfirm: (datos: DatosAnulacion) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [confirmacion, setConfirmacion] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosAnulacion>({
    resolver: zodResolver(esquemaAnulacion),
    defaultValues: { motivo: '' },
  });

  const bloqueado = confirmacion.trim() !== 'ANULAR';

  async function onSubmit(datos: DatosAnulacion) {
    const r = await onConfirm(datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message ?? 'Pago anulado');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Anular el pago"
      description={`${alumno} · ${concepto}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            form="anular-form"
            type="submit"
            variant="danger"
            loading={isSubmitting}
            disabled={bloqueado}
          >
            Anular el pago
          </Button>
        </>
      }
    >
      <form id="anular-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Callout tone="danger" title={`Vas a dar de baja un cobro de ${formatMoney(importeCents)}`}>
          Se asienta un movimiento de reverso en la caja (el original no se borra: el libro mayor no
          se edita) y la cuota vuelve a quedar impaga.
        </Callout>

        <Textarea
          label="Motivo de la anulación"
          rows={3}
          required
          autoFocus
          placeholder="Por ejemplo: se cargó dos veces el mismo pago."
          hint="Queda registrado junto al reverso."
          error={errors.motivo?.message}
          {...register('motivo')}
        />

        <div>
          <label htmlFor="confirmar-anular" className="mb-1 block text-xs text-muted">
            Escribí <span className="font-semibold text-ink">ANULAR</span> para confirmar
          </label>
          <input
            id="confirmar-anular"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </form>
    </Dialog>
  );
}
