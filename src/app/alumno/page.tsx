import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, MapPin, Pin, Scissors } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { requireStudent } from '@/lib/auth';
import { novedadesDelAlumno } from '@/lib/services/comms';
import { listarTalleresVisibles } from '@/lib/services/workshops';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { MarcarNovedadesLeidas } from './novedades/marcar-leidas';

export const metadata: Metadata = { title: 'Inicio' };

/**
 * Inicio de la alumna: bienvenida, novedades y talleres. Nada más.
 *
 * Antes esto era un tablero con siete tarjetas (cuotas, recuperaciones,
 * comunicados, proyecto actual…). Era el resumen que le sirve a la academia,
 * no lo que la alumna quiere ver al abrir la app.
 *
 * Las novedades se muestran como FLYER: la imagen manda. La academia publica un
 * flyer y acá se ve como un flyer, no como una fila de una tabla.
 */
export default async function AlumnoInicioPage() {
  const { student } = await requireStudent();

  const [novedades, talleres] = await Promise.all([
    novedadesDelAlumno(student.id),
    listarTalleresVisibles(4),
  ]);

  const sinLeer = novedades.filter((n) => !n.leidoEl).map((n) => n.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-4">
      {/* Al abrir el inicio, las novedades quedan leídas. */}
      {sinLeer.length > 0 && <MarcarNovedadesLeidas ids={sinLeer} />}

      <header className="pt-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Hola, {student.first_name}
        </h1>
        <p className="mt-0.5 text-sm text-muted">Esto es lo nuevo en la academia.</p>
      </header>

      {/* ── Novedades como flyer ─────────────────────────────────────────── */}
      <section className="space-y-4">
        {novedades.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
            <p className="text-sm text-muted">No hay novedades por ahora.</p>
          </div>
        ) : (
          novedades.map((novedad) => (
            <article
              key={novedad.id}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(43,37,34,0.04)]"
            >
              {novedad.imagenUrl && (
                // El flyer se muestra completo: no se recorta. Una imagen vertical
                // de Instagram y una horizontal tienen que verse las dos enteras.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={novedad.imagenUrl}
                  alt={novedad.title}
                  className="w-full bg-canvas object-contain"
                />
              )}

              <div className="space-y-2 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {novedad.is_pinned && (
                    <Badge tone="brand">
                      <Pin className="mr-1 size-3" aria-hidden />
                      Fijada
                    </Badge>
                  )}
                  {novedad.priority === 'urgente' && <Badge tone="danger">Urgente</Badge>}
                  {novedad.priority === 'alta' && <Badge tone="warning">Importante</Badge>}
                  <span className="text-xs text-muted">
                    {formatDate(novedad.published_at?.slice(0, 10))}
                  </span>
                </div>

                <h2 className="text-lg font-semibold leading-snug text-ink">{novedad.title}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                  {novedad.content}
                </p>

                {novedad.adjuntos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {novedad.adjuntos.map((a) => (
                      <a
                        key={a.path}
                        href={a.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-brand hover:bg-canvas"
                      >
                        {a.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      {/* ── Talleres ─────────────────────────────────────────────────────── */}
      {talleres.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Scissors className="size-4" aria-hidden />
            Próximos talleres
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {talleres.map((taller) => {
              const lugares = taller.capacity - taller.confirmados;
              const completo = taller.capacity > 0 && lugares <= 0;

              return (
                <article
                  key={taller.id}
                  className="overflow-hidden rounded-card border border-line bg-surface"
                >
                  {taller.imagenUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={taller.imagenUrl}
                      alt=""
                      className="h-32 w-full bg-canvas object-cover"
                    />
                  )}

                  <div className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug text-ink">{taller.name}</h3>
                      {completo ? (
                        <Badge tone="warning">Completo</Badge>
                      ) : (
                        <Badge tone="success">{lugares} lugares</Badge>
                      )}
                    </div>

                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                      {formatDate(taller.event_date)}
                      {taller.start_time && ` · ${formatTime(taller.start_time)}`}
                    </p>

                    {taller.location && (
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {taller.location}
                      </p>
                    )}

                    {taller.price_cents > 0 && (
                      <p className="pt-0.5 text-sm font-semibold text-ink">
                        {formatMoney(taller.price_cents)}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted">
            Para anotarte, hablá con la academia.
          </p>
        </section>
      )}

      {/* Acceso al cuaderno: es lo otro que la alumna viene a hacer. */}
      <Link
        href="/alumno/proyectos"
        className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-canvas"
      >
        <div>
          <p className="text-sm font-semibold text-ink">Mi cuaderno</p>
          <p className="text-xs text-muted">Tus proyectos, fotos y anotaciones</p>
        </div>
        <Scissors className="size-5 text-brand" aria-hidden />
      </Link>
    </div>
  );
}
