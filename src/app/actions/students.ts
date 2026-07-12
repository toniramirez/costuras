'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { addDays, format, parseISO } from 'date-fns';

import { assertAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ejecutar, orThrow } from '@/lib/action-result';
import { esquemaAlumno, esquemaAlumnoEdicion, esquemaBaja } from '@/lib/validations/students';
import { existeAlumnoConCorreo } from '@/lib/services/students';
import { getSettings } from '@/lib/settings';
import { formatDate, pesosToCents, todayISO } from '@/lib/format';

const RUTA = '/admin/alumnos';

/** Refresca el listado, la ficha y las pantallas donde cambia la ocupación. */
function revalidar(id?: string) {
  revalidatePath(RUTA);
  if (id) revalidatePath(`${RUTA}/${id}`);
  revalidatePath('/admin/grupos');
}

/**
 * Igual que `orThrow`, pero además afirma que la fila existe.
 *
 * Supabase tipa `data` como `T | null` incluso con `.single()`. Cuando no hubo
 * error, la fila está: esto lo dice una sola vez, en vez de sembrar `!` por todo
 * el archivo.
 */
function filaDe<T>(respuesta: { data: T; error: unknown }): NonNullable<T> {
  const fila = orThrow(respuesta);
  if (fila == null) throw new Error('No encontramos el registro.');
  return fila;
}

/**
 * Contraseña temporal, legible por teléfono.
 *
 * Sin caracteres ambiguos (0/O, 1/l/I): la administradora se la va a dictar al
 * alumno. 12 caracteres de un alfabeto de 55 ≈ 69 bits de entropía, y de todas
 * formas el alumno está obligado a cambiarla en el primer ingreso
 * (`must_change_password`).
 */
function claveTemporal(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => alfabeto[b % alfabeto.length]).join('');
}

/** Los errores de Auth vienen en inglés: acá se traducen a algo presentable. */
function errorDeAuth(mensaje: string, porDefecto: string): Error {
  const m = mensaje.toLowerCase();
  if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
    return new Error('Ya existe un usuario con ese correo.');
  }
  if (m.includes('invalid') && m.includes('email')) {
    return new Error('El correo no es válido.');
  }
  return new Error(porDefecto);
}

/** El día del que arranca el historial: cuándo empieza a cursar, si no, cuándo se inscribió. */
function desdeCuando(startDate: string | undefined, enrollmentDate: string): string {
  return startDate || enrollmentDate;
}

export type AlumnoCreado = {
  id: string;
  email: string;
  /** Se muestra UNA sola vez: no queda guardada en ningún lado. */
  claveTemporal: string;
  /** Importe de la matrícula generada, en centavos. `null` si no correspondía. */
  matriculaCents: number | null;
};

/**
 * Alta de alumno.
 *
 * Hace cuatro cosas que van juntas:
 *   1. Crea el USUARIO de Auth con una contraseña temporal (el alumno la cambia
 *      al entrar). El rol siempre queda 'alumno': lo fuerza el trigger de la
 *      base, jamás sale de los metadatos que manda el cliente.
 *   2. Crea la FICHA y abre el historial de grupo y de tarifa (con el importe
 *      congelado como instantánea).
 *   3. Registra la INSCRIPCIÓN con el modo de cobro del primer mes: es lo que
 *      lee `fee_amount_for_period` cuando se generan las cuotas.
 *   4. Emite la MATRÍCULA si la academia cobra una y el alumno no está exento.
 *
 * Como no hay transacción entre Auth y la base, si algo falla después de crear
 * el usuario se deshace todo: no dejamos cuentas huérfanas que después impidan
 * volver a dar de alta a la misma persona.
 */
