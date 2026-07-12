'use client';

import { useRouter } from 'next/navigation';
import { BellOff } from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { marcarNotificacionLeida } from '@/app/actions/comms';
import type { Tables } from '@/lib/supabase/database.types';
import { CLASES_TONO, aspectoDe } from './tipos';

export type Notificacion = Tables<'notifications'>;

/**
 * Listado de notificaciones. Lo usan la campanita y las pantallas completas.
 *
 * Al abrir una: se marca como leída y se navega a su `link` (cada notificación
 * trae la ruta interna que corresponde: la cuota, el comprobante, el taller…).
 */
export function NotificationList({
  items,
  onLeida,
  vacio = 'No tenés notificaciones.',
}: {
  items: Notificacion[];
  /** Aviso para que la campanita actualice su contador sin recargar. */
  onLeida?: (id: string) => void;
  vacio?: string;
}) {
  const router = useRouter();

  async function abrir(n: Notificacion) {
    if (!n.is_read) {
      const r = await marcarNotificacionLeida(n.id);
      if (r.ok) onLeida?.(n.id);
    }

    if (n.link) router.push(n.link);
    else router.refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellOff className="size-5" />}
        title="Todo al día"
        description={vacio}
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((n) => {
        const { icon: Icono, tone } = aspectoDe(n.type);

        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => abrir(n)}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas',
                !n.is_read && 'bg-brand/[0.04]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                  CLASES_TONO[tone],
                )}
              >
                <Icono className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm text-ink',
                      !n.is_read && 'font-semibold',
                    )}
                  >
                    {n.title}
                  </span>
                  {!n.is_read && (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                      aria-label="Sin leer"
                    />
                  )}
                </span>

                {n.body && <span className="mt-0.5 block text-sm text-muted">{n.body}</span>}
                <span className="mt-1 block text-xs text-muted">{formatDateTime(n.created_at)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
