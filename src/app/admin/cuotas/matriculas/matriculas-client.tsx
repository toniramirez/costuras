'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, FileText, Gift, GraduationCap, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { ESTADO_CUOTA, opciones } from '@/lib/labels';
import { formatDate, formatMoney } from '@/lib/format';
import {
  anularMatricula,
  anularPago,
  bonificarMatricula,
  cobrarMatricula,
} from '@/app/actions/fees';
import type { FilaMatricula } from '@/lib/services/fees';
import {
  AnularPagoDialog,
  CobroDialog,
  type OpcionCaja,
  type OpcionMedio,
} from '../pago-dialogs';
import { TabsCuotas } from '../tabs';

const IMPAGAS = ['pendiente', 'comprobante_pendiente', 'vencida'] as const;

const nombreDe = (m: FilaMatricula) =>
  `${m.students?.first_name ?? ''} ${m.students?.last_name ?? ''}`.trim() || 'Alumno';

export function MatriculasClient({
  matriculas,
  total,
  impagas,
  totalPorCobrar,
  medios,
  cajas,
}: {
  matriculas: FilaMatricula[];
  total: number;
  impagas: number;
  totalPorCobrar: number;
  medios: OpcionMedio[];
  cajas: OpcionCaja[];
}) {
  const router = useRouter();

  const [aCobrar, setACobrar] = useState<FilaMatricula | null>(null);
  const [aAnular, setAAnular] = useState<FilaMatricula | null>(null);
  const [aBonificar, setABonificar] = useState<FilaMatricula | null>(null);
  const [aAnularPago, setAAnularPago] = useState<FilaMatricula | null>(null);

  const sinCobranza = medios.length === 0 || cajas.length === 0;

  const columnas: ReadonlyArray<Column<FilaMatricula>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (m) => nombreDe(m),
    },
    {
      header: 'Emitida',
      render: (m) => formatDate(m.issued_date),
    },
    {
      header: 'Vence',
      render: (m) => formatDate(m.due_date),
    },
    {
      header: 'Importe',
      render: (m) => (
        <span className="font-medium tabular-nums">{formatMoney(m.amount_cents)}</span>
      ),
    },
    {
      header: 'Recibo',
      desktopOnly: true,
      render: (m) =>
        m.receipt_id ? (
          <a
            href={`/api/recibos/${m.receipt_id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <FileText className="size-3.5" aria-hidden />
            {m.receipt_number ?? 'Ver'}
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (m) => <StatusBadge value={m.status} map={ESTADO_CUOTA} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Matrículas"
        description="La matrícula es un concepto aparte de la cuota. Se cobra una sola vez y también por el total."
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Matrículas" value={total} hint="Con los filtros actuales" />
        <StatCard label="Impagas" value={impagas} tone={impagas > 0 ? 'warning' : 'neutral'} />
        <StatCard
          label="Total por cobrar"
          value={formatMoney(totalPorCobrar)}
          tone={totalPorCobrar > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <FiltersBar>
        <SearchInput placeholder="Buscar por alumno…" />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos los estados"
          options={[
            { value: 'deudores', label: 'Deudores (todo lo impago)' },
            ...opciones(ESTADO_CUOTA),
          ]}
        />
      </FiltersBar>

      {matriculas.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title="No hay matrículas con esos filtros"
          description="Las matrículas se emiten al inscribir a un alumno, desde su ficha."
        />
      ) : (
        <>
          <DataList
            items={matriculas}
            columns={columnas}
            keyOf={(m) => m.id}
            actions={(m) => {
              const impaga = (IMPAGAS as readonly string[]).includes(m.status);

              return (
                <>
                  {impaga && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sinCobranza}
                      onClick={() => setACobrar(m)}
                    >
                      <Wallet className="size-3.5" aria-hidden />
                      Cobrar
                    </Button>
                  )}

                  {impaga && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setABonificar(m)}>
                        <Gift className="size-3.5" aria-hidden />
                        Bonificar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAAnular(m)}>
                        <Ban className="size-3.5 text-danger" aria-hidden />
                        Anular
                      </Button>
                    </>
                  )}

                  {m.status === 'pagada' && m.payment_id && (
                    <Button size="sm" variant="ghost" onClick={() => setAAnularPago(m)}>
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

      {aCobrar && (
        <CobroDialog
          titulo="Registrar cobro de la matrícula"
          alumno={nombreDe(aCobrar)}
          concepto="Matrícula"
          importeCents={aCobrar.amount_cents}
          medios={medios}
          cajas={cajas}
          onClose={() => setACobrar(null)}
          onConfirm={(datos) => cobrarMatricula(aCobrar.id, datos)}
        />
      )}

      {aAnularPago && aAnularPago.payment_id && (
        <AnularPagoDialog
          alumno={nombreDe(aAnularPago)}
          concepto="Matrícula"
          importeCents={aAnularPago.amount_cents}
          onClose={() => setAAnularPago(null)}
          onConfirm={(datos) => anularPago(aAnularPago.payment_id!, datos)}
        />
      )}

      <ConfirmDialog
        open={aAnular !== null}
        onClose={() => setAAnular(null)}
        onConfirm={async () => {
          if (!aAnular) return;
          const r = await anularMatricula(aAnular.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Anular la matrícula"
        confirmLabel="Anular"
        description={`La matrícula de ${aAnular ? nombreDe(aAnular) : ''} deja de ser exigible. No genera ningún movimiento de dinero.`}
      />

      <ConfirmDialog
        open={aBonificar !== null}
        onClose={() => setABonificar(null)}
        onConfirm={async () => {
          if (!aBonificar) return;
          const r = await bonificarMatricula(aBonificar.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Bonificar la matrícula"
        confirmLabel="Bonificar"
        danger={false}
        description={`La matrícula de ${aBonificar ? nombreDe(aBonificar) : ''} queda saldada sin cobrarla y el alumno pasa a estar exento. No entra plata a ninguna caja.`}
      />
    </div>
  );
}
