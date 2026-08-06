'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookA,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Film,
  ImageIcon,
  LifeBuoy,
  Search,
} from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { SearchInput } from '@/components/ui/filters';
import type { ContenidoConArchivo, SeccionAyuda } from '@/lib/services/library';
import type { Enums } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

/**
 * El centro de ayuda de la alumna.
 *
 * Es una biblioteca, no un panel: manda el material, no los metadatos. Cada
 * publicación se abre en el lugar (no navega a otra pantalla) porque la mayoría
 * son cosas de treinta segundos —un video corto, una foto de una puntada— y
 * mandar a alguien a otra pantalla y traerlo de vuelta por eso es más viaje que
 * contenido.
 *
 * Todo está pensado para el celular: una columna, tarjetas grandes y el buscador
 * arriba de todo, que es lo que se usa cuando ya se sabe qué se busca.
 */
const ICONO: Record<Enums<'help_content_kind'>, typeof FileText> = {
  video: Film,
  imagen: ImageIcon,
  pdf: FileText,
  texto: FileText,
};

/** URL firmada de Storage forzando la descarga en vez de abrir el visor. */
function descarga(url: string, nombre: string | null): string {
  const separador = url.includes('?') ? '&' : '?';
  return `${url}${separador}download=${encodeURIComponent(nombre ?? 'archivo')}`;
}

export function AyudaClient({
  secciones,
  buscando,
}: {
  secciones: SeccionAyuda[];
  buscando: boolean;
}) {
  const cuantos = secciones.reduce((suma, s) => suma + s.contenidos.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4">
      <header className="pt-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">¡Necesito ayuda!</h1>
        <p className="mt-0.5 text-sm text-muted">
          Videos, guías y explicaciones para cuando te trabás.
        </p>
      </header>

      {/* El glosario primero: es lo que se busca cuando no se entiende una
          palabra, y eso pasa antes que cualquier otra duda. */}
      <Link
        href="/alumno/ayuda/glosario"
        className="alzar group flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-suave hover:border-brand"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <BookA className="size-5 text-brand" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Glosario de costura</p>
            <p className="text-xs text-muted">
              Buscá una palabra y enterate qué es y para qué sirve
            </p>
          </div>
        </div>
        <ChevronDown
          className="size-5 -rotate-90 text-muted transition-transform duration-300 ease-[var(--ease-tela)] group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>

      <div className="flex items-center gap-2">
        <SearchInput placeholder="Buscar en el material…" />
      </div>

      {secciones.length === 0 ? (
        buscando ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No encontramos nada con esa búsqueda"
            description="Probá con otra palabra. Si lo que buscás es el significado de un término, mirá el glosario."
          />
        ) : (
          <EmptyState
            icon={<LifeBuoy className="size-5" />}
            title="Todavía no hay material publicado"
            description="La academia está preparando los videos y las guías. Cuando los suba, los vas a ver acá."
          />
        )
      ) : (
        <>
          {buscando && (
            <p className="text-xs text-muted">
              {cuantos} resultado{cuantos === 1 ? '' : 's'}
            </p>
          )}

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

                <ul className="escalonar space-y-2.5">
                  {seccion.contenidos.map((contenido) => (
                    <li key={contenido.id}>
                      <Tarjeta contenido={contenido} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Una publicación. Cerrada muestra el título; abierta, el material. */
function Tarjeta({ contenido }: { contenido: ContenidoConArchivo }) {
  const [abierta, setAbierta] = useState(false);
  const Icono = ICONO[contenido.kind];

  return (
    <article className="alzar overflow-hidden rounded-card border border-line bg-surface shadow-suave">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-canvas/60"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
          <Icono className="size-4 text-brand" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-ink">
            {contenido.title}
          </span>
          {contenido.description && (
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              {contenido.description}
            </span>
          )}
        </span>

        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted transition-transform duration-300',
            abierta && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <Material contenido={contenido} />
        </div>
      )}
    </article>
  );
}

/** El contenido propiamente dicho. Cada tipo se muestra como corresponde. */
function Material({ contenido }: { contenido: ContenidoConArchivo }) {
  if (contenido.kind === 'texto') {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{contenido.body}</p>
    );
  }

  if (!contenido.url) {
    return <p className="text-sm text-muted">El material todavía no está disponible.</p>;
  }

  if (contenido.kind === 'imagen') {
    return (
      <>
        {/* La imagen se muestra ENTERA (`object-contain`): puede ser el detalle
            de una costura y recortarla sería tapar justo lo que hay que mirar. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado) */}
        <img
          src={contenido.url}
          alt={contenido.title}
          className="w-full rounded-xl bg-canvas object-contain"
        />
        <Descargar url={contenido.url} nombre={contenido.file_name} />
      </>
    );
  }

  if (contenido.kind === 'video') {
    // Video alojado afuera: no lo incrustamos. Un iframe de otro sitio adentro
    // de la aplicación traería su propio rastreo y sus propios permisos.
    if (!contenido.storage_path) {
      return (
        <a
          href={contenido.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white"
        >
          <ExternalLink className="size-4" aria-hidden />
          Ver el video
        </a>
      );
    }

    return (
      <>
        <video src={contenido.url} controls playsInline className="w-full rounded-xl bg-black" />
        <Descargar url={contenido.url} nombre={contenido.file_name} />
      </>
    );
  }

  // PDF. En el celular, el visor del navegador es mejor que cualquier visor que
  // podamos incrustar: se abre a pantalla completa y hace zoom con los dedos.
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={contenido.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white"
      >
        <FileText className="size-4" aria-hidden />
        Abrir el PDF
      </a>
      <Descargar url={contenido.url} nombre={contenido.file_name} />
    </div>
  );
}

function Descargar({ url, nombre }: { url: string; nombre: string | null }) {
  return (
    <a
      href={descarga(url, nombre)}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-canvas"
    >
      <Download className="size-4" aria-hidden />
      Descargar
    </a>
  );
}
