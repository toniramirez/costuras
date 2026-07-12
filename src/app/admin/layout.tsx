import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import type { NavArea } from '@/components/layout/nav';
import { requireAdmin } from '@/lib/auth';

/**
 * Menú de administración: CINCO áreas. Y punto.
 *
 * Antes eran dieciocho pantallas sueltas en una lista, agrupadas con títulos
 * pero todas al mismo nivel: en el celular, catorce de ellas vivían escondidas
 * detrás de un botón «Más». Aprenderse ese menú era aprenderse dieciocho
 * nombres y adivinar en cuál de ellos está la cosa que uno busca.
 *
 * Ahora el menú tiene áreas, no pantallas. Las áreas responden a la pregunta
 * «¿de qué estoy hablando?» —de mis alumnos, de la plata, de lo que les mando—
 * y las pantallas de cada área son pestañas arriba del contenido.
 *
 * Cinco áreas entran enteras en la barra inferior del celular: no hay más menú
 * «Más», no hay nada escondido. Como mucho hay que aprender cinco palabras.
 *
 * Las rutas NO cambiaron: son las mismas de siempre, solo se reordenó la puerta
 * de entrada. Cualquier enlace guardado sigue funcionando.
 *
 * `icon` es el NOMBRE del ícono, no el componente: este archivo es un Server
 * Component y las funciones no cruzan el límite servidor→cliente. La resolución
 * a componente pasa en `nav.tsx` (ver el registro ICONOS ahí).
 */
const AREAS: NavArea[] = [
  // Qué hay que hacer hoy. Es lo primero que se abre al entrar.
  { href: '/admin', label: 'Inicio', icon: 'inicio' },

  // La gente y su cursada. Proyectos entra acá: el cuaderno es del alumno.
  {
    href: '/admin/alumnos',
    label: 'Alumnos',
    icon: 'alumnos',
    paginas: [
      { href: '/admin/alumnos', label: 'Alumnos', icon: 'alumnos' },
      { href: '/admin/grupos', label: 'Grupos', icon: 'grupos' },
      { href: '/admin/asistencia', label: 'Asistencia', icon: 'asistencia' },
      { href: '/admin/recuperaciones', label: 'Recuperaciones', icon: 'recuperaciones' },
      { href: '/admin/proyectos', label: 'Proyectos', icon: 'proyectos' },
    ],
  },

  // Todo lo que es plata, en el orden en que se cobra: emito, reviso, guardo.
  {
    href: '/admin/cuotas',
    label: 'Dinero',
    icon: 'cajas',
    paginas: [
      { href: '/admin/cuotas', label: 'Cuotas', icon: 'cuotas' },
      { href: '/admin/comprobantes', label: 'Comprobantes', icon: 'comprobantes' },
      { href: '/admin/cajas', label: 'Cajas', icon: 'cajas' },
      { href: '/admin/movimientos', label: 'Ingresos y gastos', icon: 'movimientos' },
    ],
  },

  // Lo que sale de la academia hacia los alumnos. Los talleres son eso: algo
  // que se anuncia y a lo que se anotan.
  {
    href: '/admin/comunicados',
    label: 'Avisos',
    icon: 'comunicados',
    paginas: [
      { href: '/admin/comunicados', label: 'Comunicados', icon: 'comunicados' },
      { href: '/admin/novedades', label: 'Novedades', icon: 'novedades' },
      { href: '/admin/talleres', label: 'Talleres', icon: 'talleres' },
    ],
  },

  // Lo que se toca una vez y no se toca más. Al final, como corresponde.
  {
    href: '/admin/configuracion',
    label: 'Ajustes',
    icon: 'configuracion',
    paginas: [
      { href: '/admin/configuracion', label: 'La academia', icon: 'configuracion' },
      { href: '/admin/modalidades', label: 'Modalidades', icon: 'modalidades' },
      { href: '/admin/tarifas', label: 'Tarifas', icon: 'tarifas' },
      { href: '/admin/notificaciones', label: 'Notificaciones', icon: 'notificaciones' },
      { href: '/admin/auditoria', label: 'Auditoría', icon: 'auditoria' },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();

  // Contraseña temporal: no se entra a ningún lado hasta cambiarla.
  if (profile.must_change_password) redirect('/nueva-clave');

  return (
    <AppShell areas={AREAS} userName={profile.full_name || profile.email || 'Administradora'}>
      {children}
    </AppShell>
  );
}
