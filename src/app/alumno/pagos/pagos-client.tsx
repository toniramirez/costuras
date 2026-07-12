'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  Receipt,
  Upload,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, MoneyInput, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { ESTADO_CUOTA } from '@/lib/labels';
import {
  centsToPesos,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTimestampAsDate,
} from '@/lib/format';
import { TIPOS, nombreSeguro, subirArchivo, validarArchivo, type LimitesArchivo } from '@/lib/storage';
import { esquemaComprobante, type DatosComprobante } from '@/lib/validations/student-portal';
import { subirComprobante } from '@/app/actions/student-portal';
import type { Deuda, EstadoDeCuenta, Recibo } from '@/lib/services/student-portal';

/** El bucket `proofs` acepta imágenes y PDF: nada más. */
const TIPOS_COMPROBANTE: readonly string[] = [...TIPOS.imagen, 'application/pdf'];
const ACCEPT = TIPOS_COMPROBANTE.join(',');

export function PagosClient({
  studentId,
  estado,
  mpHabilitado,
  limites,
}: {
  studentId: string;
  estado: EstadoDeCuenta;
  mpHabilitado: boolean;
  limites: LimitesArchivo;
}) {
  const [aPagar, setAPagar] = useState<Deuda | null>(null);
  const { impagas, historial, recibos, totalAdeudadoCents, proximoVencimiento } = estado;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Mis pagos"
        description="Tu estado de cuenta, los comprobantes que enviaste y tus recibos."
      />

      {/* ── Total adeudado ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          {totalAdeudadoCents === 0 ? (
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2 className="size-5 text-success" aria-hidden />
              </span>
              <div>
                <p className="text-base font-semibold text-ink">Estás al día</p>
                <p className="text-sm text-muted">No tenés cuotas pendientes.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Total adeudado
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-danger">
                {formatMoney(totalAdeudadoCents)}
              </p>
              <p className="mt-1 text-sm text-muted">
                {impagas.length} {impagas.length === 1 ? 'deuda pendiente' : 'deudas pendientes'}
                {proximoVencimiento && ` · la más próxima vence el ${formatDate(proximoVencimiento)}`}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Deudas ─────────────────────────────────────────────────────── */}
      {impagas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">A pagar</h2>
          {impagas.map((deuda) => (
            <DeudaCard
              key={deuda.id}
              deuda={deuda}
              mpHabilitado={mpHabilitado}
              onSubir={() => setAPagar(deuda)}
            />
          ))}
        </section>
      )}

      {/* ── Historial de cuotas ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-muted" aria-hidden />
            Historial de cuotas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <p className="text-sm text-muted">Todavía no tenés cuotas saldadas.</p>
          ) : (
            <DataList
              items={historial}
              columns={COLUMNAS_HISTORIAL}
              keyOf={(d) => d.id}
              actions={(d) => (d.receiptId ? <EnlaceRecibo id={d.receiptId} /> : null)}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Recibos ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-muted" aria-hidden />
            Recibos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recibos.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="Todavía no tenés recibos"
              description="Cuando la academia registre un pago tuyo, el recibo va a aparecer acá."
            />
          ) : (
            <DataList
              items={recibos}
              columns={COLUMNAS_RECIBOS}
              keyOf={(r) => r.id}
              actions={(r) => <EnlaceRecibo id={r.id} />}
            />
          )}
        </CardContent>
      </Card>

      {aPagar && (
        <ComprobanteDialog
          deuda={aPagar}
          studentId={studentId}
          limites={limites}
          onClose={() => setAPagar(null)}
        />
      )}
    </div>
  );
}

const COLUMNAS_HISTORIAL: ReadonlyArray<Column<Deuda>> = [
  { header: 'Concepto', primary: true, render: (d) => d.concepto },
  {
    header: 'Importe',
    render: (d) => <span className="tabular-nums">{formatMoney(d.importeCents)}</span>,
  },
  { header: 'Pagada el', render: (d) => formatDate(d.pagadaEl) },
  {
    header: 'Estado',
    trailing: true,
    render: (d) => <StatusBadge value={d.estado} map={ESTADO_CUOTA} />,
  },
];

const COLUMNAS_RECIBOS: ReadonlyArray<Column<Recibo>> = [
  {
    header: 'Recibo',
    primary: true,
    render: (r) => (
      <div>
        <span>{r.concept}</span>
        <p className="text-xs font-normal text-muted">
          N.º {r.receipt_number}
          {r.period_label ? ` · ${r.period_label}` : ''}
        </p>
      </div>
    ),
  },
  { header: 'Medio', render: (r) => r.method_name ?? '—', desktopOnly: true },
  { header: 'Fecha', render: (r) => formatTimestampAsDate(r.issued_at) },
  {
    header: 'Importe',
    trailing: true,
    render: (r) => (
      <span className="font-medium tabular-nums">{formatMoney(Number(r.amount_cents))}</span>
    ),
  },
];

/**
 * Descarga del recibo en PDF. Es un enlace de verdad (no un botón con onClick):
 * así se puede abrir en otra pestaña, copiar o compartir.
 */
function EnlaceRecibo({ id }: { id: string }) {
  return (
    <a
      href={`/api/recibos/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-line/40"
    >
      <Download className="size-3.5" aria-hidden />
      Recibo
    </a>
  );
}

/* =============================================================================
   Una deuda impaga
   ========================================================================== */

function DeudaCard({
  deuda,
  mpHabilitado,
  onSubir,
}: {
  deuda: Deuda;
  mpHabilitado: boolean;
  onSubir: () => void;
}) {
  const [redirigiendo, setRedirigiendo] = useState(false);

  const comprobante = deuda.comprobante;
  const enRevision = deuda.estado === 'comprobante_pendiente';
  const rechazado = !enRevision && comprobante?.status === 'rechazado';

  // Mercado Pago solo cobra CUOTAS: la función de la base que acredita el pago
  // (confirm_mercadopago_payment) trabaja sobre monthly_fees. Para la matrícula
  // no mostramos el botón: sería un botón muerto.
  const puedePagarMP = mpHabilitado && deuda.tipo === 'cuota' && !enRevision;

  async function pagarConMercadoPago() {
    setRedirigiendo(true);
    try {
      const res = await fetch('/api/mercadopago/preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeId: deuda.id }),
      });

      const cuerpo: unknown = await res.json().catch(() => null);
      const initPoint = leerTexto(cuerpo, 'init_point');

      if (!res.ok || !initPoint) {
        toast.error(leerTexto(cuerpo, 'error') ?? 'No pudimos abrir Mercado Pago. Probá de nuevo.');
        setRedirigiendo(false);
        return;
      }

      // Se va del sitio: no apagamos el spinner, la página ya está navegando.
      window.location.href = initPoint;
    } catch {
      toast.error('No pudimos conectarnos con Mercado Pago. Revisá tu conexión.');
      setRedirigiendo(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">{deuda.concepto}</p>
            <p className="text-sm text-muted">
              {deuda.vencimiento ? `Vence el ${formatDate(deuda.vencimiento)}` : 'Sin vencimiento'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-lg font-semibold tabular-nums text-ink">
              {formatMoney(deuda.importeCents)}
            </span>
            <StatusBadge value={deuda.estado} map={ESTADO_CUOTA} />
          </div>
        </div>

        {/* El motivo del rechazo va bien visible: es lo que tiene que corregir. */}
        {rechazado && comprobante && (
          <Callout tone="danger" title="Rechazamos tu comprobante">
            <p>{comprobante.rejection_reason ?? 'La academia no indicó un motivo.'}</p>
            <p className="mt-1 opacity-80">
              Enviado el {formatDateTime(comprobante.uploaded_at)}. Podés subir uno nuevo.
            </p>
          </Callout>
        )}

        {enRevision && comprobante && (
          <Callout tone="info" title="Comprobante en revisión">
            <p>
              Lo recibimos el {formatDateTime(comprobante.uploaded_at)}
              {comprobante.informed_amount_cents
                ? ` por ${formatMoney(Number(comprobante.informed_amount_cents))}`
                : ''}
              . La academia lo va a verificar y te avisa.
            </p>
          </Callout>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {enRevision ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Clock className="size-4" aria-hidden />
              Esperando la revisión de la academia
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={onSubir}>
              <Upload className="size-3.5" aria-hidden />
              {rechazado ? 'Subir otro comprobante' : 'Subir comprobante'}
            </Button>
          )}

          {puedePagarMP && (
            <Button size="sm" onClick={pagarConMercadoPago} loading={redirigiendo}>
              <CreditCard className="size-3.5" aria-hidden />
              Pagar con Mercado Pago
            </Button>
          )}

          {comprobante?.url && (
            <a
              href={comprobante.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-line/40"
            >
              <Eye className="size-3.5" aria-hidden />
              Ver el que enviaste
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Lee una propiedad de texto de una respuesta JSON desconocida. */
function leerTexto(cuerpo: unknown, clave: string): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const valor = (cuerpo as Record<string, unknown>)[clave];
  return typeof valor === 'string' && valor ? valor : null;
}

/* =============================================================================
   Diálogo: subir el comprobante de una transferencia
   ========================================================================== */

function ComprobanteDialog({
  deuda,
  studentId,
  limites,
  onClose,
}: {
  deuda: Deuda;
  studentId: string;
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosComprobante>({
    resolver: zodResolver(esquemaComprobante),
    // Prellenamos con lo que debe: es el importe que casi siempre transfiere.
    defaultValues: { importe: centsToPesos(deuda.importeCents), reference: '', note: '' },
  });

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setErrorArchivo(null);
    setArchivo(null);
    if (!file) return;

    if (!TIPOS_COMPROBANTE.includes(file.type)) {
      setErrorArchivo('Tiene que ser una imagen (foto o captura) o un PDF.');
      return;
    }

    // Los límites salen de la configuración de la academia, no del código.
    const error = validarArchivo(file, limites);
    if (error) {
      setErrorArchivo(error);
      return;
    }

    setArchivo(file);
  }

  async function onSubmit(datos: DatosComprobante) {
    if (!archivo) {
      setErrorArchivo('Elegí el archivo del comprobante.');
      return;
    }

    setErrorArchivo(null);
    setProgreso(0);

    // La ruta no es negociable: la política del bucket exige que la primera
    // carpeta sea el id del alumno (proofs/<student_id>/<fee_id>/<archivo>).
    const path = `${studentId}/${deuda.id}/${nombreSeguro(archivo.name)}`;
    const subida = await subirArchivo('proofs', path, archivo, setProgreso);

    if ('error' in subida) {
      setProgreso(null);
      setErrorArchivo(subida.error);
      return;
    }

    const r = await subirComprobante({
      tipo: deuda.tipo,
      feeId: deuda.id,
      filePath: subida.path,
      importe: datos.importe,
      reference: datos.reference,
      note: datos.note,
    });

    setProgreso(null);

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
      title={`Comprobante · ${deuda.concepto}`}
      description="Subí la captura o el PDF de la transferencia. La academia lo revisa y confirma el pago."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="comprobante-form" type="submit" loading={isSubmitting}>
            Enviar comprobante
          </Button>
        </>
      }
    >
      <form id="comprobante-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="archivo" className="block text-sm font-medium text-ink">
            Archivo
            <span className="ml-0.5 text-danger" aria-label="obligatorio">
              *
            </span>
          </label>
          <input
            id="archivo"
            type="file"
            accept={ACCEPT}
            onChange={elegirArchivo}
            disabled={isSubmitting}
            aria-invalid={errorArchivo ? true : undefined}
            className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
          />
          {errorArchivo ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errorArchivo}
            </p>
          ) : (
            <p className="text-xs text-muted">
              Imagen o PDF. Hasta {limites.max_image_mb} MB si es imagen y {limites.max_document_mb}{' '}
              MB si es PDF.
            </p>
          )}
        </div>

        {/* Progreso REAL de la subida (lo informa el XHR, no es una barra de adorno). */}
        {progreso !== null && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de la subida"
              className="h-2 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {progreso < 100 ? `Subiendo… ${progreso}%` : 'Registrando el comprobante…'}
            </p>
          </div>
        )}

        <MoneyInput
          label="Importe que transferiste"
          required
          hint="En pesos. Si transferiste otro monto, corregilo acá."
          error={errors.importe?.message}
          {...register('importe', { valueAsNumber: true })}
        />

        <Input
          label="Referencia o número de operación"
          placeholder="Ej.: 0012345678"
          error={errors.reference?.message}
          {...register('reference')}
        />

        <Textarea
          label="Observación"
          rows={2}
          placeholder="Algo que la academia deba saber sobre este pago"
          error={errors.note?.message}
          {...register('note')}
        />

        <Callout tone="info">
          <span className="inline-flex items-start gap-1.5">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            El pago se acredita cuando la academia aprueba el comprobante.
          </span>
        </Callout>
      </form>
    </Dialog>
  );
}
