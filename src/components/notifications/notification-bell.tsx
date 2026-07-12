'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { marcarTodasNotificacionesLeidas } from '@/app/actions/comms';
import { cn } from '@/lib/utils';
import { NotificationList, type Notificacion } from './notification-list';

/**
 * Campanita con el contador de no leídas. Lista para poner en el encabezado:
 *
 *   import { NotificationBell } from '@/components/notifications/notification-bell';
 *   <NotificationBell />
 *
 * No necesita props: se trae sus datos sola y la RLS decide cuáles le tocan (la
 * administradora ve las de `audience='admin'`; el alumno, las suyas). El enlace
 * «Ver todas» apunta al panel que corresponde según la ruta.
 *
 * Se refresca al volver a la pestaña y cada minuto: la base no tiene Realtime
 * habilitado, y una campanita que miente es peor que una que tarda un minuto.
 */

const CADA_UN_MINUTO = 60_000;

export function NotificationBell({
  /** Contador ya calculado en el servidor, para que no parpadee al cargar. */
  initialUnread = 0,
  /**
   * Hacia dónde se abre el panel.
   *
   * 'derecha' (por defecto): el panel se alinea a la derecha de la campanita y
   * crece hacia la IZQUIERDA. Sirve cuando la campanita está arriba a la derecha
   * (el encabezado del celular).
   *
   * 'izquierda': crece hacia la DERECHA. Es obligatorio en la barra lateral del
   * escritorio: ahí la campanita está a ~240 px del borde y el panel mide 320 px,
   * así que abriéndose a la izquierda se sale de la pantalla y queda cortado.
   */
  align = 'derecha',
  className,
}: {
  initialUnread?: number;
  align?: 'izquierda' | 'derecha';
  className?: string;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(initialUnread);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const rutaPanel = pathname.startsWith('/admin')
    ? '/admin/notificaciones'
    : '/alumno/notificaciones';

  // El estado se toca dentro del `then`, nunca en el cuerpo del efecto: es la
  // forma correcta de sincronizarse con algo externo (acá, la base).
  const cargar = useCallback(() => {
    const supabase = createClient();

    return Promise.all([
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false),
    ]).then(([lista, cuenta]) => {
      setItems(lista.data ?? []);
      setNoLeidas(cuenta.count ?? 0);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    cargar();

    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    const reloj = setInterval(alVolver, CADA_UN_MINUTO);
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;

    const alClic = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  async function marcarTodas() {
    setMarcando(true);
    const r = await marcarTodasNotificacionesLeidas();
    setMarcando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    await cargar();
  }

  return (
    <div ref={contenedor} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) cargar();
        }}
        aria-expanded={abierto}
        aria-label={
          noLeidas > 0
            ? `Notificaciones: ${noLeidas} sin leer`
            : 'Notificaciones'
        }
        className="relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-line/40 hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {noLeidas > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className={cn(
            'absolute top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-line bg-surface shadow-xl',
            align === 'izquierda' ? 'left-0' : 'right-0',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notificaciones</h2>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                disabled={marcando}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-50"
              >
                {marcando ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  <CheckCheck className="size-3.5" aria-hidden />
                )}
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {cargando ? (
              <div className="flex justify-center py-8 text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
              </div>
            ) : (
              <NotificationList
                items={items}
                vacio="Cuando pase algo importante, te avisamos acá."
                onLeida={(id) => {
                  setItems((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
                  );
                  setNoLeidas((n) => Math.max(0, n - 1));
                  setAbierto(false);
                }}
              />
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5 text-center">
            <Link
              href={rutaPanel}
              onClick={() => setAbierto(false)}
              className="text-xs font-medium text-brand hover:underline"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
