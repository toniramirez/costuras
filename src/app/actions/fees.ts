'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents, todayISO } from '@/lib/format';
import {
  esquemaAjusteCuota,
  esquemaAnulacion,
  esquemaAprobacion,
  esquemaCobro,
  esquemaPeriodo,
  esquemaRechazo,
} from '@/lib/validations/fees';

/**
 * Cuotas, matrículas y comprobantes.
 *
 * TODA la lógica de dinero vive en la base (funciones SECURITY DEFINER, ya
 * probadas): acá solo validamos, llamamos al RPC correspondiente y refrescamos
 * las pantallas. No se reimplementa ni una suma.
 *
 *   settle_monthly_fee      cobra una cuota (crea pago + recibo + movimiento)
 *   settle_registration_fee ídem para la matrícula
 *   generate_monthly_fees   genera el mes (idempotente)
 *   mark_overdue_fees       marca las vencidas
 *   approve/reject_payment_proof  revisa un comprobante
 *   void_payment            anula un pago y genera el reverso
 */

const RUTA_CUOTAS = '/admin/cuotas';
const RUTA_MATRICULAS = '/admin/cuotas/matriculas';
const RUTA_COMPROBANTES = '/admin/comprobantes';

/**
 * Un cobro no toca solo la cuota: crea un pago, un recibo y un movimiento de
 * caja. Todas esas pantallas quedan desactualizadas, así que se refrescan.
 */
function revalidarDinero() {
  revalidatePath(RUTA_CUOTAS);
  revalidatePath(RUTA_MATRICULAS);
  revalidatePath(RUTA_COMPROBANTES);
  revalidatePath('/admin/movimientos');
  revalidatePath('/admin/cajas');
  revalidatePath('/admin');
}

/**
 * 'yyyy-mm-dd' → instante ISO.
 *
 * Si la fecha es hoy usamos la hora real; si es una fecha pasada, el mediodía de
 * Córdoba (UTC-3, sin horario de verano). El mediodía evita que la conversión a
 * `date` que hace la base caiga en el día anterior o en el siguiente.
 */
function instanteDe(fecha: string): string {
  if (fecha === todayISO()) return new Date().toISOString();
  return new Date(`${fecha}T12:00:00-03:00`).toISOString();
}

// ── Generación y vencimientos ───────────────────────────────────────────────

/**
 * Genera las cuotas del período. Es idempotente: si ya existen, no las duplica
 * (la base tiene un único por alumno/año/mes) y las cuenta como salteadas.
 */
export async function generarCuotas(datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaPeriodo.parse(datos);

    const supabase = await createClient();
    const filas = orThrow(
      await supabase.rpc('generate_monthly_fees', { p_year: v.anio, p_month: v.mes }),
    );

    const r = filas?.[0] ?? { created_count: 0, skipped_count: 0 };

    revalidatePath(RUTA_CUOTAS);
    revalidatePath('/admin');

    return { creadas: r.created_count ?? 0, salteadas: r.skipped_count ?? 0 };
  });
}

/** Pasa a «vencida» toda cuota o matrícula impaga cuyo vencimiento ya pasó. */
export async function marcarVencidas() {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const marcadas = orThrow(await supabase.rpc('mark_overdue_fees'));

    revalidatePath(RUTA_CUOTAS);
    revalidatePath(RUTA_MATRICULAS);
    revalidatePath('/admin');

    return { marcadas: marcadas ?? 0 };
  });
}

// ── Cobros (siempre por el TOTAL: no existe el pago parcial) ────────────────

export async function cobrarCuota(feeId: string, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaCobro.parse(datos);

      const supabase = await createClient();
      // El importe NO se pasa: la función cobra `final_amount_cents`, completo.
      orThrow(
        await supabase.rpc('settle_monthly_fee', {
          p_fee_id: feeId,
          p_method_id: v.method_id,
          p_cash_account_id: v.cash_account_id,
          p_paid_at: instanteDe(v.paid_at),
          p_external_reference: v.external_reference || undefined,
          p_notes: v.notes || undefined,
        }),
      );

      revalidarDinero();
    },
    'Cobro registrado. El recibo ya se puede descargar.',
  );
}

export async function cobrarMatricula(feeId: string, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaCobro.parse(datos);

      const supabase = await createClient();
      orThrow(
        await supabase.rpc('settle_registration_fee', {
          p_fee_id: feeId,
          p_method_id: v.method_id,
          p_cash_account_id: v.cash_account_id,
          p_paid_at: instanteDe(v.paid_at),
          p_external_reference: v.external_reference || undefined,
          p_notes: v.notes || undefined,
        }),
      );

      revalidarDinero();
    },
    'Matrícula cobrada. El recibo ya se puede descargar.',
  );
}

// ── Importe de la cuota (antes de cobrarla) ─────────────────────────────────

/**
 * Descuento o recargo sobre una cuota todavía impaga.
 *
 * La base exige `final_amount_cents = base_amount_cents + manual_adjustment_cents`
 * (restricción monthly_fee_final_ck): por eso se actualizan los dos campos en el
 * mismo UPDATE. El importe base no se toca nunca.
 */
