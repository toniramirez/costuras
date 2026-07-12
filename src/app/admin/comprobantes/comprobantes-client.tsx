'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Check, ExternalLink, Inbox, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { ESTADO_COMPROBANTE } from '@/lib/labels';
import { formatDateTime, formatMoney, formatPeriod } from '@/lib/format';
import {
  esquemaAprobacion,
  esquemaRechazo,
  type DatosAprobacion,
  type DatosRechazo,
} from '@/lib/validations/fees';
import { aprobarComprobante, rechazarComprobante } from '@/app/actions/fees';
import type { FilaComprobante } from '@/lib/services/fees';
import type { OpcionCaja, OpcionMedio } from '../cuotas/pago-dialogs';

/** El importe que la academia esperaba cobrar por esa cuota o matrícula. */
const importeEsperado = (p: FilaComprobante): number | null =>
  p.monthly_fees?.final_amount_cents ?? p.registration_fees?.amount_cents ?? null;

const conceptoDe = (p: FilaComprobante): string =>
  p.monthly_fees
    ? `Cuota ${formatPeriod(p.monthly_fees.period_year, p.monthly_fees.period_month)}`
    : 'Matrícula';

const nombreDe = (p: FilaComprobante) =>
  `${p.students?.first_name ?? ''} ${p.students?.last_name ?? ''}`.trim() || 'Alumno';

/** ¿El alumno informó un importe distinto al de la cuota? */
function noCoincide(p: FilaComprobante): boolean {
  const esperado = importeEsperado(p);
  return (
    p.informed_amount_cents !== null &&
    esperado !== null &&
    Number(p.informed_amount_cents) !== Number(esperado)
  );
}

