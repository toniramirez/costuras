'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import { pesosToCents } from '@/lib/format';
import { isMercadoPagoConfigured } from '@/lib/env.server';
import { usosDelMedioDePago } from '@/lib/services/settings-admin';
import {
  esquemaAcademia,
  esquemaArchivos,
  esquemaCuotas,
  esquemaIdentidad,
  esquemaMatricula,
  esquemaMedioPago,
  esquemaMercadoPago,
  esquemaRecibos,
  esquemaRecuperaciones,
} from '@/lib/validations/settings';
import type { TablesUpdate } from '@/lib/supabase/database.types';

const RUTA = '/admin/configuracion';

/**
 * Escritura sobre el singleton `academy_settings` (id = 1).
 *
 * La fila la crea la migración, así que siempre es UPDATE: nunca INSERT. Deja
 * asentado quién tocó la configuración (`updated_by`), que es la mitad del valor
 * de tener auditoría.
 */
async function actualizarConfig(fila: TablesUpdate<'academy_settings'>, actorId: string) {
  const supabase = await createClient();
  orThrow(
    await supabase
      .from('academy_settings')
      .update({ ...fila, updated_by: actorId })
      .eq('id', 1)
      .select('id')
      .single(),
  );
}

/** Campo de texto opcional: '' del formulario → NULL en la base. */
const oNulo = (valor: string | undefined): string | null => valor?.trim() || null;

// ── Academia ────────────────────────────────────────────────────────────────

export async function guardarAcademia(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaAcademia.parse(datos);

    await actualizarConfig(
      {
        academy_name: v.academy_name,
        phone: oNulo(v.phone),
        email: oNulo(v.email),
        address: oNulo(v.address),
      },
      admin.id,
    );

    revalidatePath(RUTA);
    // El nombre se muestra en el encabezado de toda la app.
    revalidatePath('/', 'layout');
  }, 'Datos de la academia guardados');
}

// ── Identidad visual ────────────────────────────────────────────────────────

export async function guardarIdentidad(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaIdentidad.parse(datos);

    await actualizarConfig(
      {
        logo_path: oNulo(v.logo_path),
        isotype_path: oNulo(v.isotype_path),
        primary_color: v.primary_color,
        secondary_color: v.secondary_color,
        accent_color: v.accent_color,
      },
      admin.id,
    );

    revalidatePath(RUTA);
    // Los colores y el logo se inyectan en el layout raíz: hay que refrescarlo
    // entero para que el cambio se vea en todas las pantallas.
    revalidatePath('/', 'layout');
  }, 'Identidad visual guardada');
}

// ── Recibos ─────────────────────────────────────────────────────────────────

export async function guardarRecibos(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaRecibos.parse(datos);

    await actualizarConfig(
      {
        receipt_prefix: v.receipt_prefix,
        receipt_next_number: v.receipt_next_number,
        receipt_footer: oNulo(v.receipt_footer),
        receipt_legal: v.receipt_legal,
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Configuración de recibos guardada');
}

// ── Matrícula ───────────────────────────────────────────────────────────────

export async function guardarMatricula(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaMatricula.parse(datos);

    await actualizarConfig(
      {
        // El formulario trabaja en pesos; la base guarda centavos enteros.
        registration_fee_cents: pesosToCents(v.importe),
        registration_mode: v.registration_mode,
        registration_due_days: v.registration_due_days,
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Configuración de matrícula guardada');
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

export async function guardarCuotas(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaCuotas.parse(datos);

    await actualizarConfig(
      {
        fee_due_day: v.fee_due_day,
        default_charge_mode: v.default_charge_mode,
        bill_january: v.bill_january,
        bill_february: v.bill_february,
        jan_feb_charge_mode: v.jan_feb_charge_mode,
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Configuración de cuotas guardada');
}

// ── Recuperaciones ──────────────────────────────────────────────────────────

export async function guardarRecuperaciones(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaRecuperaciones.parse(datos);

    await actualizarConfig(
      {
        recovery_min_notice_hours: v.recovery_min_notice_hours,
        recovery_validity_days: v.recovery_validity_days,
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Configuración de recuperaciones guardada');
}

// ── Archivos ────────────────────────────────────────────────────────────────

export async function guardarArchivos(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaArchivos.parse(datos);

    await actualizarConfig(
      {
        max_image_mb: v.max_image_mb,
        max_document_mb: v.max_document_mb,
        max_video_mb: v.max_video_mb,
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Límites de archivos guardados');
}

// ── Mercado Pago ────────────────────────────────────────────────────────────

export async function guardarMercadoPago(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaMercadoPago.parse(datos);

    // Sin token en el servidor, activar el interruptor sería mentirle al alumno:
    // vería el botón de pagar y el checkout fallaría. La UI ya lo bloquea; esta
    // es la defensa real, del lado del servidor.
    if (v.mp_enabled && !isMercadoPagoConfigured()) {
      throw new Error(
        'No se puede activar Mercado Pago: falta la variable MERCADOPAGO_ACCESS_TOKEN en el servidor. La app sigue funcionando con pagos manuales.',
      );
    }

    await actualizarConfig(
      {
        mp_enabled: v.mp_enabled,
        mp_public_key: oNulo(v.mp_public_key),
      },
      admin.id,
    );

    revalidatePath(RUTA);
  }, 'Configuración de Mercado Pago guardada');
}

// ── Medios de pago ──────────────────────────────────────────────────────────

export async function guardarMedioDePago(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const v = esquemaMedioPago.parse(datos);
      const supabase = await createClient();

      if (id) {
        // El `code` NO se actualiza: la base busca el medio «mercadopago» por su
        // código para acreditar los pagos que llegan del webhook. Cambiarlo
        // rompería la acreditación automática.
        orThrow(
          await supabase
            .from('payment_methods')
            .update({
              name: v.name,
              is_active: v.is_active,
              requires_proof: v.requires_proof,
              sort_order: v.sort_order,
            })
            .eq('id', id)
            .select('id')
            .single(),
        );
      } else {
        orThrow(
          await supabase
            .from('payment_methods')
            .insert({
              name: v.name,
              code: v.code,
              is_active: v.is_active,
              requires_proof: v.requires_proof,
              sort_order: v.sort_order,
            })
            .select('id')
            .single(),
        );
      }

      revalidatePath(RUTA);
    },
    id ? 'Medio de pago actualizado' : 'Medio de pago creado',
  );
}

export async function alternarMedioDePago(id: string, activar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('payment_methods')
          .update({ is_active: activar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath(RUTA);
    },
    activar ? 'Medio de pago activado' : 'Medio de pago desactivado',
  );
}

/**
 * Solo se elimina si NO lo usó nadie. Con pagos, cuotas o movimientos asociados,
 * borrarlo dejaría huérfano el historial del dinero: en ese caso se desactiva.
 */
export async function eliminarMedioDePago(id: string) {
  return ejecutar(async () => {
    await assertAdmin();

    const usos = await usosDelMedioDePago(id);
    if (usos > 0) {
      throw new Error(
        `No se puede eliminar: hay ${usos} registro(s) usando este medio de pago. Desactivalo en su lugar.`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) throw error;

    revalidatePath(RUTA);
  }, 'Medio de pago eliminado');
}
