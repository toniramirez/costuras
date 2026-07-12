import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCheck, FileText, Paperclip, Users } from 'lucide-react';

import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Callout } from '@/components/ui/states';
import { obtenerComunicado, opcionesDestinatarios } from '@/lib/services/comms';
import { getSettings } from '@/lib/settings';
import { PRIORIDAD } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { ESTADO_PUBLICACION, tamanioArchivo } from '../_partes/comunes';
import { AccionesComunicado } from './detail-client';

export const metadata: Metadata = { title: 'Comunicado' };

/**
 * Detalle: cuántos lo recibieron, cuántos lo leyeron y —lo que más importa—
 * QUIÉNES NO lo leyeron. Sale directo de communication_recipients.read_at, que es
 * exactamente para lo que se expanden los destinatarios a una fila por alumno.
 */
export default async function ComunicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [detalle, destino, settings] = await Promise.all([
    obtenerComunicado(id),
    opcionesDestinatarios(),
    getSettings(),
  ]);

  if (!detalle) notFound();

  const { comunicado, leyeron, noLeyeron, adjuntos } = detalle;
  const total = leyeron.length + noLeyeron.length;
  const esBorrador = comunicado.status === 'borrador';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/admin/comunicados"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Comunicados
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{comunicado.subject}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge value={comunicado.status} map={ESTADO_PUBLICACION} />
            <Badge tone={PRIORIDAD[comunicado.priority].tone}>
              {PRIORIDAD[comunicado.priority].label}
            </Badge>
            <span className="text-sm text-muted">
              {comunicado.sent_at
                ? `Enviado el ${formatDateTime(comunicado.sent_at)}`
                : 'Todavía no se envió'}
            </span>
          </div>
        </div>

        <AccionesComunicado
          comunicado={comunicado}
          opcionesDestino={destino}
          limites={{
            max_image_mb: settings?.max_image_mb ?? 10,
            max_document_mb: settings?.max_document_mb ?? 10,
            max_video_mb: settings?.max_video_mb ?? 50,
          }}
          destinatarios={total}
        />
      </header>

      {esBorrador && (
        <Callout tone="info" title="Es un borrador">
          Todavía no le llegó a nadie. Abrilo con «Editar», revisá los destinatarios y enviálo.
        </Callout>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mensaje</CardTitle>
          <span className="shrink-0 text-xs text-muted">{comunicado.scope_label}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{comunicado.body}</p>

          {comunicado.expires_at && (
            <p className="text-xs text-muted">Vence el {formatDateTime(comunicado.expires_at)}.</p>
          )}

          {adjuntos.length > 0 && (
            <div className="border-t border-line pt-4">
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

      {!esBorrador && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Lo recibieron" value={total} icon={<Users className="size-4" />} />
            <StatCard
              label="Lo leyeron"
              value={leyeron.length}
              tone="success"
              icon={<CheckCheck className="size-4" />}
              hint={total > 0 ? `${Math.round((leyeron.length / total) * 100)}%` : undefined}
            />
            <StatCard
              label="Sin leer"
              value={noLeyeron.length}
              tone={noLeyeron.length > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Todavía no lo leyeron ({noLeyeron.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {noLeyeron.length === 0 ? (
                <p className="text-sm text-muted">Lo leyeron todos. 🎉</p>
              ) : (
                <ul className="divide-y divide-line">
                  {noLeyeron.map((a) => (
                    <li
                      key={a.studentId}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink">{a.nombre}</span>
                      {a.sinUsuario && (
                        <Badge tone="warning">Sin usuario: no puede abrirlo</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {leyeron.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ya lo leyeron ({leyeron.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line">
                  {leyeron.map((a) => (
                    <li
                      key={a.studentId}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink">{a.nombre}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDateTime(a.leidoEl)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