export async function ajustarImporteCuota(feeId: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaAjusteCuota.parse(datos);

    const supabase = await createClient();
    const cuota = orThrow(
      await supabase
        .from('monthly_fees')
        .select('base_amount_cents, status')
        .eq('id', feeId)
        .single(),
    );
    if (!cuota) throw new Error('La cuota no existe.');

    if (cuota.status === 'pagada') {
      throw new Error('La cuota ya está pagada. Para cambiar el importe, primero anulá el pago.');
    }
    if (cuota.status === 'anulada' || cuota.status === 'bonificada') {
      throw new Error(`La cuota está ${cuota.status} y no admite cambios de importe.`);
    }

    const base = Number(cuota.base_amount_cents);
    const ajuste = pesosToCents(v.ajuste);
    const final = base + ajuste;

    if (final < 0) {
      throw new Error('El descuento no puede superar el importe de la cuota.');
    }

    orThrow(
      await supabase
        .from('monthly_fees')
        .update({
          manual_adjustment_cents: ajuste,
          final_amount_cents: final,
          notes: v.notes || null,
        })
        .eq('id', feeId)
        .select('id')
        .single(),
    );

    revalidatePath(RUTA_CUOTAS);
    revalidatePath('/admin');
  }, 'Importe actualizado');
}

// ── Anular / bonificar ──────────────────────────────────────────────────────

async function cambiarEstadoCuota(feeId: string, estado: 'anulada' | 'bonificada') {
  await assertAdmin();

  const supabase = await createClient();
  const cuota = orThrow(
    await supabase.from('monthly_fees').select('status').eq('id', feeId).single(),
  );
  if (!cuota) throw new Error('La cuota no existe.');

  // Con la cuota pagada hay dinero en la caja: no se puede tapar cambiando el
  // estado. Hay que anular el pago, que genera el reverso.
  if (cuota.status === 'pagada') {
    throw new Error('La cuota está pagada. Si querés revertirla, anulá el pago.');
  }

  orThrow(
    await supabase.from('monthly_fees').update({ status: estado }).eq('id', feeId).select('id').single(),
  );

  revalidatePath(RUTA_CUOTAS);
  revalidatePath('/admin');
}

/** Anula la cuota: deja de ser exigible y no cuenta como deuda. */
export async function anularCuota(feeId: string) {
  return ejecutar(() => cambiarEstadoCuota(feeId, 'anulada'), 'Cuota anulada');
}

/** Bonifica la cuota: se le regala al alumno. No genera ingreso. */
export async function bonificarCuota(feeId: string) {
  return ejecutar(() => cambiarEstadoCuota(feeId, 'bonificada'), 'Cuota bonificada');
}

async function cambiarEstadoMatricula(feeId: string, estado: 'anulada' | 'bonificada') {
  await assertAdmin();

  const supabase = await createClient();
  const fila = orThrow(
    await supabase.from('registration_fees').select('status').eq('id', feeId).single(),
  );
  if (!fila) throw new Error('La matrícula no existe.');

  if (fila.status === 'pagada') {
    throw new Error('La matrícula está pagada. Si querés revertirla, anulá el pago.');
  }

  orThrow(
    await supabase
      .from('registration_fees')
      .update({ status: estado, is_exempt: estado === 'bonificada' })
      .eq('id', feeId)
      .select('id')
      .single(),
  );

  revalidatePath(RUTA_MATRICULAS);
  revalidatePath('/admin');
}

export async function anularMatricula(feeId: string) {
  return ejecutar(() => cambiarEstadoMatricula(feeId, 'anulada'), 'Matrícula anulada');
}

export async function bonificarMatricula(feeId: string) {
  return ejecutar(() => cambiarEstadoMatricula(feeId, 'bonificada'), 'Matrícula bonificada');
}

// ── Anulación de un pago ya registrado ──────────────────────────────────────

/**
 * Anula un pago. La base genera el movimiento de REVERSO (el original nunca se
 * borra: el libro mayor no se edita) y devuelve la cuota a impaga.
 */
export async function anularPago(paymentId: string, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaAnulacion.parse(datos);

      const supabase = await createClient();
      orThrow(await supabase.rpc('void_payment', { p_payment_id: paymentId, p_reason: v.motivo }));

      revalidarDinero();
    },
    'Pago anulado. Se asentó el reverso en la caja y la cuota volvió a quedar impaga.',
  );
}

// ── Comprobantes de transferencia ───────────────────────────────────────────

/** Aprueba el comprobante: cobra la cuota (o la matrícula) contra la caja elegida. */
export async function aprobarComprobante(proofId: string, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaAprobacion.parse(datos);

      const supabase = await createClient();
      orThrow(
        await supabase.rpc('approve_payment_proof', {
          p_proof_id: proofId,
          p_cash_account_id: v.cash_account_id,
          p_method_id: v.method_id || undefined,
        }),
      );

      revalidarDinero();
    },
    'Comprobante aprobado. La cuota quedó pagada y el alumno ya fue notificado.',
  );
}

/** Rechaza el comprobante con un motivo. La cuota vuelve a quedar impaga. */
export async function rechazarComprobante(proofId: string, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaRechazo.parse(datos);

      const supabase = await createClient();
      orThrow(
        await supabase.rpc('reject_payment_proof', { p_proof_id: proofId, p_reason: v.motivo }),
      );

      revalidatePath(RUTA_COMPROBANTES);
      revalidatePath(RUTA_CUOTAS);
      revalidatePath(RUTA_MATRICULAS);
      revalidatePath('/admin');
    },
    'Comprobante rechazado. El alumno recibió el motivo.',
  );
}
