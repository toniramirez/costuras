'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import {
  esquemaClase,
  esquemaEdicion,
  esquemaMarca,
  esquemaMarcarTodos,
} from '@/lib/validations/attendance';

const RUTA = '/admin/asistencia';
const RUTA_HISTORIAL = '/admin/asistencia/historial';
const RUTA_RECUPERACIONES = '/admin/recuperaciones';

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Crea u obtiene la clase de ese grupo en esa fecha.
 *
 * La unicidad la garantiza la base (unique en group_id, session_date). Buscamos
 * primero para no pisar `created_by` ni los horarios de una clase que ya existe,
 * y creamos con `upsert(onConflict)` para que dos personas tomando asistencia a
 * la vez no puedan duplicarla.
 */
async function asegurarClase(
  supabase: Cliente,
  groupId: string,
  fecha: string,
  actor: string,
): Promise<string> {
  const existente = orThrow(
    await supabase
      .from('class_sessions')
      .select('id')
      .eq('group_id', groupId)
      .eq('session_date', fecha)
      .maybeSingle(),
  );
  if (existente) return existente.id;

  const grupo = orThrow(
    await supabase.from('groups').select('start_time, end_time').eq('id', groupId).single(),
  );
  if (!grupo) throw new Error('El grupo no existe.');

  const creada = orThrow(
    await supabase
      .from('class_sessions')
      .upsert(
        {
          group_id: groupId,
          session_date: fecha,
          start_time: grupo.start_time,
          end_time: grupo.end_time,
          created_by: actor,
        },
        { onConflict: 'group_id,session_date' },
      )
      .select('id')
      .single(),
  );
  if (!creada) throw new Error('No se pudo abrir la clase. Intentá de nuevo.');

  return creada.id;
}

/** Al abrir la planilla: deja la clase creada aunque todavía no se marque a nadie. */
export async function abrirClase(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaClase.parse(datos);

    const supabase = await createClient();
    const id = await asegurarClase(supabase, v.group_id, v.session_date, admin.id);

    revalidatePath(RUTA);
    return { id };
  });
}

/**
 * Marca a un alumno. Un toque = un guardado.
 *
 * Si el alumno vino a recuperar y trae un crédito sin consumir, NO escribimos la
 * asistencia a mano: llamamos a `use_recovery_credit`, que es la que marca el
 * crédito como utilizado y la única que impide usarlo dos veces.
 */
export async function marcarAsistencia(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaMarca.parse(datos);
    const supabase = await createClient();

    if (v.status === 'recuperacion' && v.recovery_credit_id) {
      const credito = orThrow(
        await supabase
          .from('recovery_credits')
          .select('status')
          .eq('id', v.recovery_credit_id)
          .single(),
      );
      if (!credito) throw new Error('El crédito de recuperación no existe.');

      // Si el crédito ya se usó, esta es una corrección del registro: no se
      // vuelve a consumir (la base lo rechazaría) y seguimos por el camino normal.
      if (credito.status === 'disponible' || credito.status === 'reservada') {
        const attendanceId = orThrow(
          await supabase.rpc('use_recovery_credit', {
            p_credit_id: v.recovery_credit_id,
            p_group_id: v.group_id,
            p_date: v.session_date,
          }),
        );

        if (attendanceId && v.observation) {
          orThrow(
            await supabase
              .from('attendance')
              .update({ observation: v.observation })
              .eq('id', attendanceId)
              .select('id')
              .single(),
          );
        }

        revalidatePath(RUTA);
        revalidatePath(RUTA_HISTORIAL);
        revalidatePath(RUTA_RECUPERACIONES);
        return;
      }
    }

    const sessionId = await asegurarClase(supabase, v.group_id, v.session_date, admin.id);

    orThrow(
      await supabase
        .from('attendance')
        .upsert(
          {
            class_session_id: sessionId,
            student_id: v.student_id,
            group_id: v.group_id,
            status: v.status,
            observation: v.observation || null,
            recorded_by: admin.id,
            is_recovery: v.status === 'recuperacion',
            // Se conserva el vínculo con el crédito aunque se corrija el estado:
            // así no se pierde el rastro de por qué ese alumno estaba en la clase.
            recovery_credit_id: v.recovery_credit_id ?? null,
          },
          { onConflict: 'class_session_id,student_id' },
        )
        .select('id')
        .single(),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_HISTORIAL);
  }, 'Asistencia registrada');
}

/**
 * "Marcar todos presentes". El cliente manda SOLO a los que todavía no tienen
 * registro: nunca pisa una ausencia ya cargada.
 */
export async function marcarTodosPresentes(datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const v = esquemaMarcarTodos.parse(datos);

    const supabase = await createClient();
    const sessionId = await asegurarClase(supabase, v.group_id, v.session_date, admin.id);

    orThrow(
      await supabase
        .from('attendance')
        .upsert(
          v.student_ids.map((student_id) => ({
            class_session_id: sessionId,
            student_id,
            group_id: v.group_id,
            status: 'presente' as const,
            recorded_by: admin.id,
            is_recovery: false,
          })),
          { onConflict: 'class_session_id,student_id' },
        )
        .select('id'),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_HISTORIAL);
  }, 'Listo: todos presentes');
}

/** Editar un registro ya hecho, con su observación (desde el historial). */
export async function editarAsistencia(id: string, datos: unknown) {
  return ejecutar(async () => {
    const admin = await assertAdmin();
    const attendanceId = z.uuid().parse(id);
    const v = esquemaEdicion.parse(datos);

    const supabase = await createClient();
    orThrow(
      await supabase
        .from('attendance')
        .update({
          status: v.status,
          observation: v.observation || null,
          recorded_by: admin.id,
        })
        .eq('id', attendanceId)
        .select('id')
        .single(),
    );

    revalidatePath(RUTA);
    revalidatePath(RUTA_HISTORIAL);
  }, 'Registro actualizado');
}
