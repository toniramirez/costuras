'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BadgePercent,
  CalendarCheck,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Home,
  Images,
  Inbox,
  Layers,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Receipt,
  RefreshCcw,
  Scissors,
  ScrollText,
  Settings,
  Sparkles,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Registro de íconos.
 *
 * Los layouts son SERVER components y este archivo es de CLIENTE. Un componente
 * de ícono es una función, y **las funciones no cruzan el límite servidor→cliente**:
 * pasarlo como prop revienta con
 *   "Functions cannot be passed directly to Client Components".
 *
 * Por eso los ítems viajan con el NOMBRE del ícono (un string, serializable) y
 * la resolución a componente ocurre acá, ya del lado del cliente.
 */
const ICONOS = {
  inicio: LayoutDashboard,
  alumnos: Users,
  grupos: GraduationCap,
  asistencia: CalendarCheck,
  recuperaciones: RefreshCcw,
  cuotas: Receipt,
  comprobantes: FileCheck2,
  cajas: Wallet,
  movimientos: ArrowLeftRight,
  proyectos: Scissors,
  talleres: Sparkles,
  comunicados: Megaphone,
  novedades: Newspaper,
  modalidades: Layers,
  tarifas: BadgePercent,
  configuracion: Settings,
  notificaciones: ClipboardList,
  auditoria: ScrollText,
  casa: Home,
  galeria: Images,
  bandeja: Inbox,
  perfil: User,
} as const;

export type IconName = keyof typeof ICONOS;

/** Una pantalla concreta. Vive como pestaña dentro de un área. */
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

/**
 * Un ÁREA del panel: lo que se ve en el menú.
 *
 * El menú lista áreas, no pantallas. Cada área abre en su primera pestaña
 * (`href`) y sus `paginas` aparecen como pestañas arriba del contenido.
 *
 * Máximo CINCO áreas: son las que entran en la barra inferior del celular sin
 * un menú «Más» escondido detrás de un botón. Si algún día hacen falta seis,
 * el problema no es la barra: es que sobra un área.
 */
export type NavArea = {
  href: string;
  label: string;
  icon: IconName;
  /** Las pestañas del área. Sin `paginas`, el área es una pantalla sola. */
  paginas?: NavItem[];
};

const MAX_AREAS = 5;

function estaActivo(pathname: string, href: string): boolean {
  // Las raíces (/admin, /alumno) solo se marcan en coincidencia exacta: si no,
  // quedarían encendidas en todas las pantallas del panel.
  if (href === '/admin' || href === '/alumno') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** El área a la que pertenece la pantalla actual (o null si ninguna). */
function areaActiva(pathname: string, areas: NavArea[]): NavArea | null {
  return (
    areas.find(
      (a) =>
        estaActivo(pathname, a.href) ||
        (a.paginas ?? []).some((p) => estaActivo(pathname, p.href)),
    ) ?? null
  );
}

/**
 * Barra lateral (escritorio): solo las áreas. Las pestañas van arriba.
 *
 * El área activa no se «pinta»: se cose. Un hilo vertical se tensa sobre el
 * borde izquierdo (escala desde el centro) y el ícono se corre un pelo hacia
 * adentro, como si el hilo tirara de él.
 */
export function SideNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activa = areaActiva(pathname, areas);

  return (
    <nav aria-label="Navegación" className="space-y-1">
      {areas.slice(0, MAX_AREAS).map((area) => {
        const Icono = ICONOS[area.icon];
        const activo = area === activa;

        return (
          <Link
            key={area.href}
            href={area.href}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5',
              'text-sm font-medium transition-all duration-300 ease-[var(--ease-tela)]',
              activo
                ? 'bg-brand/10 text-brand'
                : 'text-muted hover:bg-line/40 hover:text-ink',
            )}
          >
            {/* El hilo del costado. Siempre está en el DOM: si apareciera y
                desapareciera, no habría nada que animar entre un estado y otro. */}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand',
                'origin-center transition-transform duration-300 ease-[var(--ease-tela)]',
                activo ? 'scale-y-100' : 'scale-y-0',
              )}
            />

            <Icono
              className={cn(
                'size-[18px] shrink-0 transition-transform duration-300 ease-[var(--ease-tela)]',
                activo ? 'translate-x-0.5' : 'group-hover:translate-x-0.5',
              )}
            />
            <span className="flex-1 truncate">{area.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Barra inferior fija (celular): las mismas áreas, en el mismo orden.
 *
 * El área activa lleva una puntada arriba del ícono, y el ícono se levanta un
 * píxel. Es el mismo gesto que en la barra lateral —el hilo que se tensa—, solo
 * que acostado: en el celular la barra es horizontal, así que la puntada corre
 * a lo ancho.
 */
export function BottomNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activa = areaActiva(pathname, areas);

  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch">
        {areas.slice(0, MAX_AREAS).map((area) => {
          const Icono = ICONOS[area.icon];
          const activo = area === activa;

          return (
            <li key={area.href} className="flex-1">
              <Link
                href={area.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2',
                  'text-[11px] font-medium transition-colors duration-300',
                  activo ? 'text-brand' : 'text-muted',
                )}
              >
                {/* La puntada de arriba: se tensa desde el centro. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand',
                    'origin-center transition-transform duration-300 ease-[var(--ease-tela)]',
                    activo ? 'scale-x-100' : 'scale-x-0',
                  )}
                />

                <Icono
                  className={cn(
                    'size-5 transition-transform duration-300 ease-[var(--ease-tela)]',
                    activo && '-translate-y-px scale-110',
                  )}
                />
                <span className="w-full truncate px-0.5 text-center">{area.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Las pestañas del área actual, arriba del contenido.
 *
 * Es el segundo (y último) nivel de navegación: a la izquierda, en qué área
 * estoy; arriba, qué pantalla del área estoy mirando. No hay un tercer nivel.
 *
 * No renderiza nada si el área no tiene pestañas: el panel del alumno, por
 * ejemplo, es todo de un solo nivel.
 */
export function SubNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const area = areaActiva(pathname, areas);
  const paginas = area?.paginas ?? [];

  if (!area || paginas.length < 2) return null;

  return (
    <div className="border-b border-line bg-surface/90 backdrop-blur-md">
      <nav
        aria-label={`Secciones de ${area.label}`}
        className="no-scrollbar flex gap-1 overflow-x-auto px-2 sm:px-4"
      >
        {paginas.map((pagina) => {
          const Icono = ICONOS[pagina.icon];
          const activo = estaActivo(pathname, pagina.href);

          return (
            <Link
              key={pagina.href}
              href={pagina.href}
              aria-current={activo ? 'page' : undefined}
              // `hilo-subraya` (globals.css) tensa el subrayado desde el centro
              // hacia los costados en vez de encenderlo de golpe. El estado va
              // en un data-attribute porque la animación es del pseudo-elemento
              // ::after, y a un ::after no se le puede aplicar una clase.
              data-activo={activo}
              className={cn(
                'hilo-subraya flex shrink-0 items-center gap-2 px-3 py-3',
                'text-sm font-medium transition-colors duration-200',
                activo ? 'text-brand' : 'text-muted hover:text-ink',
              )}
            >
              <Icono className="size-4 shrink-0" aria-hidden />
              {pagina.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
