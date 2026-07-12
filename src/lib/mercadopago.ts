import 'server-only';

import { serverEnv, isMercadoPagoConfigured } from '@/lib/env.server';
import { env } from '@/lib/env';
import { pesosToCents } from '@/lib/format';

/**
 * Cliente de Mercado Pago (Checkout Pro).
 *
 * ⚠️  El ACCESS TOKEN jamás llega al navegador. El `server-only` de env.server.ts
 * hace que la compilación falle si algún componente de cliente importa esto,
 * aunque sea sin querer.
 *
 * No usamos el SDK: son dos llamadas HTTP y así no arrastramos una dependencia
 * más ni quedamos atados a su ciclo de vida.
 *
 * El flujo completo:
 *   1. El alumno pide pagar    → POST /api/mercadopago/preferencia → init_point.
 *   2. El navegador va al init_point y paga en Mercado Pago.
 *   3. Mercado Pago vuelve a  → /pago/exito | /pago/pendiente | /pago/error.
 *      Esas páginas NO acreditan nada: son solo un cartel.
 *   4. Mercado Pago avisa a   → /api/webhooks/mercadopago.
 *      ESE es el único lugar donde se acredita la cuota, y solo después de
 *      volver a consultarle el estado a la API de Mercado Pago.
 */

const API = 'https://api.mercadopago.com';

/** Falla temprano y con un mensaje claro si alguien llama a esto sin credenciales. */
function token(): string {
  if (!isMercadoPagoConfigured()) {
    throw new Error(
      'Mercado Pago no está configurado en el servidor (falta MERCADOPAGO_ACCESS_TOKEN).',
    );
  }
  return serverEnv.MERCADOPAGO_ACCESS_TOKEN;
}

async function pedir<T>(
  ruta: string,
  init: RequestInit & { idempotencia?: string } = {},
): Promise<{ estado: number; cuerpo: T | null }> {
  const { idempotencia, ...opciones } = init;

  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}),
      ...opciones.headers,
    },
    // Nunca cachear: son datos de dinero, en vivo.
    cache: 'no-store',
  });

  const texto = await respuesta.text();
  const cuerpo = texto ? (JSON.parse(texto) as T) : null;

  return { estado: respuesta.status, cuerpo };
}

// ── Preferencia de pago ─────────────────────────────────────────────────────

export type DatosPreferencia = {
  /** Va como `external_reference`: es lo que el webhook usa para saber qué cuota acreditar. */
  feeId: string;
  /** En CENTAVOS (como en la base). Se convierte a pesos acá: Mercado Pago los pide con decimales. */
  amountCents: number;
  titulo: string;
  pagador?: { nombre?: string | null; email?: string | null };
};

type RespuestaPreferencia = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
  error?: string;
};

export type Preferencia = { id: string; init_point: string };

export async function crearPreferencia(datos: DatosPreferencia): Promise<Preferencia> {
  const sitio = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  // Mercado Pago exige URLs públicas HTTPS para avisar y para volver
  // automáticamente. En desarrollo (http://localhost) rechaza la preferencia
  // entera, así que ahí no las mandamos: el checkout funciona igual, pero la
  // acreditación automática requiere un dominio público (o un túnel).
  const esPublico = sitio.startsWith('https://');

  const cuerpo = {
    items: [
      {
        id: datos.feeId,
        title: datos.titulo,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: datos.amountCents / 100,
      },
    ],
    external_reference: datos.feeId,
    back_urls: {
      success: `${sitio}/pago/exito`,
      pending: `${sitio}/pago/pendiente`,
      failure: `${sitio}/pago/error`,
    },
    ...(esPublico
      ? {
          auto_return: 'approved',
          notification_url: `${sitio}/api/webhooks/mercadopago`,
        }
      : {}),
    ...(datos.pagador?.email || datos.pagador?.nombre
      ? {
          payer: {
            ...(datos.pagador.nombre ? { name: datos.pagador.nombre } : {}),
            ...(datos.pagador.email ? { email: datos.pagador.email } : {}),
          },
        }
      : {}),
  };

  const { estado, cuerpo: respuesta } = await pedir<RespuestaPreferencia>(
    '/checkout/preferences',
    {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      // Reintentar no debe crear dos preferencias para la misma cuota.
      idempotencia: `pref-${datos.feeId}`,
    },
  );

  if (estado >= 400 || !respuesta?.init_point) {
    const detalle = respuesta?.message ?? respuesta?.error ?? `HTTP ${estado}`;
    throw new Error(`Mercado Pago rechazó la preferencia de pago: ${detalle}`);
  }

  return { id: respuesta.id ?? '', init_point: respuesta.init_point };
}

// ── Consulta de un pago ─────────────────────────────────────────────────────

type RespuestaPago = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number | null;
  fee_details?: Array<{ type?: string; amount?: number | null }> | null;
  transaction_details?: { net_received_amount?: number | null } | null;
};

/** Un pago de Mercado Pago, ya traducido a la moneda de la casa: CENTAVOS. */
export type PagoMercadoPago = {
  id: string;
  status: string;
  statusDetail: string | null;
  /** El id de la cuota (`monthly_fees.id`). */
  externalReference: string | null;
  amountCents: number;
  /** Comisión de Mercado Pago. */
  feeCents: number;
  /** Lo que efectivamente entra a la billetera. */
  netCents: number;
};

/**
 * Trae un pago de la API de Mercado Pago.
 *
 * ESTA es la fuente de verdad del webhook: el cuerpo que manda Mercado Pago no
 * se firma con nuestro secreto, así que cualquiera podría inventarlo. Lo único
 * que le creemos es el ID; el estado lo preguntamos acá.
 *
 * Devuelve `null` si el pago no existe (404): no tiene sentido que Mercado Pago
 * reintente eternamente por algo que no está.
 */
export async function obtenerPago(id: string): Promise<PagoMercadoPago | null> {
  const { estado, cuerpo } = await pedir<RespuestaPago>(`/v1/payments/${encodeURIComponent(id)}`);

  if (estado === 404) return null;
  if (estado >= 400 || !cuerpo) {
    // 401/403/5xx: es un problema nuestro o de Mercado Pago. Que reintente.
    throw new Error(`No pudimos consultar el pago ${id} en Mercado Pago (HTTP ${estado}).`);
  }

  // Mercado Pago devuelve PESOS con decimales (1234.56). Nosotros trabajamos en
  // centavos enteros: convertimos una sola vez, acá.
  const amountCents = pesosToCents(cuerpo.transaction_amount ?? 0);

  const feeCents = (cuerpo.fee_details ?? []).reduce(
    (suma, f) => suma + pesosToCents(f.amount ?? 0),
    0,
  );

  const neto = cuerpo.transaction_details?.net_received_amount;
  const netCents = neto !== null && neto !== undefined ? pesosToCents(neto) : amountCents - feeCents;

  return {
    id: String(cuerpo.id ?? id),
    status: cuerpo.status ?? 'desconocido',
    statusDetail: cuerpo.status_detail ?? null,
    externalReference: cuerpo.external_reference ?? null,
    amountCents,
    feeCents,
    netCents,
  };
}
