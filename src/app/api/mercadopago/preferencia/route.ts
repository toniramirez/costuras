import { z } from 'zod';

import { assertStudent } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { crearPreferencia } from '@/lib/mercadopago';
import { isMercadoPagoConfigured } from '@/lib/env.server';
import { formatPeriod } from '@/lib/format';
import { mapError } from '@/lib/errors';

/**
 * POST /api/mercadopago/preferencia   { feeId }  →  { init_point }
 *
 * Crea la preferencia de pago de UNA cuota y devuelve el enlace del checkout.
 *
 * Tres cuidados:
 *   1. La cuota tiene que ser DEL ALUMNO AUTENTICADO. Lo leemos con el cliente
 *      con sesión (la RLS ya lo garantiza) y además comparamos el student_id:
 *      defensa en profundidad, no cuesta nada.
 *   2. El importe sale de la BASE, nunca del cuerpo del pedido. Si el importe lo
 *      mandara el navegador, cualquiera pagaría $1 una cuota de $30.000.
 *   3. Acá no se marca nada como pagado. Eso lo hace el webhook, y solo después
 *      de preguntarle el estado a Mercado Pago.
 */

// El token de Mercado Pago se lee con el runtime de Node, no en el Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esquema = z.object({
  feeId: z.string().uuid('La cuota no es válida'),
});

/** Estados en los que todavía tiene sentido pagar. */
const PAGABLES = ['pendiente', 'vencida'];

export async function POST(request: Request) {
  try {
    const alumno = await assertStudent();
    const { feeId } = esquema.parse(await request.json());

    const supabase = await createClient();

    const { data: config } = await supabase
      .from('academy_settings')
      .select('mp_enabled, academy_name')
      .eq('id', 1)
      .single();

    if (!config?.mp_enabled || !isMercadoPagoConfigured()) {
      return Response.json(
        {
          error:
            'El pago con Mercado Pago no está disponible en este momento. Podés pagar en la academia o subir un comprobante de transferencia.',
        },
        { status: 409 },
      );
    }

    // La RLS deja ver únicamente las cuotas del alumno de la sesión.
    const { data: cuota } = await supabase
      .from('monthly_fees')
      .select('id, student_id, final_amount_cents, status, period_year, period_month')
      .eq('id', feeId)
      .maybeSingle();

    if (!cuota || cuota.student_id !== alumno.id) {
      return Response.json({ error: 'No encontramos esa cuota.' }, { status: 404 });
    }

    if (!PAGABLES.includes(cuota.status)) {
      return Response.json(
        { error: 'Esa cuota no está pendiente de pago.' },
        { status: 409 },
      );
    }

    if (cuota.final_amount_cents <= 0) {
      return Response.json({ error: 'La cuota no tiene importe a pagar.' }, { status: 409 });
    }

    const preferencia = await crearPreferencia({
      feeId: cuota.id,
      amountCents: cuota.final_amount_cents,
      titulo: `${config.academy_name} · Cuota ${formatPeriod(cuota.period_year, cuota.period_month)}`,
      pagador: {
        nombre: `${alumno.first_name} ${alumno.last_name}`.trim(),
        email: alumno.email,
      },
    });

    return Response.json({ init_point: preferencia.init_point });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Los datos del pedido no son válidos.' }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'El cuerpo del pedido no es un JSON válido.' }, { status: 400 });
    }
    return Response.json({ error: mapError(error) }, { status: 500 });
  }
}
