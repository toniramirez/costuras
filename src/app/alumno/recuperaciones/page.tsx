import type { Metadata } from 'next';
import { CalendarClock, RefreshCcw, Sparkles } from 'lucide-react';

import { StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { requireStudent } from '@/lib/auth';
import { getRecuperaciones, DIAS_POR_VENCER, type Recuperacion } from '@/lib/services/student-portal';
import { ESTADO_RECUPERACION } from '@/lib/labels';
import { formatDate, formatSchedule, formatTimestampAsDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Mis recuperaciones' };

/**
 * Créditos de recuperación. SOLO LECTURA.
 *
 * Reservar y confirmar una recuperación es tarea de la administradora (así lo
 * define la especificación: es ella quien conoce el cupo real del grupo). Acá el
 * alumno ve lo que tiene y hasta cuándo le sirve; la reserva se coordina con la
 * academia.
 */
export default async function RecuperacionesPage() {
  const { student } = await requireStudent();
  const creditos = await getRecuperaciones(student.id);

  const disponibles = creditos.filter((c) => c.status === 'disponible');
  const reservadas = creditos.filter((c) => c.status === 'reservada');
  const porVencer = disponibles.filter((c) => c.porVencer);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Mis recuperaciones"
        description="Las clases que podés recuperar por una ausencia justificada."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Disponibles"
          value={disponibles.length}
          icon={<Sparkles className="size-4" />}
          tone={disponibles.length > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          label="Reservadas"
          value={reservadas.length}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Por vencer"
          value={porVencer.length}
          hint={`En los próximos ${DIAS_POR_VENCER} días`}
          icon={<RefreshCcw className="size-4" />}
          tone={porVencer.length > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {porVencer.length > 0 && (
        <Callout tone="warning" title="Tenés recuperaciones por vencer">
          {porVencer.length === 1
            ? `Una de tus recuperaciones vence el ${formatDate(porVencer[0].expires_at)}. Coordiná con la academia para usarla.`
            : `${porVencer.length} recuperaciones vencen dentro de los próximos ${DIAS_POR_VENCER} días. Coordiná con la academia para usarlas.`}
        </Callout>
      )}

      {disponibles.length > 0 && (
        <Callout tone="info" title="¿Cómo la uso?">
          La reserva la hace la academia: escribile para elegir el día y el grupo donde vas a
          recuperar. Cuando lo confirme, la vas a ver acá como reservada.
        </Callout>
      )}

      {creditos.length === 0 ? (
        <EmptyState
          icon={<RefreshCcw className="size-5" />}
          title="No tenés recuperaciones"
          description="Cuando faltes con aviso y la academia justifique tu ausencia, vas a ver acá el crédito para recuperar la clase."
        />
      ) : (
        <ul className="space-y-2">
          {creditos.map((credito) => (
            <CreditoItem key={credito.id} credito={credito} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreditoItem({ credito }: { credito: Recuperacion }) {
  const disponible = credito.status === 'disponible';

  return (
    <li
      className={cn(
        'rounded-card border bg-surface p-4 shadow-[0_1px_2px_rgba(43,37,34,0.04)]',
        disponible ? 'border-brand/40 ring-1 ring-brand/10' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {credito.reason ?? 'Crédito de recuperación'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Emitido el {formatTimestampAsDate(credito.issued_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge value={credito.status} map={ESTADO_RECUPERACION} />
          {credito.porVencer && <Badge tone="warning">Vence pronto</Badge>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Vence</dt>
          <dd className={cn('text-sm', credito.porVencer ? 'font-medium text-warning' : 'text-ink')}>
            {formatDate(credito.expires_at)}
          </dd>
        </div>

        {credito.status === 'reservada' && (
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Reservada para</dt>
            <dd className="text-sm text-ink">
              {formatDate(credito.reserved_date)}
              {credito.grupo && (
                <span className="block text-xs text-muted">
                  {credito.grupo.name} ·{' '}
                  {formatSchedule(
                    credito.grupo.weekday,
                    credito.grupo.start_time,
                    credito.grupo.end_time,
                  )}
                </span>
              )}
            </dd>
          </div>
        )}

        {credito.status === 'utilizada' && credito.used_at && (
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Usada el</dt>
            <dd className="text-sm text-ink">{formatTimestampAsDate(credito.used_at)}</dd>
          </div>
        )}

        {credito.status === 'cancelada' && credito.cancel_reason && (
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted">Motivo</dt>
            <dd className="text-sm text-ink">{credito.cancel_reason}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}
