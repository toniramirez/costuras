import type { Metadata } from 'next';

import { NotificationsPanel } from '@/components/notifications/notifications-panel';
import { contarNotificacionesNoLeidas, listarNotificaciones } from '@/lib/services/comms';

export const metadata: Metadata = { title: 'Notificaciones' };

/**
 * Las notificaciones de la administración (`audience = 'admin'`).
 * La RLS ya filtra: no hace falta pedirlo en la consulta.
 */
export default async function NotificacionesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;

  const [notificaciones, noLeidas] = await Promise.all([
    listarNotificaciones(estado === 'no_leidas'),
    contarNotificacionesNoLeidas(),
  ]);

  return (
    <NotificationsPanel
      notificaciones={notificaciones}
      noLeidas={noLeidas}
      description="Comprobantes a revisar, cuotas vencidas, cupos completos e inscripciones a talleres."
    />
  );
}
