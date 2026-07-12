import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, FileText, Newspaper, Paperclip, Pin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { requireStudent } from '@/lib/auth';
import { novedadesDelAlumno, type NovedadRecibida } from '@/lib/services/comms';
import { PRIORIDAD } from '@/lib/labels';
import { formatTimestampAsDate } from '@/lib/format';
import { tamanioArchivo } from '@/app/admin/comunicados/_partes/comunes';
import { MarcarNovedadesLeidas } from './marcar-leidas';

export const metadata: Metadata = { title: 'Novedades' };

/**
 * Novedades del alumno.
 *
 * Las fijadas van primero; después, por fecha de publicación. Las VENCIDAS no
 * aparecen entre las principales, pero no se pierden: quedan en el historial.
 */
export default async function NovedadesAlumnoPage({
  searchParams,
}: {
  searchParams: Promise<{ historial?: string }>;
}) {
  const { historial } = await searchParams;
  const enHistorial = historial === '1';

  const { student } = await requireStudent();
  const novedades = await novedadesDelAlumno(student.id, enHistorial);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Al verlas, quedan marcadas como leídas: no hay que hacer nada más. */}
      <MarcarNovedadesLeidas
        ids={novedades.filter((n) => n.leidoEl === null).map((n) => n.id)}
      />

      <PageHeader
        title={enHistorial ? 'Historial de novedades' : 'Novedades'}
        description={
          enHistorial
            ? 'Las que ya vencieron. Siguen acá por si las necesitás.'
            : 'Lo último de la academia.'
        }
        action={
          <Link
            href={enHistorial ? '/alumno/novedades' : '/alumno/novedades?historial=1'}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
          >
            {enHistorial ? (
              <>
                <Newspaper className="size-4" aria-hidden />
                Ver las vigentes
              </>
            ) : (
              <>
                <Archive className="size-4" aria-hidden />
                Historial
              </>
            )}
          </Link>
        }
      />

      {novedades.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-5" />}
          title={enHistorial ? 'El historial está vacío' : 'Todavía no hay novedades'}
          description={
            enHistorial
              ? 'Cuando una novedad venza, la vas a encontrar acá.'
              : 'Cuando la academia publique algo, lo vas a ver acá.'
          }
        />
      ) : (
        <div className="space-y-4">
          {novedades.map((n) => (
            <TarjetaNovedad key={n.id} novedad={n} vencida={enHistorial} />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaNovedad({ novedad, vencida }: { novedad: NovedadRecibida; vencida: boolean }) {
  return (
    <Card className={novedad.is_pinned && !vencida ? 'border-brand/40' : undefined}>
      {novedad.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={novedad.imagenUrl}
          alt=""
          className="max-h-64 w-full rounded-t-card object-cover"
        />
      )}

      <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {novedad.is_pinned && !vencida && (
            <Badge tone="brand">
              <Pin className="mr-1 size-3" aria-hidden />
              Fijada
            </Badge>
          )}
          {novedad.priority !== 'normal' && (
            <Badge tone={PRIORIDAD[novedad.priority].tone}>
              {PRIORIDAD[novedad.priority].label}
            </Badge>
          )}
          {vencida && <Badge tone="neutral">Vencida</Badge>}
          <span className="text-xs text-muted">
            {formatTimestampAsDate(novedad.published_at)}
          </span>
        </div>

        <h2 className="mt-2 text-lg font-semibold text-ink">{novedad.title}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {novedad.content}
        </p>

        {novedad.adjuntos.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Paperclip className="size-3.5" aria-hidden />
              Adjuntos
            </p>
            <ul className="space-y-1.5">
              {novedad.adjuntos.map((a) => (
                <li key={a.path}>
                  <a
                    href={a.url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2 hover:border-brand hover:bg-brand/5"
                  >
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {tamanioArchivo(a.size)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
