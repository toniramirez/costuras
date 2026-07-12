import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, Images } from 'lucide-react';

import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { ProjectCard } from '@/components/project/project-card';
import {
  firmarUrls,
  listarAlumnos,
  listarGaleria,
  tiposDePrenda,
} from '@/lib/services/projects';
import { DIFICULTAD_PROYECTO, opciones } from '@/lib/labels';

export const metadata: Metadata = { title: 'Galería de proyectos' };

const BOTON_ENLACE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-line/40';

/**
 * Galería general: los proyectos TERMINADOS de todos los alumnos.
 *
 * Es la única vista del módulo donde se ven proyectos de varias personas, y solo
 * la alcanza la administradora (la RLS no le devolvería los ajenos a nadie más).
 */
export default async function GaleriaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; dificultad?: string; alumno?: string }>;
}) {
  await requireAdmin();
  const { tipo, dificultad, alumno } = await searchParams;

  const proyectos = await listarGaleria(null, { tipo, dificultad, alumno });

  const [tipos, alumnos, portadas] = await Promise.all([
    tiposDePrenda(null),
    listarAlumnos(),
    firmarUrls(proyectos.map((p) => p.cover_image_path)),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/admin/proyectos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Proyectos
      </Link>

      <PageHeader
        title="Galería de proyectos"
        description="Todo lo que los alumnos terminaron. Los destacados aparecen primero."
      />

      <FiltersBar>
        <FilterSelect
          param="alumno"
          label="Alumno"
          allLabel="Todos los alumnos"
          options={alumnos.map((a) => ({
            value: a.id,
            label: `${a.last_name}, ${a.first_name}`,
          }))}
        />
        <FilterSelect
          param="tipo"
          label="Tipo de prenda"
          allLabel="Todas las prendas"
          options={tipos.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          param="dificultad"
          label="Dificultad"
          allLabel="Toda dificultad"
          options={opciones(DIFICULTAD_PROYECTO)}
        />
      </FiltersBar>

      {proyectos.length === 0 ? (
        <EmptyState
          icon={<Images className="size-5" />}
          title="Todavía no hay proyectos terminados"
          description="Cuando un alumno marque un proyecto como terminado, va a aparecer acá."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((p) => (
            <li key={p.id}>
              <ProjectCard
                proyecto={p}
                href={`/admin/proyectos/${p.id}`}
                urlPortada={p.cover_image_path ? portadas[p.cover_image_path] : undefined}
                mostrarAlumno
                acciones={
                  <a
                    href={`/api/proyectos/${p.id}/pdf`}
                    className={BOTON_ENLACE}
                    aria-label={`Descargar el resumen de ${p.title}`}
                  >
                    <Download className="size-3.5" aria-hidden />
                    Resumen
                  </a>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
