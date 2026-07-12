'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/data-list';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { marcarTodasNotificacionesLeidas } from '@/app/actions/comms';
import { NotificationList, type Notificacion } from './notification-list';

/**
 * Pantalla completa de notificaciones. La usan `/admin/notificaciones` y
 * `/alumno/notificaciones`: la RLS ya decide qué ve cada uno, así que es el mismo
 * componente.
 */
export function NotificationsPanel({
  notificaciones,
  noLeidas,
  description,
}: {
  notificaciones: Notificacion[];
  noLeidas: number;
  description: string;
}) {
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);

  async function marcarTodas() {
    setMarcando(true);
    const r = await marcarTodasNotificacionesLeidas();
    setMarcando(false);

    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Notificaciones"
        description={description}
        action={
          noLeidas > 0 ? (
            <Button variant="outline" onClick={marcarTodas} loading={marcando}>
              <CheckCheck className="size-4" aria-hidden />
              Marcar todas como leídas
            </Button>
          ) : undefined
        }
      />

      <FiltersBar>
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todas"
          options={[{ value: 'no_leidas', label: 'Sin leer' }]}
        />
      </FiltersBar>

      {/* Sin notificaciones, el EmptyState va suelto: dentro de la tarjeta serían
          dos bordes, uno adentro del otro. */}
      {notificaciones.length === 0 ? (
        <NotificationList items={[]} vacio="Cuando pase algo importante, te avisamos acá." />
      ) : (
        <Card className="overflow-hidden">
          <NotificationList items={notificaciones} />
        </Card>
      )}
    </div>
  );
}
