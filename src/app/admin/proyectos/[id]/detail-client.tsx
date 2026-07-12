'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileArchive, ImageOff, Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Callout } from '@/components/ui/states';
import { Attachments } from '@/components/project/attachments';
import { AdminProjectForm } from '@/components/project/project-form';
import { Timeline } from '@/components/project/timeline';
import { alternarDestacado, eliminarProyecto } from '@/app/actions/projects';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { Archivo, Entrada, ProyectoConAlumno } from '@/lib/services/projects';
import { cn } from '@/lib/utils';

const BOTON_ENLACE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas';

type Alumno = { id: string; first_name: string; last_name: string };

export function AdminDetailClient({
  proyecto,
  entradas,
  archivos,
  urls,
  alumnos,
  tipos,
}: {
  proyecto: ProyectoConAlumno;
  entradas: Entrada[];
  archivos: Archivo[];
  urls: Record<string, string>;
  alumnos: Alumno[];
  tipos: string[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const archivosDelProyecto = archivos.filter((a) => a.entry_id === null);
  const urlPortada = proyecto.cover_image_path ? urls[proyecto.cover_image_path] : undefined;
  const alumno = proyecto.students;

  async function destacar() {
    const r = await alternarDestacado(proyecto.id, !proyecto.is_featured);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    const r = await eliminarProyecto(proyecto.id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    router.push('/admin/proyectos');
  }

  const ficha: Array<{ etiqueta: string; valor: string | null }> = [
    { etiqueta: 'Alumno', valor: alumno ? `${alumno.first_name} ${alumno.last_name}` : null },
    { etiqueta: 'Tipo de prenda', valor: proyecto.garment_type },
    { etiqueta: 'Tipo de tela', valor: proyecto.fabric_type },
    { etiqueta: 'Inicio', valor: proyecto.start_date ? formatDate(proyecto.start_date) : null },
    { etiqueta: 'Fin', valor: proyecto.end_date ? formatDate(proyecto.end_date) : null },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/proyectos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Proyectos
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{proyecto.title}</h1>
            {alumno && (
              <p className="text-sm text-muted">
                {alumno.first_name} {alumno.last_name}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge value={proyecto.status} map={ESTADO_PROYECTO} />
              <StatusBadge value={proyecto.difficulty} map={DIFICULTAD_PROYECTO} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={destacar}>
              <Star
                className={cn('size-3.5', proyecto.is_featured && 'fill-current text-accent')}
                aria-hidden
              />
              {proyecto.is_featured ? 'Sin destacar' : 'Destacar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBorrando(true)}
              aria-label="Eliminar proyecto"
            >
              <Trash2 className="size-3.5 text-danger" aria-hidden />
            </Button>
          </div>
        </div>

        {proyecto.description && (
          <p className="whitespace-pre-wrap text-sm text-muted">{proyecto.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/proyectos/${proyecto.id}/pdf`} className={BOTON_ENLACE}>
            <Download className="size-3.5" aria-hidden />
            Descargar PDF
          </a>
          <a href={`/api/proyectos/${proyecto.id}/zip`} className={BOTON_ENLACE}>
            <FileArchive className="size-3.5" aria-hidden />
            Descargar archivos (ZIP)
          </a>
        </div>
      </header>

      {urlPortada ? (
        <div className="aspect-[16/9] overflow-hidden rounded-card border border-line bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urlPortada}
            alt={`Portada de ${proyecto.title}`}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[16/9] flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong bg-surface/50 text-muted">
          <ImageOff className="size-6" aria-hidden />
          <span className="text-xs">El alumno todavía no subió la portada</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ficha del proyecto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            {ficha.map((f) => (
              <div key={f.etiqueta} className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted">{f.etiqueta}</dt>
                <dd className="truncate text-sm text-ink">{f.valor || '—'}</dd>
              </div>
            ))}
          </dl>

          {proyecto.measurements && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Medidas</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{proyecto.measurements}</p>
            </div>
          )}

          {proyecto.materials && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Materiales</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{proyecto.materials}</p>
            </div>
          )}

          {proyecto.notes && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Observaciones</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{proyecto.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {archivosDelProyecto.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Moldes y archivos del proyecto</CardTitle>
          </CardHeader>
          <CardContent>
            <Attachments archivos={archivosDelProyecto} urls={urls} puedeEditar={false} />
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Avances</h2>

        <Callout tone="info">
          El cuaderno lo escribe el alumno. Desde acá lo ves, pero no lo editás: los avances y los
          archivos son suyos.
        </Callout>

        <Timeline
          projectId={proyecto.id}
          studentId={proyecto.student_id}
          entradas={entradas}
          archivos={archivos}
          urls={urls}
          puedeEditar={false}
        />
      </section>

      {editando && (
        <AdminProjectForm
          proyecto={proyecto}
          alumnos={alumnos}
          tipos={tipos}
          onClose={() => setEditando(false)}
        />
      )}

      <ConfirmDialog
        open={borrando}
        onClose={() => setBorrando(false)}
        onConfirm={confirmarEliminar}
        title="Eliminar proyecto"
        description={`Vas a eliminar «${proyecto.title}» con todos sus avances, fotos, videos y moldes. El alumno lo pierde también. No se puede recuperar.`}
        requireText="ELIMINAR"
      />
    </div>
  );
}
