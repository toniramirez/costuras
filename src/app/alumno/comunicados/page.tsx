import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Inbox, Paperclip } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { requireStudent } from '@/lib/auth';
import { bandejaDelAlumno, contarComunicadosNoLeidos } from '@/lib/services/comms';
import { PRIORIDAD } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Comunicados' };

/**
 * Bandeja de entrada del alumno.
 *
 * Los comunicados se leen y se marcan como leídos: no se responden. Cada uno se
 * abre en su propia pantalla, y ahí se marca (ver `[id]/marcar-leido.tsx`).
 */
export default async function ComunicadosAlumnoPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const { student } = await requireStudent();

  // El contador sale de una consulta propia: así no depende del filtro que esté
  // puesto ni del tope del listado.
  const [comunicados, sinLeer] = await Promise.all([
    bandejaDelAlumno(student.id, estado === 'no_leidos'),
    contarComunicadosNoLeidos(student.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Comunicados"
        description={
          estado === 'no_leidos'
            ? 'Los que todavía no abriste.'
            : sinLeer > 0
              ? `Tenés ${sinLeer} sin leer.`
              : 'Los mensajes de la academia.'
        }
      />

      <FiltersBar>
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos"
          options={[{ value: 'no_leidos', label: 'Sin leer' }]}
        />
      </FiltersBar>

      {comunicados.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={estado === 'no_leidos' ? 'Los leíste todos' : 'No tenés comunicados'}
          description={
            estado === 'no_leidos'
              ? 'No te queda ninguno sin leer.'
              : 'Cuando la academia te mande un mensaje, lo vas a ver acá.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {comunicados.map((c) => {
            const sinLeerEste = c.leidoEl === null;

            return (
              <li key={c.id}>
                <Link
                  href={`/alumno/comunicados/${c.id}`}
                  className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-brand/[0.02]"
                >
                  {/* El punto marca lo que todavía no abrió. */}
                  <span className="mt-1.5 flex size-2 shrink-0">
                    {sinLeerEste && <span className="size-2 rounded-full bg-brand" aria-hidden />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          sinLeerEste
                            ? 'font-semibold text-ink'
                            : 'font-medium text-ink'
                        }
                      >
                        {c.subject}
                      </span>
                      {c.priority !== 'normal' && (
                        <Badge tone={PRIORIDAD[c.priority].tone}>
                          {PRIORIDAD[c.priority].label}
                        </Badge>
                      )}
                      {sinLeerEste && <Badge tone="brand">Sin leer</Badge>}
                    </span>

                    <span className="mt-1 block line-clamp-2 text-sm text-muted">{c.body}</span>

                    <span className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                      <span>{formatDateTime(c.sent_at)}</span>
                      {c.adjuntos.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="size-3" aria-hidden />
                          {c.adjuntos.length}
                        </span>
                      )}
                    </span>
                  </span>

                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