export async function crearAlumno(datos: unknown) {
  return ejecutar<AlumnoCreado>(async () => {
    const admin = await assertAdmin();
    const v = esquemaAlumno.parse(datos);

    const email = v.email.trim().toLowerCase();
    const nombreCompleto = `${v.first_name} ${v.last_name}`.trim();

    if (await existeAlumnoConCorreo(email)) {
      throw new Error('Ya hay un alumno con ese correo.');
    }

    // 1 · Usuario de Auth. Es el único caso donde hace falta service_role.
    //
    // `email_confirm: true` porque a este usuario lo crea la academia, no se
    // registra solo: no hay a quién mandarle un correo de confirmación.
    // El rol NO se manda: el trigger de la base lo fuerza a 'alumno' siempre.
    const clave = claveTemporal();
    const supabaseAdmin = createAdminClient();

    const { data: creado, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: clave,
      email_confirm: true,
      user_metadata: {
        full_name: nombreCompleto,
        phone: v.phone || null,
        must_change_password: true,
      },
    });

    if (errorAuth || !creado.user) {
      throw errorDeAuth(
        errorAuth?.message ?? '',
        'No se pudo crear el usuario del alumno. Intentá nuevamente.',
      );
    }

    const profileId = creado.user.id;
    const supabase = await createClient();
    let studentId: string | null = null;

    try {
      // 2 · Ficha del alumno.
      const alumno = filaDe(
        await supabase
          .from('students')
          .insert({
            profile_id: profileId,
            first_name: v.first_name,
            last_name: v.last_name,
            dni: v.dni || null,
            email,
            phone: v.phone || null,
            birth_date: v.birth_date || null,
            address: v.address || null,
            emergency_contact: v.emergency_contact || null,
            emergency_phone: v.emergency_phone || null,
            enrollment_date: v.enrollment_date,
            start_date: v.start_date || null,
            // El <select> del día manda texto ('' = sin día fijo). '0' es domingo.
            fixed_weekday: v.fixed_weekday ? Number(v.fixed_weekday) : null,
            fixed_time: v.fixed_time || null,
            group_id: v.group_id || null,
            plan_id: v.plan_id || null,
            rate_id: v.rate_id || null,
            status: v.status,
            registration_fee_exempt: v.registration_fee_exempt,
            admin_notes: v.admin_notes || null,
          })
          .select('id')
          .single(),
      );
      studentId = alumno.id;

      const desde = desdeCuando(v.start_date, v.enrollment_date);

      // Historial de grupo: se abre la asignación (sin `to_date`).
      if (v.group_id) {
        orThrow(
          await supabase
            .from('student_groups')
            .insert({
              student_id: alumno.id,
              group_id: v.group_id,
              from_date: desde,
              note: 'Alta del alumno',
            })
            .select('id')
            .single(),
        );
      }

      // Historial de tarifa: guarda una INSTANTÁNEA del importe. Si mañana la
      // tarifa cambia de precio, este registro sigue diciendo cuánto pagaba.
      if (v.rate_id) {
        const tarifa = filaDe(
          await supabase.from('rates').select('amount_cents').eq('id', v.rate_id).single(),
        );
        orThrow(
          await supabase
            .from('student_rates')
            .insert({
              student_id: alumno.id,
              rate_id: v.rate_id,
              amount_cents: tarifa.amount_cents,
              from_date: desde,
              note: 'Alta del alumno',
            })
            .select('id')
            .single(),
        );
      }

      // 3 · Inscripción: define cómo se cobra el primer mes (ingreso a mitad de mes).
      const importeCents =
        v.importe_primer_mes === undefined ? null : pesosToCents(v.importe_primer_mes);

      const inscripcion = filaDe(
        await supabase
          .from('enrollments')
          .insert({
            student_id: alumno.id,
            enrolled_at: v.enrollment_date,
            start_date: v.start_date || null,
            plan_id: v.plan_id || null,
            rate_id: v.rate_id || null,
            charge_mode: v.charge_mode,
            first_period_year: v.first_period_year,
            first_period_month: v.first_period_month,
            prorated_amount_cents: v.charge_mode === 'proporcional' ? importeCents : null,
            manual_amount_cents: v.charge_mode === 'manual' ? importeCents : null,
            notes: v.admin_notes || null,
            created_by: admin.id,
          })
          .select('id')
          .single(),
      );

      // 4 · Matrícula, si la academia cobra una y el alumno no está exento.
      const settings = await getSettings();
      const matriculaCents = Number(settings?.registration_fee_cents ?? 0);
      const emiteMatricula = matriculaCents > 0 && !v.registration_fee_exempt;

      if (emiteMatricula) {
        const emitida = todayISO();
        const dias = settings?.registration_due_days ?? 0;
        orThrow(
          await supabase
            .from('registration_fees')
            .insert({
              student_id: alumno.id,
              enrollment_id: inscripcion.id,
              amount_cents: matriculaCents,
              issued_date: emitida,
              due_date: format(addDays(parseISO(emitida), dias), 'yyyy-MM-dd'),
              status: 'pendiente',
              is_exempt: false,
            })
            .select('id')
            .single(),
        );
      }

      revalidar(alumno.id);

      return {
        id: alumno.id,
        email,
        claveTemporal: clave,
        matriculaCents: emiteMatricula ? matriculaCents : null,
      };
    } catch (error) {
      // Se deshace todo: primero la ficha (arrastra historial, inscripción y
      // matrícula por `on delete cascade`) y después el usuario de Auth.
      if (studentId) await supabase.from('students').delete().eq('id', studentId);
      await supabaseAdmin.auth.admin.deleteUser(profileId);
      throw error;
    }
  }, 'Alumno creado');
}

