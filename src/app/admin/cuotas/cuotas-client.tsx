'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Ban,
  CalendarClock,
  FileText,
  Gift,
  Pencil,
  Receipt,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { MoneyInput, Select, Textarea } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { ESTADO_CUOTA, opciones } from '@/lib/labels';
import { MESES, centsToPesos, formatDate, formatMoney, formatPeriod, pesosToCents } from '@/lib/format';
import {
  esquemaAjusteCuota,
  esquemaPeriodo,
  type DatosAjusteCuota,
  type DatosPeriodo,
} from '@/lib/validations/fees';
import {
  ajustarImporteCuota,
  anularCuota,
  anularPago,
  bonificarCuota,
  cobrarCuota,
  generarCuotas,
  marcarVencidas,
} from '@/app/actions/fees';
import type { FilaCuota, MetricasCuotas } from '@/lib/services/fees';
import { AnularPagoDialog, CobroDialog, type OpcionCaja, type OpcionMedio } from './pago-dialogs';
import { TabsCuotas } from './tabs';

const IMPAGAS = ['pendiente', 'comprobante_pendiente', 'vencida'] as const;

const nombreDe = (c: FilaCuota) =>
  `${c.students?.first_name ?? ''} ${c.students?.last_name ?? ''}`.trim() || 'Alumno';

