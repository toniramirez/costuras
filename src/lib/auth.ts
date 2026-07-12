import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';

export type Profile = Tables<'profiles'>;
export type Student = Tables<'students'>;

/**
 * Perfil del usuario autenticado, o null si no hay sesión.
 *
 * Usa `getUser()` (no `getSession()`): getUser valida el token contra Supabase,
 * mientras que getSession se fía de la cookie, que se puede manipular.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile ?? null;
}

/** Exige sesión iniciada. Si no la hay, redirige al login. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/ingresar');
  return profile;
}

/**
 * Exige rol de administradora.
 *
 * Es la puerta de las rutas /admin. No es la única defensa: la RLS de la base
 * bloquea igual cualquier consulta de un alumno, aunque llegue a la pantalla.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== 'admin') redirect('/alumno');
  return profile;
}

/**
 * Igual que requireAdmin pero LANZA en vez de redirigir.
 * Es lo que corresponde dentro de una server action: ahí no queremos una
 * redirección, queremos un ActionResult con el error.
 *
 * No es la única defensa: la RLS de la base bloquea igual cualquier escritura.
 * Esto solo permite fallar temprano y con un mensaje claro.
 */
export async function assertAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    throw new Error('No tenés permiso para hacer esto.');
  }
  return profile;
}

/** Ficha del alumno autenticado. Lanza si no la tiene. */
export async function assertStudent(): Promise<Student> {
  const profile = await getProfile();
  if (!profile) throw new Error('Tu sesión expiró. Volvé a ingresar.');

  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('profile_id', profile.id)
    .single();

  if (!student) throw new Error('Tu usuario no tiene una ficha de alumno asociada.');
  return student;
}

/** Exige rol alumno y devuelve su perfil junto con su ficha. */
export async function requireStudent(): Promise<{ profile: Profile; student: Student }> {
  const profile = await requireProfile();
  if (profile.role === 'admin') redirect('/admin');

  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('profile_id', profile.id)
    .single();

  // Usuario con rol alumno pero sin ficha: es un estado inconsistente que solo
  // puede resolver la administradora.
  if (!student) redirect('/sin-ficha');

  return { profile, student };
}