/**
 * Edición de la ficha.
 *
 * Los cambios de grupo y de tarifa NO se pisan: se cierra la fila abierta del
 * historial (`to_date`) y se abre una nueva. La tarifa guarda una instantánea
 * del importe, así el historial no miente cuando el precio cambie.
 */
export async function actualizarAlumno(id: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaAlumnoEdicion.parse(datos);

    const email = v.email.trim().toLowerCase();
    const nombreCompleto = `${v.first_name} ${v.last_name}`.trim();
    const hoy = todayISO();

    const supabase = await createClient();
    const actual = filaDe(
      await supabase
        .from('students')
        .select('id, group_id, rate_id, profile_id, email')
        .eq('id', id)
        .single(),
    );

    if (await existeAlumnoConCorreo(email, id)) {
      throw new Error('Ya hay otro alumno con ese correo.');
    }

    // El correo es la llave con la que el alumno entra: si cambia, tiene que
    // cambiar también en Auth. Va primero: si falla, no tocamos nada más.
    const cambioCorreo = email !== (actual.email ?? '').toLowerCase();
    if (cambioCorreo && actual.profile_id) {
      const supabaseAdmin = createAdminClient();
      const { error } = await supabaseAdmin.auth.admin.updateUserById(actual.profile_id, {
        email,
        email_confirm: true,
      });
      if (error) throw errorDeAuth(error.message, 'No se pudo cambiar el correo del usuario.');
    }

    const grupoNuevo = v.group_id || null;
    const tarifaNueva = v.rate_id || null;

    // Cambio de grupo: se cierra la asignación abierta y se abre la nueva.
    if (grupoNuevo !== actual.group_id) {
      orThrow(
        await supabase
          .from('student_groups')
          .update({ to_date: hoy })
          .eq('student_id', id)
          .is('to_date', null)
          .select('id'),
      );
      if (grupoNuevo) {
        orThrow(
          await supabase
            .from('student_groups')
            .insert({
              student_id: id,
              group_id: grupoNuevo,
              from_date: hoy,
              note: 'Cambio de grupo',
            })
            .select('id')
            .single(),
        );
      }
    }

    // Cambio de tarifa: ídem, con la instantánea del importe nuevo.
    if (tarifaNueva !== actual.rate_id) {
      orThrow(
        await supabase
          .from('student_rates')
          .update({ to_date: hoy })
          .eq('student_id', id)
          .is('to_date', null)
          .select('id'),
      );
      if (tarifaNueva) {
        const tarifa = filaDe(
          await supabase.from('rates').select('amount_cents').eq('id', tarifaNueva).single(),
        );
        orThrow(
          await supabase
            .from('student_rates')
            .insert({
              student_id: id,
              rate_id: tarifaNueva,
              amount_cents: tarifa.amount_cents,
              from_date: hoy,
              note: 'Cambio de tarifa',
            })
            .select('id')
            .single(),
        );
      }
    }

    orThrow(
      await supabase
        .from('students')
        .update({
          first_name: v.first_name,
          last_name: v.last_name,
          dni: v.dni || null,
          email,
          phone: v.phone || null,
          birth_date: v.birth_date || null,
          address: v.address || null,
          emergency_contact: v.emergency_contact || null,
          emergency_phone: v.emergency_phone || null,
          enrollment_date: v.enrollment_date,
          start_date: v.start_date || null,
          fixed_weekday: v.fixed_weekday ? Number(v.fixed_weekday) : null,
          fixed_time: v.fixed_time || null,
          group_id: grupoNuevo,
          plan_id: v.plan_id || null,
          rate_id: tarifaNueva,
          registration_fee_exempt: v.registration_fee_exempt,
          admin_notes: v.admin_notes || null,
        })
        .eq('id', id)
        .select('id')
        .single(),
    );

    // El perfil acompaña a la ficha: es lo que ve el alumno cuando entra.
    if (actual.profile_id) {
      orThrow(
        await supabase
          .from('profiles')
          .update({ full_name: nombreCompleto, email, phone: v.phone || null })
          .eq('id', actual.profile_id)
          .select('id')
          .single(),
      );
    }

    revalidar(id);
  }, 'Alumno actualizado');
}

