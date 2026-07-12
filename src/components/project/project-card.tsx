import Link from 'next/link';
import { ImageOff, Star } from 'lucide-react';

import { Badge, StatusBadge } from '@/components/ui/badge';
import { DIFICULTAD_PROYECTO } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { ProyectoConAlumno } from '@/lib/services/projects';
import { cn } from '@/lib/utils';

/**
 * Tarjeta de la galería.
 *
 * La portada es una URL FIRMADA (el bucket es privado). Si el proyecto no tiene
 * portada, mostramos un cartel: una tarjeta vacía sin explicación deja pensando
 * que algo se rompió.
 */
export function ProjectCard({
  proyecto,
  href,
  urlPortada,
  mostrarAlumno = false,
  acciones,
  className,
}: {
  proyecto: ProyectoConAlumno;
  href: string;
  urlPortada?: string;
  /** En el panel la galería es de todos: hay que saber de quién es cada uno. */
  mostrarAlumno?: boolean;
  acciones?: React.ReactNode;
  className?: string;
}) {
  const alumno = proyecto.students;

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(43,37,34,0.04)]',
        className,
      )}
    >
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-canvas">
        {urlPortada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urlPortada}
            alt={`Portada de ${proyecto.title}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted">
            <ImageOff className="size-6" aria-hidden />
            <span className="text-xs">Sin portada</span>
          </div>
        )}

        {proyecto.is_featured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-medium text-accent shadow-sm">
            <Star className="size-3 fill-current" aria-hidden />
            Destacado
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <Link href={href} className="block">
            <h3 className="truncate text-sm font-semibold text-ink hover:text-brand">
              {proyecto.title}
            </h3>
          </Link>

          {mostrarAlumno && alumno && (
            <p className="truncate text-xs text-muted">
              {alumno.first_name} {alumno.last_name}
            </p>
          )}

          <p className="mt-0.5 truncate text-xs text-muted">
            {proyecto.garment_type || 'Sin tipo de prenda'}
            {proyecto.end_date ? ` · Terminado el ${formatDate(proyecto.end_date)}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge value={proyecto.difficulty} map={DIFICULTAD_PROYECTO} />
          {proyecto.fabric_type && <Badge tone="neutral">{proyecto.fabric_type}</Badge>}
        </div>

        {acciones && (
          <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-2.5">
            {acciones}
          </div>
        )}
      </div>
    </article>
  );
}
