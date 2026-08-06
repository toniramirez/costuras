import type { Metadata } from 'next';
import Link from 'next/link';
import { BookA, Inbox, LibraryBig } from 'lucide-react';

import { PageHeader } from '@/components/ui/data-list';
import {
  contarSugerenciasPendientes,
  listarCategorias,
  listarContenidos,
  listarSugerencias,
  listarTerminos,
  usoDeCategorias,
} from '@/lib/services/library';
import { getSettings } from '@/lib/settings';
import { paginaDe } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { ContenidosClient } from './contenidos-client';
import { GlosarioClient } from './glosario-client';
import { AvisoSugerencias, SugerenciasClient } from './sugerencias-client';

export const metadata: Metadata = { title: 'Centro de ayuda' };

/**
 * El centro de ayuda del panel: contenidos, glosario y sugerencias.
 *
 * Las tres cosas viven en UNA pantalla con solapas y no en tres entradas del
 * menú porque son el mismo trabajo: preparar el material que la alumna consulta
 * cuando se traba. Separarlas obligaría a recordar en cuál de las tres estaba lo
 * que uno busca, que es exactamente el problema que el menú de este panel ya
 * resolvió una vez.
 *
 * La solapa activa viaja por searchParams (no por estado local): así se conserva
 * al recargar, al volver atrás y al compartir el enlace, igual que los filtros.
 */
const SECCIONES = [
  { clave: 'contenidos', label: 'Contenidos', icon: LibraryBig },
  { clave: 'glosario', label: 'Glosario', icon: BookA },
  { clave: 'sugerencias', label: 'Sugerencias', icon: Inbox },
] as const;

type Seccion = (typeof SECCIONES)[number]['clave'];

function esSeccion(valor: string | undefined): valor is Seccion {
  return SECCIONES.some((s) => s.clave === valor);
}

export default async function AyudaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    seccion?: string;
    q?: string;
    categoria?: string;
    estado?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const seccion: Seccion = esSeccion(params.seccion) ? params.seccion : 'contenidos';
  const pagina = paginaDe(params.pagina);

  const [settings, pendientes] = await Promise.all([getSettings(), contarSugerenciasPendientes()]);

  const limites = {
    max_image_mb: settings?.max_image_mb ?? 5,
    max_document_mb: settings?.max_document_mb ?? 10,
    max_video_mb: settings?.max_video_mb ?? 50,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Centro de ayuda"
        description="La biblioteca que las alumnas abren desde «¡Necesito ayuda!»."
      />

      <nav
        aria-label="Secciones del centro de ayuda"
        className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1"
      >
        {SECCIONES.map(({ clave, label, icon: Icono }) => {
          const activa = clave === seccion;
          return (
            <Link
              key={clave}
              // Cambiar de solapa limpia los filtros de la anterior: un
              // «categoría=telas» arrastrado al glosario no filtraría nada y
              // dejaría la pantalla sin explicación.
              href={clave === 'contenidos' ? '/admin/ayuda' : `/admin/ayuda?seccion=${clave}`}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                'transition-colors duration-200',
                activa ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-line/40 hover:text-ink',
              )}
            >
              <Icono className="size-4 shrink-0" aria-hidden />
              {label}
              {clave === 'sugerencias' && <AvisoSugerencias cantidad={pendientes} />}
            </Link>
          );
        })}
      </nav>

      {seccion === 'contenidos' && (
        <ContenidosSeccion
          q={params.q}
          categoria={params.categoria}
          pagina={pagina}
          limites={limites}
        />
      )}

      {seccion === 'glosario' && (
        <GlosarioSeccion q={params.q} pagina={pagina} limites={limites} />
      )}

      {seccion === 'sugerencias' && (
        <SugerenciasSeccion estado={params.estado} limites={limites} />
      )}
    </div>
  );
}

type Limites = { max_image_mb: number; max_document_mb: number; max_video_mb: number };

async function ContenidosSeccion({
  q,
  categoria,
  pagina,
  limites,
}: {
  q?: string;
  categoria?: string;
  pagina: number;
  limites: Limites;
}) {
  const [{ contenidos, total }, categorias, uso] = await Promise.all([
    listarContenidos({ q, categoria, pagina }),
    listarCategorias('ayuda'),
    usoDeCategorias('ayuda'),
  ]);

  return (
    <ContenidosClient
      contenidos={contenidos}
      total={total}
      categorias={categorias}
      uso={uso}
      limites={limites}
    />
  );
}

async function GlosarioSeccion({
  q,
  pagina,
  limites,
}: {
  q?: string;
  pagina: number;
  limites: Limites;
}) {
  const { terminos, total } = await listarTerminos({ q, pagina });
  return <GlosarioClient terminos={terminos} total={total} limites={limites} />;
}

async function SugerenciasSeccion({ estado, limites }: { estado?: string; limites: Limites }) {
  const sugerencias = await listarSugerencias({ estado });
  return <SugerenciasClient sugerencias={sugerencias} limites={limites} />;
}