/**
 * Pausa: el alumno deja de cursar por un tiempo.
 * No se le generan cuotas (`fee_amount_for_period` solo factura a los activos) y
 * su lugar en el grupo queda libre (así lo calcula la vista `group_occupancy`).
 */
export async function pausarAlumno(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();
    orThrow(
      await supabase.from('students').update({ status: 'pausado' }).eq('id', id).select('id').single(),
    );
    revalidar(id);
  }, 'Alumno pausado');
}

export type ClaveRestablecida = {
  email: string;
  /** Se muestra UNA sola vez: no queda guardada en ningún lado. */
  claveTemporal: string;
};

/**
 * Restablecer la contraseña de un alumno, desde su ficha.
 *
 * Es la única recuperación que hay, y es a propósito: el envío de correos no
 * está enganchado, así que un «te mandamos un mail» sería mentirle al alumno.
 * La academia le da una contraseña nueva por donde ya se hablan (teléfono,
 * WhatsApp, en la clase) y listo.
 *
 * Deja al alumno igual que recién creado: contraseña temporal de un solo uso y
 * `must_change_password`, así que la primera pantalla que ve al entrar lo obliga
 * a poner una suya. La clave que se dictó por teléfono se quema en ese momento.
 *
 * Ojo con las DOS escrituras: el trigger que copia `must_change_password` desde
 * los metadatos de Auth corre solo en el ALTA del usuario (`on insert`), no en
 * los updates. Si solo tocáramos Auth, `profiles` seguiría diciendo que ya
 * cambió la clave y no se le pediría cambiarla. Por eso la fila se actualiza
 * también acá, a mano.
 */
