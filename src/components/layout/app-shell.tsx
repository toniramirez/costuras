import { LogOut } from 'lucide-react';

import { signOutAction } from '@/app/actions/auth';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { contarNotificacionesNoLeidas } from '@/lib/services/comms';
import { getBranding } from '@/lib/settings';
import { BottomNav, SideNav, SubNav, type NavArea } from './nav';

/**
 * Estructura común de los paneles (administración y alumno).
 *
 * Mobile-first: barra inferior en el celular, barra lateral en escritorio.
 *
 * DOS niveles de navegación y no más:
 *   · las ÁREAS (máximo cinco) están siempre a la vista — abajo o a la izquierda;
 *   · las PESTAÑAS del área actual, arriba del contenido.
 * Nada vive detrás de un menú desplegable.
 */
export async function AppShell({
  areas,
  userName,
  children,
}: {
  areas: NavArea[];
  userName: string;
  children: React.ReactNode;
}) {
  // El contador se resuelve en el servidor para que no parpadee al cargar.
  const [{ academyName, logoUrl }, noLeidas] = await Promise.all([
    getBranding(),
    contarNotificacionesNoLeidas(),
  ]);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-4 py-5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-lg object-contain" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-sm font-semibold text-brand">
              {academyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {academyName}
          </span>
          {/* En la barra lateral el panel DEBE abrirse hacia la derecha: la
              campanita está a ~240 px del borde y el panel mide 320 px, así que
              abriéndose a la izquierda se sale de la pantalla. */}
          <NotificationBell initialUnread={noLeidas} align="izquierda" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <SideNav areas={areas} />
        </div>

        <div className="border-t border-line p-3">
          <p className="truncate px-3 pb-2 text-xs text-muted">{userName}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-line/40 hover:text-ink"
            >
              <LogOut className="size-[18px]" aria-hidden />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Encabezado (celular) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-xs font-semibold text-brand">
                {academyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="truncate text-sm font-semibold text-ink">{academyName}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell initialUnread={noLeidas} />
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-line/40 hover:text-ink"
              >
                <LogOut className="size-5" aria-hidden />
              </button>
            </form>
          </div>
        </header>

        {/* Pestañas del área. Se pega abajo del encabezado en el celular (top-14
            ≈ alto del header) y arriba de todo en escritorio, donde no hay header. */}
        <div className="sticky top-[57px] z-20 lg:top-0">
          <SubNav areas={areas} />
        </div>

        {/* pb-24 deja aire para que la barra inferior no tape el contenido. */}
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>

      <BottomNav areas={areas} />
    </div>
  );
}
