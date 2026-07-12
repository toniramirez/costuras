import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerPago } from '@/lib/mercadopago';
import { isMercadoPagoConfigured } from '@/lib/env.server';

/**
 * POST /api/webhooks/mercadopago
 *
 * El ÚNICO lugar donde se acredita un pago de Mercado Pago.
 *
 * Cómo se defiende:
 *
 *   · **No le creemos al cuerpo del pedido.** Mercado Pago no lo firma con un
 *     secreto nuestro, así que cualquiera podría inventarlo. Lo único que le
 *     tomamos es el ID del pago; el estado, el importe y la comisión los
 *     preguntamos a la API de Mercado Pago con el access token.
 *
 *   · La acreditación la hace `confirm_mercadopago_payment` en la base, que ya
 *     es IDEMPOTENTE: el mismo `mp_payment_id` no se acredita dos veces. Mercado
 *     Pago reintenta y manda avisos duplicados; con eso alcanza. Acá NO se
 *     reimplementa nada de esa lógica (crea el pago, el recibo y el movimiento
 *     en la caja de Mercado Pago).
 *
 *   · Usa `service_role` porque no hay usuario en sesión: el que llama es
 *     Mercado Pago. Es uno de los tres casos permitidos.
 *
 *   · Devuelve 200 siempre que haya procesado (aunque no hubiera nada que
 *     hacer). Un error nuestro sí devuelve 500, para que Mercado Pago reintente.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CuerpoWebhook = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  resource?: string;
};

/**
 * Mercado Pago manda el aviso en varios formatos según la versión y el origen:
 *   · Webhooks:  body { type: 'payment', data: { id } }
 *   · IPN viejo: query ?topic=payment&id=123
 *   · Query:     ?type=payment&data.id=123
 * Los aceptamos todos: no cuesta nada y evita perder una acreditación.
 */
function extraerPago(cuerpo: CuerpoWebhook, url: URL): { esPago: boolean; id: string | null } {
  const tipo = cuerpo.type ?? cuerpo.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');

  const id =
    cuerpo.data?.id ??
    url.searchParams.get('data.id') ??
    url.searchParams.get('id') ??
    // IPN antiguo: resource puede ser la URL completa del recurso.
    cuerpo.resource?.split('/').pop() ??
    null;

  return {
    esPago: tipo === 'payment' || tipo === 'payment.updated' || tipo === 'payment.created',
    id: id !== null && id !== undefined && String(id).length > 0 ? String(id) : null,
  };
}

export async function POST(request: Request) {
  // Sin credenciales no podemos verificar nada contra la API: no acreditamos.
  if (!isMercadoPagoConfigured()) {
    return Response.json({ ignorado: 'Mercado Pago no está configurado' }, { status: 200 });
  }

  let cuerpo: CuerpoWebhook = {};
  try {
    const texto = await request.text();
    if (texto) cuerpo = JSON.parse(texto) as CuerpoWebhook;
  } catch {
    // Cuerpo ilegible: nos quedamos con los parámetros de la URL.
  }

  const { esPago, id } = extraerPago(cuerpo, new URL(request.url));

  // Otros avisos (merchant_order, plan, subscription…): no son asunto nuestro.
  if (!esPago || !id) {
    return Response.json({ ignorado: 'El aviso no corresponde a un pago' }, { status: 200 });
  }

  try {
    // Fuente de verdad: la API de Mercado Pago, no el cuerpo del pedido.
    const pago = await obtenerPago(id);

    if (!pago) {
      // No existe. Reintentar eternamente no lo va a hacer aparecer.
      return Response.json({ ignorado: `El pago ${id} no existe` }, { status: 200 });
    }

    if (pago.status !== 'approved') {
      // Pendiente, rechazado, en revisión… La cuota queda como está. Si después
      // se aprueba, Mercado Pago manda otro aviso y ahí sí se acredita.
      return Response.json(
        { procesado: true, acreditado: false, estado: pago.status },
        { status: 200 },
      );
    }

    const feeId = pago.externalReference;
    if (!feeId) {
      return Response.json(
        { ignorado: `El pago ${id} no tiene referencia a una cuota` },
        { status: 200 },
      );
    }

    // service_role: no hay sesión, el que llama es Mercado Pago.
    const supabase = createAdminClient();

    const { error } = await supabase.rpc('confirm_mercadopago_payment', {
      p_fee_id: feeId,
      p_mp_payment_id: pago.id,
      p_mp_status: pago.status,
      p_amount_cents: pago.amountCents,
      p_mp_fee_cents: pago.feeCents,
      p_net_amount_cents: pago.netCents,
    });

    if (error) throw error;

    // Si la cuota ya estaba acreditada, la función devuelve null sin hacer nada:
    // es idempotente. Para Mercado Pago, procesado igual.
    return Response.json({ procesado: true, acreditado: true }, { status: 200 });
  } catch (error) {
    // Error nuestro o de Mercado Pago: que reintente.
    console.error('[webhook mercadopago] no se pudo procesar el pago', id, error);
    return Response.json({ error: 'No pudimos procesar el aviso.' }, { status: 500 });
  }
}
