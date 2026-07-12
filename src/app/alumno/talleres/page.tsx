import type { Metadata } from 'next';
import { CalendarClock, Clock, MapPin, Users } from 'lucide-react';

import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Callout, EmptyState } from '@/components/ui/states';
import { requireStudent } from '@/lib/auth';
import { listarMisInscripciones, listarTalleresVisibles, type TallerConCupo } from '@/lib/services/workshops';
import { ESTADO_INSCRIPCION, ESTADO_TALLER } from '@/lib/labels';
import { formatDate, formatMoney, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Talleres' };

/**
 * Talleres para el alumno.
 *
 * El alumno NO se auto-inscribe: por especificación, la inscripción la carga la
 * administradora. Por eso acá no hay botón de inscripción — sería un botón que
 * miente. En su lugar, se explica cómo anotarse.
 */
export default async function AlumnoTalleresPage() {
  const { student } = await requireStudent();

  const [talleres, inscripciones] = await Promise.all([
    listarTalleresVisibles(),
    listarMisInscripciones(student.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Talleres</h1>
        <p className="text-sm text-muted">
          Talleres especiales de una sola clase, aparte de tu cursada mensual.
        </p>
      </header>

      <Callout tone="info" title="¿Cómo me anoto?">
        La inscripción la carga la academia. Escribinos o avisanos en clase y te anotamos. Tu lugar
        queda reservado cuando se confirma el pago; si el cupo está completo, pasás a la lista de
        espera por orden de llegada.
      </Callout>

      {/* ── Mis inscripciones ─────────────────────────────────────────────── */}
      {inscripciones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mis inscripciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {inscripciones.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {i.workshops?.name ?? 'Taller'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(i.workshops?.event_date)}
                      {Number(i.amount_cents) > 0 && ` · ${formatMoney(Number(i.amount_cents))}`}
                      {i.status === 'lista_espera' &&
                        i.waitlist_position &&
                        ` · Posición ${i.waitlist_position} en la lista`}
                    </p>
                    {i.status === 'pendiente_pago' && (
                      <p className="mt-0.5 text-xs text-warning">
                        Tu lugar se reserva cuando la academia confirma el pago.
                      </p>
                    )}
                  </div>
                  <StatusBadge value={i.status} map={ESTADO_INSCRIPCION} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Talleres ──────────────────────────────────────────────────────── */}
      {talleres.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-5" />}
          title="No hay talleres publicados"
          description="Cuando la academia publique uno nuevo, lo vas a ver acá."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {talleres.map((t) => (
            <TarjetaTaller key={t.id} taller={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Lugares que quedan de verdad: solo cuentan las inscripciones pagadas. */
function textoCupo(t: TallerConCupo): { texto: string; lleno: boolean } {
  if (t.capacity === 0) return { texto: 'Sin límite de cupo', lleno: false };

  const libres = Math.max(0, t.capacity - t.confirmados);
  if (libres === 0) return { texto: 'Sin lugares · lista de espera', lleno: true };

  return { texto: `${libres} de ${t.capacity} lugares disponibles`, lleno: false };
}

function TarjetaTaller({ taller }: { taller: TallerConCupo }) {
  const cupo = textoCupo(taller);
  const gratuito = Number(taller.price_cents) === 0;

  return (
    <Card className="overflow-hidden">
      {taller.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
        <img
          src={taller.imagenUrl}
          alt={`Imagen del taller ${taller.name}`}
          className="h-40 w-full object-cover"
        />
      )}

      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{taller.name}</h2>
            {taller.category && <p className="text-xs text-muted">{taller.category}</p>}
          </div>
          <StatusBadge value={taller.status} map={ESTADO_TALLER} />
        </div>

        {taller.description && <p className="text-sm text-muted">{taller.description}</p>}

        <dl className="space-y-1.5 text-sm text-ink">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-muted" aria-hidden />
            <dt className="sr-only">Fecha</dt>
            <dd>{formatDate(taller.event_date)}</dd>
          </div>

          {taller.start_time && (
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-muted" aria-hidden />
              <dt className="sr-only">Horario</dt>
              <dd>
                {formatTime(taller.start_time)}
                {taller.end_time ? ` a ${formatTime(taller.end_time)}` : ''}
              </dd>
            </div>
          )}

          {taller.location && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
              <dt className="sr-only">Ubicación</dt>
              <dd>{taller.location}</dd>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-muted" aria-hidden />
            <dt className="sr-only">Cupo</dt>
            <dd className={cupo.lleno ? 'text-warning' : undefined}>{cupo.texto}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {gratuito ? (
            <Badge tone="brand">Gratuito</Badge>
          ) : (
            <span className="text-lg font-semibold tabular-nums text-ink">
              {formatMoney(Number(taller.price_cents))}
            </span>
          )}
          {taller.responsible_name && (
            <span className="text-xs text-muted">A cargo de {taller.responsible_name}</span>
          )}
        </div>

        {(taller.materials_included || taller.materials_to_bring) && (
          <div className="space-y-2 border-t border-line pt-3">
            {taller.materials_included && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Materiales incluidos</p>
                <p className="text-sm text-ink">{taller.materials_included}</p>
              </div>
            )}
            {taller.materials_to_bring && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Tenés que llevar</p>
                <p className="text-sm text-ink">{taller.materials_to_bring}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