export async function restablecerClaveAlumno(id: string) {
  return ejecutar<ClaveRestablecida>(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const alumno = filaDe(
      await supabase.from('students').select('id, email, profile_id').eq('id', id).single(),
    );

    if (!alumno.profile_id) {
      throw new Error('Esta ficha no tiene usuario: el alumno no puede entrar al sistema.');
    }

    const clave = claveTemporal();

    // 1 · La contraseña, con service_role (es la única forma de cambiársela a otro).
    const supabaseAdmin = createAdminClient();
    const { error: errorAuth } = await supabaseAdmin.auth.admin.updateUserById(alumno.profile_id, {
      password: clave,
    });
    if (errorAuth) {
      throw errorDeAuth(errorAuth.message, 'No se pudo cambiar la contraseña. Intentá nuevamente.');
    }

    // 2 · La marca que lo obliga a cambiarla al entrar.
    orThrow(
      await supabase
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', alumno.profile_id)
        .select('id')
        .single(),
    );

    revalidar(id);
    return { email: alumno.email ?? '', claveTemporal: clave };
  }, 'Contraseña restablecida');
}

/**
 * Reactivación: vuelve a estar activo y se le vuelven a generar cuotas.
 * Si volvió de una baja y conserva grupo o tarifa, se reabre el historial.
 */
export async function reactivarAlumno(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const hoy = todayISO();

    const actual = filaDe(
      await supabase.from('students').select('id, group_id, rate_id').eq('id', id).single(),
    );

    orThrow(
      await supabase
        .from('students')
        .update({ status: 'activo', archived_at: null })
        .eq('id', id)
        .select('id')
        .single(),
    );

    if (actual.group_id) {
      const abiertas = filaDe(
        await supabase
          .from('student_groups')
          .select('id')
          .eq('student_id', id)
          .is('to_date', null)
          .limit(1),
      );
      if (abiertas.length === 0) {
        orThrow(
          await supabase
            .from('student_groups')
            .insert({
              student_id: id,
              group_id: actual.group_id,
              from_date: hoy,
              note: 'Reactivación',
            })
            .select('id')
            .single(),
        );
      }
    }

    if (actual.rate_id) {
      const abiertas = filaDe(
        await supabase
          .from('student_rates')
          .select('id')
          .eq('student_id', id)
          .is('to_date', null)
          .limit(1),
      );
      if (abiertas.length === 0) {
        const tarifa = filaDe(
          await supabase.from('rates').select('amount_cents').eq('id', actual.rate_id).single(),
        );
        orThrow(
          await supabase
            .from('student_rates')
            .insert({
              student_id: id,
              rate_id: actual.rate_id,
              amount_cents: tarifa.amount_cents,
              from_date: hoy,
              note: 'Reactivación',
            })
            .select('id')
            .single(),
        );
      }
    }

    revalidar(id);
  }, 'Alumno reactivado');
}

/**
 * Baja LÓGICA: `status = 'baja'` + `archived_at`.
 *
 * Nunca se borra un alumno con historia: sus cuotas, pagos, recibos y asistencia
 * son el registro contable de la academia. La baja lo saca de circulación (no se
 * le generan cuotas, libera el lugar en el grupo) y cierra su historial.
 */
export async function darDeBajaAlumno(id: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaBaja.parse(datos);

    const supabase = await createClient();
    const hoy = todayISO();

    const actual = filaDe(
      await supabase.from('students').select('admin_notes').eq('id', id).single(),
    );

    // El motivo queda escrito en la ficha: dentro de un año nadie se acuerda.
    const notas = v.motivo
      ? [actual.admin_notes, `Baja del ${formatDate(hoy)}: ${v.motivo}`].filter(Boolean).join('\n')
      : actual.admin_notes;

    orThrow(
      await supabase
        .from('students')
        .update({ status: 'baja', archived_at: new Date().toISOString(), admin_notes: notas })
        .eq('id', id)
        .select('id')
        .single(),
    );

    // Se cierran las asignaciones abiertas: el historial dice hasta cuándo cursó.
    orThrow(
      await supabase
        .from('student_groups')
        .update({ to_date: hoy })
        .eq('student_id', id)
        .is('to_date', null)
        .select('id'),
    );
    orThrow(
      await supabase
        .from('student_rates')
        .update({ to_date: hoy })
        .eq('student_id', id)
        .is('to_date', null)
        .select('id'),
    );

    revalidar(id);
  }, 'Alumno dado de baja');
}
