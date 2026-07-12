import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';

/**
 * Raíz del dominio.
 *
 * No hay página pública de presentación: quien no tiene sesión va directo al
 * login y quien la tiene va a su panel según el rol.
 */
export default async function Home() {
  const profile = await getProfile();

  if (!profile) redirect('/ingresar');
  redirect(profile.role === 'admin' ? '/admin' : '/alumno');
}
