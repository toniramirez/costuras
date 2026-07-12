'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, Images } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { ProjectCard } from '@/components/project/project-card';
import { duplicarProyecto } from '@/app/actions/projects';
import { DIFICULTAD_PROYECTO, opciones } from '@/lib/labels';
import type { ProyectoConAlumno } from '@/lib/services/projects';

const BOTON_ENLACE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-line/40';

export function GalleryClient({
  proyectos,
  tipos,
  portadas,
}: {
  proyectos: ProyectoConAlumno[];
  tipos: string[];
  portadas: Record<string, string>;
}) {
  const router = useRouter();
  const [duplicando, setDuplicando] = useState<string | null>(null);

  /**
   * Duplicar copia el proyecto como 'idea' y SIN los avances: sirve para volver
   * a coser la misma prenda (otro talle, otra tela) sin cargar todo de nuevo.
   */
  async function duplicar(id: string) {
    setDuplicando(id);
    try {
      const r = await duplicarProyecto(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push(`/alumno/proyectos/${r.data.id}`);
    } finally {
      setDuplicando(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Mi galería"
        description="Todo lo que terminaste. Podés volver a usar cualquier proyecto como punto de partida."
      />

      <FiltersBar>
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
          description="Cuando marques un proyecto como terminado, va a aparecer acá con su foto de portada."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((p) => (
            <li key={p.id}>
              <ProjectCard
                proyecto={p}
                href={`/alumno/proyectos/${p.id}`}
                urlPortada={p.cover_image_path ? portadas[p.cover_image_path] : undefined}
                acciones={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={duplicando === p.id}
                      onClick={() => duplicar(p.id)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      Duplicar
                    </Button>
                    <a
                      href={`/api/proyectos/${p.id}/pdf`}
                      className={BOTON_ENLACE}
                      aria-label={`Descargar el resumen de ${p.title}`}
                    >
                      <Download className="size-3.5" aria-hidden />
                      Resumen
                    </a>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
