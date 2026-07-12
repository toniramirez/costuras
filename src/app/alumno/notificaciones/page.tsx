import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, ChevronRight, Mail, MailOpen } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { NotificationList } from '@/components/notifications/notification-list';
import { requireStudent } from '@/lib/auth';
import {
  bandejaDelAlumno,
  contarNotificacionesNoLeidas,
  listarNotificaciones,
} from '@/lib/services/comms';
import { formatDateTime } from '@/lib/format';
import { PRIORIDAD } from '@/lib/labels';

export const metadata: Metadata = { title: 'Notificaciones' };

/**
 * Todo lo que hay para leer, en una sola pantalla.
 *
 * Antes esto estaba partido en dos secciones distintas del menú («Comunicados» y
 * «Notificaciones»), y la alumna tenía que acordarse de mirar las dos. Son la
 * misma cosa desde su lado: cosas que la academia le mandó.
 *
 * Los comunicados van primero porque son los que exigen ser leídos; los avisos
 * automáticos (cuota generada, comprobante aprobado…) van debajo.
 */
export default async function NotificacionesAlumnoPage() {
  const { student } = await requireStudent();

  const [comunicados, notificaciones, noLeidas] = await Promise.all([
    bandejaDelAlumno(student.id),
    listarNotificaciones(),
    contarNotificacionesNoLeidas(),
  ]);

  const comunicadosSinLeer = comunicados.filter((c) => !c.leidoEl).length;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Notificaciones</h1>
        <p className="mt-0.5 text-sm text-muted">Todo lo que la academia te mandó.</p>
      </header>

      {/* ── Comunicados ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <Mail className="size-4" aria-hidden />
          Comunicados
          {comunicadosSinLeer > 0 && <Badge tone="danger">{comunicadosSinLeer} sin leer</Badge>}
        </h2>

        {comunicados.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-surface/50 px-4 py-8 text-center text-sm text-muted">
            No tenés comunicados.
          </p>
        ) : (
          <ul className="space-y-2">
            {comunicados.map((comunicado) => {
              const leido = !!comunicado.leidoEl;

              return (
                <li key={comunicado.id}>
                  <Link
                    href={`/alumno/comunicados/${comunicado.id}`}
                    className={`flex items-start gap-3 rounded-card border p-4 transition-colors ${
                      leido
                        ? 'border-line bg-surface hover:bg-canvas'
                        : 'border-brand/30 bg-brand/5 hover:bg-brand/10'
                    }`}
                  >
                    <span className={leido ? 'text-muted' : 'text-brand'}>
                      {leido ? (
                        <MailOpen className="mt-0.5 size-4" aria-hidden />
                      ) : (
                        <Mail className="mt-0.5 size-4" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm ${leido ? 'font-medium text-ink' : 'font-semibold text-ink'}`}
                        >
                          {comunicado.subject}
                        </p>
                        {(comunicado.priority === 'alta' || comunicado.priority === 'urgente') && (
                          <Badge tone={PRIORIDAD[comunicado.priority].tone}>
                            {PRIORIDAD[comunicado.priority].label}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{comunicado.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatDateTime(comunicado.sent_at)}
                      </p>
                    </div>

                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Avisos automáticos ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <Bell className="size-4" aria-hidden />
          Avisos
          {noLeidas > 0 && <Badge tone="info">{noLeidas}</Badge>}
        </h2>

        {/* Sin este contenedor, los ítems quedan sueltos sobre el fondo y las
            líneas divisorias flotan en el aire: parece que la lista está cortada. */}
        {notificaciones.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-surface/50 px-4 py-8 text-center text-sm text-muted">
            No tenés avisos.
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <NotificationList items={notificaciones} vacio="No tenés avisos." />
          </div>
        )}
      </section>
    </div>
  );
}
