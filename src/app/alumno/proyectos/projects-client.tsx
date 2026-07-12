'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NotebookPen, Plus, Scissors } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { guardarProyecto } from '@/app/actions/projects';
import { ESTADO_PROYECTO } from '@/lib/labels';
import type { Proyecto } from '@/lib/services/projects';

/**
 * La estantería de cuadernos.
 *
 * Antes esto era una tabla con buscador, dos filtros y una columna de acciones.
 * Un proyecto de costura no es una fila: es una prenda. Manda la foto.
 *
 * Y crear uno pide UN campo. Los once campos de antes (tela, medidas, materiales,
 * dificultad, fechas…) siguen estando, pero adentro del cuaderno y opcionales: si
 * te los piden antes de empezar, no empezás.
 */
export function ProjectsClient({
  proyectos,
  total,
  portadas,
}: {
  proyectos: Proyecto[];
  total: number;
  tipos: string[];
  portadas: Record<string, string>;
}) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Mis proyectos</h1>
          <p className="mt-0.5 text-sm text-muted">Tu cuaderno de costura.</p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus className="size-4" aria-hidden />
          Nuevo
        </Button>
      </header>

      {proyectos.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand/10">
            <NotebookPen className="size-5 text-brand" aria-hidden />
          </div>
          <p className="text-sm font-semibold text-ink">Tu cuaderno está vacío</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Empezá un proyecto y anotá cómo avanza: qué cortaste, qué te salió bien, qué hay que
            corregir. Con fotos.
          </p>
          <Button className="mt-5" size="lg" onClick={() => setCreando(true)}>
            <Plus className="size-4" aria-hidden />
            Empezar un proyecto
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {proyectos.map((proyecto) => {
            const portada = proyecto.cover_image_path
              ? portadas[proyecto.cover_image_path]
              : null;

            return (
              <li key={proyecto.id}>
                <Link
                  href={`/alumno/proyectos/${proyecto.id}`}
                  className="group block overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-md"
                >
                  {portada ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portada}
                      alt=""
                      className="aspect-[3/4] w-full bg-canvas object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-canvas">
                      <Scissors className="size-7 text-line-strong" aria-hidden />
                    </div>
                  )}

                  <div className="space-y-1.5 p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
                      {proyecto.title}
                    </p>
                    <Badge tone={ESTADO_PROYECTO[proyecto.status].tone}>
                      {ESTADO_PROYECTO[proyecto.status].label}
                    </Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination total={total} />

      {creando && <NuevoProyecto onClose={() => setCreando(false)} />}
    </div>
  );
}

/**
 * Empezar un proyecto: UNA pregunta.
 *
 * El resto de los campos que exige el esquema (dificultad, estado) se mandan con
 * valores razonables y se cambian después desde el cuaderno. Nadie sabe la
 * "dificultad" de una prenda antes de empezarla.
 */
const esquemaNuevo = z.object({
  title: z.string().trim().min(1, 'Escribí qué vas a coser').max(120, 'Máximo 120 caracteres'),
});

type DatosNuevo = z.infer<typeof esquemaNuevo>;

function NuevoProyecto({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosNuevo>({ resolver: zodResolver(esquemaNuevo), defaultValues: { title: '' } });

  async function onSubmit(datos: DatosNuevo) {
    const r = await guardarProyecto(null, {
      title: datos.title,
      difficulty: 'inicial',
      status: 'en_proceso',
    });

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success('Proyecto creado');
    onClose();
    // Vamos derecho al cuaderno: es donde la persona quiere estar.
    if (r.data?.id) router.push(`/alumno/proyectos/${r.data.id}`);
    else router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo proyecto"
      description="Después le ponés la foto, la tela y las medidas. Ahora solo el nombre."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="nuevo-proyecto" type="submit" loading={isSubmitting}>
            Empezar
          </Button>
        </>
      }
    >
      <form id="nuevo-proyecto" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label="¿Qué vas a coser?"
          placeholder="Vestido de verano"
          autoFocus
          required
          error={errors.title?.message}
          {...register('title')}
        />
      </form>
    </Dialog>
  );
}
