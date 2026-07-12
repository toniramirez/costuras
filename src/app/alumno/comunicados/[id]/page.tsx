import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileText, Paperclip } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireStudent } from '@/lib/auth';
import { abrirComunicado } from '@/lib/services/comms';
import { PRIORIDAD } from '@/lib/labels';
import { formatDateTime, formatTimestampAsDate } from '@/lib/format';
import { tamanioArchivo } from '@/app/admin/comunicados/_partes/comunes';
import { MarcarLeido } from './marcar-leido';

export const metadata: Metadata = { title: 'Comunicado' };

/**
 * Un comunicado abierto.
 *
 * Al entrar se marca como leído (la RLS solo deja que el alumno toque SU fila de
 * communication_recipients). No hay forma de responder: no es un chat.
 *
 * Los adjuntos se firman en el servidor: el bucket es privado y la política de
 * Storage solo autoriza la carpeta `<communication_id>/` a sus destinatarios.
 */
export default async function ComunicadoAlumnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { student } = await requireStudent();

  const abierto = await abrirComunicado(id, student.id);
  if (!abierto) notFound();

  const { comunicado, adjuntos, leidoEl } = abierto;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <MarcarLeido comunicadoId={comunicado.id} yaLeido={leidoEl !== null} />

      <div>
        <Link
          href="/alumno/comunicados"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Comunicados
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{comunicado.subject}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {comunicado.priority !== 'normal' && (
            <Badge tone={PRIORIDAD[comunicado.priority].tone}>
              {PRIORIDAD[comunicado.priority].label}
            </Badge>
          )}
          <span className="text-sm text-muted">{formatDateTime(comunicado.sent_at)}</span>
        </div>
      </header>

      <Card>
        <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{comunicado.body}</p>

          {comunicado.expires_at && (
            <p className="mt-3 text-xs text-muted">
              Vigente hasta el {formatTimestampAsDate(comunicado.expires_at)}.
            </p>
          )}

          {adjuntos.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Paperclip className="size-3.5" aria-hidden />
                Adjuntos
              </p>
              <ul className="space-y-1.5">
                {adjuntos.map((a) => (
                  <li key={a.path}>
                    <a
                      href={a.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2.5 hover:border-brand hover:bg-brand/5"
                    >
                      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {tamanioArchivo(a.size)}
                      </span>
                      <Download className="size-4 shrink-0 text-muted" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted">
        Este comunicado no admite respuesta. Si necesitás algo, escribile a la academia.
      </p>
    </div>
  );
}
