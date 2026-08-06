'use client';

import { Download, FileText, Ruler, Search } from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { SearchInput } from '@/components/ui/filters';
import type { MoldeConArchivos, SeccionMolderia } from '@/lib/services/library';

/** Peso legible: un molde de 40 MB no se baja con datos móviles, y hay que saberlo antes. */
function peso(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

/**
 * Moldería digital de la alumna.
 *
 * Dos acciones por molde y nada más: abrirlo (el visor del celular hace zoom
 * mejor que cualquier visor que podamos incrustar) y descargarlo, que es lo que
 * hace falta para llevarlo a imprimir.
 */
export function MolderiaClient({
  secciones,
  buscando,
}: {
  secciones: SeccionMolderia[];
  buscando: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4">
      <header className="pt-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Moldería digital</h1>
        <p className="mt-0.5 text-sm text-muted">
          Los moldes de la academia, listos para abrir e imprimir.
        </p>
      </header>

      <SearchInput placeholder="Buscar un molde…" />

      {secciones.length === 0 ? (
        buscando ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No encontramos ese molde"
            description="Probá con otra palabra o mirá la lista completa limpiando la búsqueda."
          />
        ) : (
          <EmptyState
            icon={<Ruler className="size-5" />}
            title="Todavía no hay moldes publicados"
            description="Cuando la academia suba los primeros, los vas a ver acá para abrirlos y descargarlos."
          />
        )
      ) : (
        <div className="space-y-7">
          {secciones.map((seccion) => (
            <section key={seccion.id ?? 'sueltos'} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {seccion.nombre}
                </h2>
                {seccion.descripcion && (
                  <p className="mt-0.5 text-sm text-muted">{seccion.descripcion}</p>
                )}
              </div>

              <ul className="escalonar grid grid-cols-1 gap-3 sm:grid-cols-2">
                {seccion.moldes.map((molde) => (
                  <li key={molde.id}>
                    <Tarjeta molde={molde} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ molde }: { molde: MoldeConArchivos }) {
  const tamanio = peso(molde.size_bytes);
  const nombre = `${molde.title}.pdf`;
  const url = molde.pdfUrl ?? '#';
  const urlDescarga = `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(nombre)}`;

  return (
    <article className="alzar flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-suave">
      {molde.portadaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
        <img
          src={molde.portadaUrl}
          alt=""
          className="h-36 w-full bg-canvas object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-canvas">
          <Ruler className="size-7 text-line-strong" aria-hidden />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold leading-snug text-ink">{molde.title}</h3>

        {molde.description && (
          <p className="text-xs leading-relaxed text-muted">{molde.description}</p>
        )}

        {tamanio && <p className="text-xs text-muted">PDF · {tamanio}</p>}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-white"
          >
            <FileText className="size-4" aria-hidden />
            Abrir
          </a>
          <a
            href={urlDescarga}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-medium text-ink hover:bg-canvas"
          >
            <Download className="size-4" aria-hidden />
            Descargar
          </a>
        </div>
      </div>
    </article>
  );
}
