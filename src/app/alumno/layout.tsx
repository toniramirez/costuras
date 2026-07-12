import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import type { NavArea } from '@/components/layout/nav';
import { requireStudent } from '@/lib/auth';

/**
 * Menú de la alumna. CUATRO ítems. Y punto.
 *
 * La primera versión tenía diez, agrupados en «Mi cursada» y «La academia».
 * Era un sistema de gestión disfrazado de portal: la alumna no viene a
 * administrar su cursada, viene a ver qué hay de nuevo y a coser.
 *
 * Lo que se movió:
 *   · Novedades y talleres  -> al Inicio (es lo que abre al entrar)
 *   · Comunicados           -> a Notificaciones (todo lo que hay que leer, junto)
 *   · Pagos, asistencia y recuperaciones -> fuera del menú
 *
 * Las pantallas de pagos/asistencia/recuperaciones siguen en el código y
 * funcionando: si mañana se quieren devolver, es agregar una línea acá.
 */
const AREAS: NavArea[] = [
  { href: '/alumno', label: 'Inicio', icon: 'casa' },
  { href: '/alumno/proyectos', label: 'Mis proyectos', icon: 'proyectos' },
  { href: '/alumno/notificaciones', label: 'Notificaciones', icon: 'bandeja' },
  { href: '/alumno/perfil', label: 'Mi perfil', icon: 'perfil' },
];

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const { profile, student } = await requireStudent();

  if (profile.must_change_password) redirect('/nueva-clave');

  return (
    <AppShell areas={AREAS} userName={`${student.first_name} ${student.last_name}`}>
      {children}
    </AppShell>
  );
}