export function CuotasClient({
  cuotas,
  total,
  metricas,
  anio,
  mes,
  anios,
  grupos,
  medios,
  cajas,
}: {
  cuotas: FilaCuota[];
  total: number;
  metricas: MetricasCuotas;
  anio: number;
  mes: number;
  anios: number[];
  grupos: Array<{ id: string; name: string }>;
  medios: OpcionMedio[];
  cajas: OpcionCaja[];
}) {
  const router = useRouter();

  const [generando, setGenerando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [aCobrar, setACobrar] = useState<FilaCuota | null>(null);
  const [aAjustar, setAAjustar] = useState<FilaCuota | null>(null);
  const [aAnular, setAAnular] = useState<FilaCuota | null>(null);
  const [aBonificar, setABonificar] = useState<FilaCuota | null>(null);
  const [aAnularPago, setAAnularPago] = useState<FilaCuota | null>(null);

  const sinCobranza = medios.length === 0 || cajas.length === 0;

  async function correrVencidas() {
    setMarcando(true);
    const r = await marcarVencidas();
    setMarcando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.data.marcadas === 0
        ? 'No había cuotas para marcar como vencidas.'
        : `Se marcaron ${r.data.marcadas} cuota(s) como vencidas.`,
    );
    router.refresh();
  }

  const columnas: ReadonlyArray<Column<FilaCuota>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (c) => (
        <div>
          <span>{nombreDe(c)}</span>
          <p className="text-xs font-normal text-muted">
            {c.students?.groups?.name ?? 'Sin grupo'}
          </p>
        </div>
      ),
    },
    {
      header: 'Período',
      render: (c) => formatPeriod(c.period_year, c.period_month),
    },
    {
      header: 'Vence',
      render: (c) => formatDate(c.due_date),
    },
    {
      header: 'Importe',
      render: (c) => (
        <div>
          <span className="font-medium tabular-nums">{formatMoney(c.final_amount_cents)}</span>
          {c.manual_adjustment_cents !== 0 && (
            <p className="text-xs font-normal text-muted tabular-nums">
              {formatMoney(c.base_amount_cents)}{' '}
              {c.manual_adjustment_cents < 0 ? '−' : '+'}{' '}
              {formatMoney(Math.abs(c.manual_adjustment_cents))}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Recibo',
      desktopOnly: true,
      render: (c) =>
        c.receipt_id ? (
          <a
            href={`/api/recibos/${c.receipt_id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <FileText className="size-3.5" aria-hidden />
            {c.receipt_number ?? 'Ver'}
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (c) => <StatusBadge value={c.status} map={ESTADO_CUOTA} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Cuotas"
        description="Las cuotas del mes: se generan, se cobran por el total y se anulan con reverso. Nunca se cobra a medias."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={correrVencidas} loading={marcando}>
              <CalendarClock className="size-4" aria-hidden />
              Marcar vencidas
            </Button>
            <Button onClick={() => setGenerando(true)}>
              <Receipt className="size-4" aria-hidden />
              Generar cuotas del mes
            </Button>
          </div>
        }
      />

      <TabsCuotas />

      {sinCobranza && (
        <Callout tone="warning" title="Todavía no se puede cobrar">
          Para registrar un cobro hace falta al menos una{' '}
          <Link href="/admin/cajas" className="font-semibold underline">
            caja activa
          </Link>{' '}
          y un medio de pago activo.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Emitidas" value={metricas.emitidas} hint={formatPeriod(anio, mes)} />
        <StatCard label="Pagadas" value={metricas.pagadas} tone="success" />
        <StatCard label="Pendientes" value={metricas.pendientes} tone="warning" />
        <StatCard label="Vencidas" value={metricas.vencidas} tone="danger" />
        <StatCard
          label="Total por cobrar"
          value={formatMoney(metricas.totalPorCobrar)}
          hint="Todo lo emitido que sigue impago"
          tone={metricas.totalPorCobrar > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar por alumno…" />
        <PeriodoSelect anio={anio} mes={mes} anios={anios} />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={[
            { value: 'deudores', label: 'Deudores (todo lo impago)' },
            ...opciones(ESTADO_CUOTA),
          ]}
        />
        <FilterSelect
          param="grupo"
          label="Grupo"
          allLabel="Todos los grupos"
          options={[
            ...grupos.map((g) => ({ value: g.id, label: g.name })),
            { value: 'sin', label: 'Sin grupo' },
          ]}
        />
      </FiltersBar>

      {cuotas.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title="No hay cuotas con esos filtros"
          description={`Si todavía no generaste las cuotas de ${formatPeriod(anio, mes)}, hacelo con el botón «Generar cuotas del mes». Es idempotente: si ya existen, no las duplica.`}
          action={
            <Button onClick={() => setGenerando(true)}>
              <Receipt className="size-4" aria-hidden />
              Generar cuotas del mes
            </Button>
          }
        />
      ) : (
        <>
          <DataList
            items={cuotas}
            columns={columnas}
            keyOf={(c) => c.id}
            actions={(c) => {
              const impaga = (IMPAGAS as readonly string[]).includes(c.status);

              return (
                <>
                  {impaga && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sinCobranza}
                      onClick={() => setACobrar(c)}
                    >
                      <Wallet className="size-3.5" aria-hidden />
                      Cobrar
                    </Button>
                  )}

                  {impaga && (
                    <Button size="sm" variant="ghost" onClick={() => setAAjustar(c)}>
                      <Pencil className="size-3.5" aria-hidden />
                      Importe
                    </Button>
                  )}

                  {c.status === 'comprobante_pendiente' && (
                    <Link
                      href="/admin/comprobantes"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink hover:bg-line/40"
                    >
                      <FileText className="size-3.5" aria-hidden />
                      Revisar comprobante
                    </Link>
                  )}

                  {impaga && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setABonificar(c)}>
                        <Gift className="size-3.5" aria-hidden />
                        Bonificar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAAnular(c)}>
                        <Ban className="size-3.5 text-danger" aria-hidden />
                        Anular
                      </Button>
                    </>
                  )}

                  {c.status === 'pagada' && c.payment_id && (
                    <Button size="sm" variant="ghost" onClick={() => setAAnularPago(c)}>
                      <RotateCcw className="size-3.5 text-danger" aria-hidden />
                      Anular pago
                    </Button>
                  )}
                </>
              );
            }}
          />
          <Pagination total={total} />
        </>
      )}

      {generando && (
        <GenerarCuotasDialog anio={anio} mes={mes} onClose={() => setGenerando(false)} />
      )}

      {aCobrar && (
        <CobroDialog
          titulo="Registrar cobro de la cuota"
          alumno={nombreDe(aCobrar)}
          concepto={`Cuota ${formatPeriod(aCobrar.period_year, aCobrar.period_month)}`}
          importeCents={aCobrar.final_amount_cents}
          medios={medios}
          cajas={cajas}
          onClose={() => setACobrar(null)}
          onConfirm={(datos) => cobrarCuota(aCobrar.id, datos)}
        />
      )}

      {aAjustar && <AjusteDialog cuota={aAjustar} onClose={() => setAAjustar(null)} />}

      {aAnularPago && aAnularPago.payment_id && (
        <AnularPagoDialog
          alumno={nombreDe(aAnularPago)}
          concepto={`Cuota ${formatPeriod(aAnularPago.period_year, aAnularPago.period_month)}`}
          importeCents={aAnularPago.final_amount_cents}
          onClose={() => setAAnularPago(null)}
          onConfirm={(datos) => anularPago(aAnularPago.payment_id!, datos)}
        />
      )}

      <ConfirmDialog
        open={aAnular !== null}
        onClose={() => setAAnular(null)}
        onConfirm={async () => {
          if (!aAnular) return;
          const r = await anularCuota(aAnular.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Anular la cuota"
        confirmLabel="Anular"
        description={`La cuota de ${aAnular ? nombreDe(aAnular) : ''} deja de ser exigible y no cuenta más como deuda. No genera ningún movimiento de dinero.`}
      />

      <ConfirmDialog
        open={aBonificar !== null}
        onClose={() => setABonificar(null)}
        onConfirm={async () => {
          if (!aBonificar) return;
          const r = await bonificarCuota(aBonificar.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Bonificar la cuota"
        confirmLabel="Bonificar"
        danger={false}
        description={`La cuota de ${aBonificar ? nombreDe(aBonificar) : ''} queda saldada sin cobrarla: se la regalás. No entra plata a ninguna caja.`}
      />
    </div>
  );
}

/**
 * El período no es un filtro opcional: es el recorte con el que se trabaja.
 * Siempre tiene valor (por defecto, el mes en curso), así que no lleva la opción
 * «Todos» de <FilterSelect>.
 */
function PeriodoSelect({
  anio,
  mes,
  anios,
}: {
  anio: number;
  mes: number;
  anios: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const cambiar = (clave: 'anio' | 'mes', valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(clave, valor);
    params.delete('pagina'); // cambiar de período siempre vuelve a la primera página
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clase =
    'h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

  return (
    <>
      <select
        value={mes}
        onChange={(e) => cambiar('mes', e.target.value)}
        aria-label="Mes"
        className={clase}
      >
        {MESES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>
            {nombre}
          </option>
        ))}
      </select>

      <select
        value={anio}
        onChange={(e) => cambiar('anio', e.target.value)}
        aria-label="Año"
        className={clase}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </>
  );
}

function GenerarCuotasDialog({
  anio,
  mes,
  onClose,
}: {
  anio: number;
  mes: number;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosPeriodo>({
    resolver: zodResolver(esquemaPeriodo),
    defaultValues: { anio, mes },
  });

  async function onSubmit(datos: DatosPeriodo) {
    const r = await generarCuotas(datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const { creadas, salteadas } = r.data;
    if (creadas === 0) {
      toast.success(
        salteadas > 0
          ? `No se creó ninguna cuota nueva: las ${salteadas} correspondientes ya existían.`
          : 'No había cuotas para generar en ese período.',
      );
    } else {
      toast.success(
        `Se generaron ${creadas} cuota(s).` + (salteadas > 0 ? ` Se saltearon ${salteadas}.` : ''),
      );
    }

    onClose();
    router.refresh();
  }

  const anios = [anio - 1, anio, anio + 1];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Generar cuotas del mes"
      description="Emite la cuota de cada alumno activo del período."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="generar-form" type="submit" loading={isSubmitting}>
            Generar
          </Button>
        </>
      }
    >
      <form id="generar-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Callout tone="info" title="Se puede correr las veces que haga falta">
          No duplica nada: si la cuota de un alumno ya existe, la saltea. Tampoco emite la de quien
          todavía no arrancó, la de quien se inscribió para empezar a pagar el mes siguiente, ni la
          de los meses de receso.
        </Callout>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Mes" required error={errors.mes?.message} {...register('mes', { valueAsNumber: true })}>
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </Select>

          <Select label="Año" required error={errors.anio?.message} {...register('anio', { valueAsNumber: true })}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Descuento o recargo sobre una cuota impaga.
 * La base exige que el importe final sea base + ajuste: se actualizan juntos.
 */
function AjusteDialog({ cuota, onClose }: { cuota: FilaCuota; onClose: () => void }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DatosAjusteCuota>({
    resolver: zodResolver(esquemaAjusteCuota),
    defaultValues: {
      ajuste: centsToPesos(cuota.manual_adjustment_cents),
      notes: cuota.notes ?? '',
    },
  });

  // useWatch (y no watch): devuelve el valor, no una función. Así el compilador
  // de React puede memoizar el componente igual.
  const ajustePesos = useWatch({ control, name: 'ajuste' });
  const ajusteCents = Number.isFinite(ajustePesos) ? pesosToCents(ajustePesos) : 0;
  const final = cuota.base_amount_cents + ajusteCents;

  async function onSubmit(datos: DatosAjusteCuota) {
    const r = await ajustarImporteCuota(cuota.id, datos);
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
      title="Modificar el importe"
      description={`${nombreDe(cuota)} · ${formatPeriod(cuota.period_year, cuota.period_month)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="ajuste-form" type="submit" loading={isSubmitting} disabled={final < 0}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="ajuste-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Importe base</span>
            <span className="tabular-nums text-ink">{formatMoney(cuota.base_amount_cents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted">Ajuste</span>
            <span className="tabular-nums text-ink">{formatMoney(ajusteCents)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
            <span className="text-ink">Importe a cobrar</span>
            <span className={`tabular-nums ${final < 0 ? 'text-danger' : 'text-ink'}`}>
              {formatMoney(final)}
            </span>
          </div>
        </div>

        <MoneyInput
          label="Ajuste en pesos"
          required
          min={-99_999_999}
          autoFocus
          hint="Negativo para descontar (por ejemplo −5000), positivo para recargar. El importe base no se toca."
          error={errors.ajuste?.message}
          {...register('ajuste', { valueAsNumber: true })}
        />

        {final < 0 && (
          <Callout tone="danger">El descuento no puede superar el importe de la cuota.</Callout>
        )}

        <Textarea
          label="Motivo"
          rows={2}
          placeholder="Beca, descuento por hermanos, recargo por mora…"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}
