import { timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env.server';
import { TIMEZONE } from '@/lib/format';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * GET /api/cron — tareas diarias de mantenimiento.
 *
 * La ejecuta el cron de Vercel (ver `vercel.json`), que manda el secreto en la
 * cabecera `Authorization: Bearer <CRON_SECRET>`. Está agendada a las 09:00 UTC,
 * que en Argentina (UTC−3) son las 06:00: antes de que abra la academia.
 *
 * Seguridad:
 *   · Sin `CRON_SECRET` configurado, la ruta rechaza SIEMPRE. Preferimos que el
 *     mantenimiento no corra a que quede una ruta abierta que mueve datos.
 *   · La comparación es en tiempo constante: comparar con `===` filtra, por el
 *     tiempo que tarda, cuántos caracteres del secreto acertaste.
 *   · Usa `service_role` porque no hay usuario en sesión. Es uno de los tres
 *     casos permitidos (junto con crear usuarios y el webhook de Mercado Pago).
 *
 * Las tres tareas ya están implementadas y probadas en la base. Acá solo se las
 * llama, en orden.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Comparación en tiempo constante: no filtra información por el tiempo que tarda. */
function secretoValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige la misma longitud; comparar las longitudes con === no
  // filtra nada útil (la longitud del secreto no es el secreto).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const esperado = serverEnv.CRON_SECRET;

  // Sin secreto configurado, la ruta está cerrada. Siempre.
  if (!esperado) {
    return Response.json(
      { error: 'La ruta de mantenimiento no está habilitada (falta CRON_SECRET).' },
      { status: 401 },
    );
  }

  const cabecera = request.headers.get('authorization') ?? '';
  const prefijo = 'Bearer ';

  if (!cabecera.startsWith(prefijo) || !secretoValido(cabecera.slice(prefijo.length), esperado)) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 1. Cuotas y matrículas impagas cuyo vencimiento ya pasó → vencidas.
    const vencidas = await supabase.rpc('mark_overdue_fees');
    if (vencidas.error) throw vencidas.error;

    // 2. Créditos de recuperación pasados de fecha → vencidos.
    //    Va DESPUÉS de marcar vencimientos: así el aviso del paso 3 no anuncia
    //    algo que en realidad ya venció.
    const recuperaciones = await supabase.rpc('expire_recovery_credits');
    if (recuperaciones.error) throw recuperaciones.error;

    // 3. Avisos de lo que vence en los próximos 5 días (no repite avisos ya enviados).
    const avisos = await supabase.rpc('notify_upcoming_expirations', { p_days_ahead: 5 });
    if (avisos.error) throw avisos.error;

    return Response.json({
      ok: true,
      ejecutado: formatInTimeZone(new Date(), TIMEZONE, "dd/MM/yyyy HH:mm 'hs'"),
      cuotas_vencidas: vencidas.data ?? 0,
      recuperaciones_vencidas: recuperaciones.data ?? 0,
      avisos_enviados: avisos.data ?? 0,
    });
  } catch (error) {
    console.error('[cron] falló el mantenimiento diario', error);
    // 500: Vercel lo marca como fallido y queda registrado en el panel.
    return Response.json(
      { ok: false, error: 'Falló el mantenimiento diario. Revisá los registros del servidor.' },
      { status: 500 },
    );
  }
}
