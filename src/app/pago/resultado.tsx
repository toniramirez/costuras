import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Pantalla de retorno de Mercado Pago.
 *
 * IMPORTANTE: estas páginas NO acreditan nada. Mercado Pago devuelve al alumno
 * al navegador, pero la confirmación de verdad llega por el webhook
 * (/api/webhooks/mercadopago), que es el único que toca el dinero. Si acá
 * marcáramos la cuota como pagada, cualquiera podría abrir /pago/exito a mano y
 * saldarse la cuota solo.
 *
 * Por eso el texto es explícito: puede tardar unos segundos en actualizarse.
 */

type Tono = 'success' | 'warning' | 'danger';

const TONOS: Record<Tono, { circulo: string; icono: string }> = {
  success: { circulo: 'bg-success-soft', icono: 'text-success' },
  warning: { circulo: 'bg-warning-soft', icono: 'text-warning' },
  danger: { circulo: 'bg-danger-soft', icono: 'text-danger' },
};

export function ResultadoPago({
  tono,
  icono,
  titulo,
  descripcion,
  aclaracion,
  referencia,
}: {
  tono: Tono;
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  aclaracion: React.ReactNode;
  /** Número de operación de Mercado Pago, si vino en la vuelta. */
  referencia?: string;
}) {
  const estilo = TONOS[tono];

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-[0_1px_2px_rgba(43,37,34,0.04)] sm:p-8">
        <div
          className={cn(
            'mx-auto mb-4 flex size-14 items-center justify-center rounded-full',
            estilo.circulo,
            estilo.icono,
          )}
        >
          {icono}
        </div>

        <h1 className="text-xl font-semibold text-ink">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">{descripcion}</p>

        <div className="mt-5 rounded-xl bg-canvas px-4 py-3 text-left text-sm text-muted">
          {aclaracion}
        </div>

        {referencia && (
          <p className="mt-4 text-xs text-muted">
            Número de operación:{' '}
            <span className="font-medium tabular-nums text-ink">{referencia}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/alumno/pagos"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-white shadow-sm transition-[filter] hover:brightness-95"
          >
            Ver mis cuotas
          </Link>
          <Link
            href="/alumno"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Mercado Pago vuelve con estos parámetros en la URL. */
export type ParamsRetorno = {
  payment_id?: string;
  collection_id?: string;
  status?: string;
  collection_status?: string;
  external_reference?: string;
  preference_id?: string;
  merchant_order_id?: string;
};

/** El id de la operación: Mercado Pago lo manda con dos nombres distintos. */
export function referenciaDe(params: ParamsRetorno): string | undefined {
  const id = params.payment_id ?? params.collection_id;
  return id && id !== 'null' ? id : undefined;
}