export function ComprobantesClient({
  comprobantes,
  total,
  pendientes,
  estado,
  medios,
  cajas,
}: {
  comprobantes: FilaComprobante[];
  total: number;
  pendientes: number;
  estado: string;
  medios: OpcionMedio[];
  cajas: OpcionCaja[];
}) {
  const [aAprobar, setAAprobar] = useState<FilaComprobante | null>(null);
  const [aRechazar, setARechazar] = useState<FilaComprobante | null>(null);

  const sinCajas = cajas.length === 0;

  const columnas: ReadonlyArray<Column<FilaComprobante>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (p) => (
        <div>
          <span>{nombreDe(p)}</span>
          <p className="text-xs font-normal text-muted">{conceptoDe(p)}</p>
        </div>
      ),
    },
    {
      header: 'Informó',
      render: (p) => (
        <div>
          <span className="font-medium tabular-nums">
            {p.informed_amount_cents === null ? '—' : formatMoney(p.informed_amount_cents)}
          </span>
          {noCoincide(p) && (
            <p className="flex items-center gap-1 text-xs font-normal text-danger">
              <AlertTriangle className="size-3" aria-hidden />
              No coincide
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Debe pagar',
      render: (p) => {
        const esperado = importeEsperado(p);
        return (
          <span className="tabular-nums text-muted">
            {esperado === null ? '—' : formatMoney(esperado)}
          </span>
        );
      },
    },
    {
      header: 'Referencia',
      desktopOnly: true,
      render: (p) => <span className="text-muted">{p.reference || '—'}</span>,
    },
    {
      header: 'Subido',
      render: (p) => formatDateTime(p.uploaded_at),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (p) => <StatusBadge value={p.status} map={ESTADO_COMPROBANTE} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Comprobantes"
        description="Los comprobantes de transferencia que suben los alumnos. Hasta que no se aprueban, no entra plata a ninguna caja."
      />

      {sinCajas && (
        <Callout tone="warning" title="No hay cajas activas">
          Para aprobar un comprobante hay que elegir a qué caja entra el dinero. Creá una primero.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="A revisar"
          value={pendientes}
          hint="Esperando tu decisión"
          tone={pendientes > 0 ? 'warning' : 'neutral'}
        />
        <StatCard label="En esta vista" value={total} />
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar por alumno…" />
        <EstadoSelect estado={estado} />
      </FiltersBar>

      {comprobantes.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={
            estado === 'pendiente'
              ? 'No hay comprobantes para revisar'
              : 'No hay comprobantes con ese filtro'
          }
          description="Cuando un alumno suba el comprobante de una transferencia, te va a aparecer acá."
        />
      ) : (
        <>
          <DataList
            items={comprobantes}
            columns={columnas}
            keyOf={(p) => p.id}
            actions={(p) => (
              <>
                {p.archivoUrl ? (
                  <a
                    href={p.archivoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink hover:bg-line/40"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Ver comprobante
                  </a>
                ) : (
                  <Badge tone="neutral">Archivo no disponible</Badge>
                )}

                {p.status === 'pendiente' && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sinCajas}
                      onClick={() => setAAprobar(p)}
                    >
                      <Check className="size-3.5 text-success" aria-hidden />
                      Aprobar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setARechazar(p)}>
                      <X className="size-3.5 text-danger" aria-hidden />
                      Rechazar
                    </Button>
                  </>
                )}

                {p.status === 'rechazado' && p.rejection_reason && (
                  <span className="text-xs text-muted">Motivo: {p.rejection_reason}</span>
                )}
              </>
            )}
          />
          <Pagination total={total} />
        </>
      )}

      {aAprobar && (
        <AprobarDialog
          comprobante={aAprobar}
          medios={medios}
          cajas={cajas}
          onClose={() => setAAprobar(null)}
        />
      )}

      {aRechazar && (
        <RechazarDialog comprobante={aRechazar} onClose={() => setARechazar(null)} />
      )}
    </div>
  );
}

/**
 * La bandeja arranca en «a revisar»: es para lo que se entra a esta pantalla.
 * Por eso el estado siempre tiene valor y no usa la opción «Todos» de FilterSelect
 * (que borraría el parámetro y volvería al valor por defecto).
 */
function EstadoSelect({ estado }: { estado: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const cambiar = (valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('estado', valor);
    params.delete('pagina');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <select
      value={estado}
      onChange={(e) => cambiar(e.target.value)}
      aria-label="Estado"
      className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    >
      <option value="pendiente">A revisar</option>
      <option value="aprobado">Aprobados</option>
      <option value="rechazado">Rechazados</option>
      <option value="todos">Todos</option>
    </select>
  );
}

function AprobarDialog({
  comprobante,
  medios,
  cajas,
  onClose,
}: {
  comprobante: FilaComprobante;
  medios: OpcionMedio[];
  cajas: OpcionCaja[];
  onClose: () => void;
}) {
  const router = useRouter();
  const esperado = importeEsperado(comprobante);

  // Un comprobante es, casi siempre, una transferencia: la preseleccionamos.
  const transferencia = medios.find((m) => m.code === 'transferencia') ?? medios[0];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosAprobacion>({
    resolver: zodResolver(esquemaAprobacion),
    defaultValues: {
      cash_account_id: cajas[0]?.id ?? '',
      method_id: transferencia?.id ?? '',
    },
  });

  async function onSubmit(datos: DatosAprobacion) {
    const r = await aprobarComprobante(comprobante.id, datos);
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
      title="Aprobar el comprobante"
      description={`${nombreDe(comprobante)} · ${conceptoDe(comprobante)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="aprobar-form" type="submit" loading={isSubmitting}>
            Aprobar y cobrar
          </Button>
        </>
      }
    >
      <form id="aprobar-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {noCoincide(comprobante) ? (
          <Callout tone="danger" title="Los importes no coinciden">
            El alumno informó {formatMoney(comprobante.informed_amount_cents)} y la cuota es de{' '}
            {formatMoney(esperado)}. Si aprobás, se registra el cobro por el importe de la cuota
            ({formatMoney(esperado)}): no existe el pago parcial. Revisá el comprobante antes de
            seguir.
          </Callout>
        ) : (
          <Callout tone="info" title={`Se cobra ${formatMoney(esperado)}`}>
            Se registra el pago completo, se emite el recibo y el importe entra a la caja que elijas.
          </Callout>
        )}

        {comprobante.note && (
          <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-muted">
            <span className="font-medium text-ink">Nota del alumno:</span> {comprobante.note}
          </p>
        )}

        <Select
          label="Entra a la caja"
          required
          autoFocus
          error={errors.cash_account_id?.message}
          {...register('cash_account_id')}
        >
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          label="Medio de pago"
          required
          error={errors.method_id?.message}
          {...register('method_id')}
        >
          {medios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </form>
    </Dialog>
  );
}

function RechazarDialog({
  comprobante,
  onClose,
}: {
  comprobante: FilaComprobante;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRechazo>({
    resolver: zodResolver(esquemaRechazo),
    defaultValues: { motivo: '' },
  });

  async function onSubmit(datos: DatosRechazo) {
    const r = await rechazarComprobante(comprobante.id, datos);
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
      title="Rechazar el comprobante"
      description={`${nombreDe(comprobante)} · ${conceptoDe(comprobante)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="rechazar-form" type="submit" variant="danger" loading={isSubmitting}>
            Rechazar
          </Button>
        </>
      }
    >
      <form id="rechazar-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Callout tone="warning">
          La cuota vuelve a quedar impaga y el alumno recibe una notificación con el motivo que
          escribas acá.
        </Callout>

        <Textarea
          label="Motivo del rechazo"
          rows={3}
          required
          autoFocus
          placeholder="Por ejemplo: el comprobante no se lee, o el importe transferido no coincide."
          error={errors.motivo?.message}
          {...register('motivo')}
        />
      </form>
    </Dialog>
  );
}
