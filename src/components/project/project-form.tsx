'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { guardarProyecto, guardarProyectoAdmin } from '@/app/actions/projects';
import {
  esquemaProyecto,
  esquemaProyectoAdmin,
  type DatosProyecto,
  type DatosProyectoAdmin,
} from '@/lib/validations/projects';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO, opciones } from '@/lib/labels';
import type { Proyecto } from '@/lib/services/projects';

/**
 * Alta y edición de un proyecto.
 *
 * Hay dos formularios porque son dos cosas distintas:
 *  · El alumno crea SU proyecto (el dueño se deduce de la sesión).
 *  · La administradora lo crea A NOMBRE de un alumno, y puede destacarlo.
 *
 * El del panel no tiene portada ni adjuntos: la política de Storage solo deja
 * subir al alumno dueño de la carpeta, así que un botón ahí no funcionaría.
 * Antes que un botón muerto, ninguno.
 */

type Alumno = { id: string; first_name: string; last_name: string };

export function ProjectForm({
  proyecto,
  tipos = [],
  onClose,
  onGuardado,
}: {
  proyecto: Proyecto | null;
  /** Tipos de prenda ya usados, para sugerir sin obligar. */
  tipos?: string[];
  onClose: () => void;
  onGuardado?: (id: string) => void;
}) {
  const router = useRouter();
  const listaId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosProyecto>({
    resolver: zodResolver(esquemaProyecto),
    defaultValues: valoresIniciales(proyecto),
  });

  async function onSubmit(datos: DatosProyecto) {
    const r = await guardarProyecto(proyecto?.id ?? null, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
    onGuardado?.(r.data.id);
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}
      description={
        proyecto
          ? undefined
          : 'Después de crearlo vas a poder subir la portada y cargar los avances.'
      }
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="proyecto-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="proyecto-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Título"
          placeholder="Vestido de fiesta"
          required
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Descripción"
          rows={2}
          placeholder="Vestido largo con escote en V y tajo lateral"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tipo de prenda"
            placeholder="Vestido"
            list={listaId}
            error={errors.garment_type?.message}
            {...register('garment_type')}
          />
          <datalist id={listaId}>
            {tipos.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <Input
            label="Tipo de tela"
            placeholder="Gasa"
            error={errors.fabric_type?.message}
            {...register('fabric_type')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Dificultad"
            required
            error={errors.difficulty?.message}
            {...register('difficulty')}
          >
            {opciones(DIFICULTAD_PROYECTO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select label="Estado" required error={errors.status?.message} {...register('status')}>
            {opciones(ESTADO_PROYECTO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Fecha de inicio"
            type="date"
            error={errors.start_date?.message}
            {...register('start_date')}
          />
          <Input
            label="Fecha de fin"
            type="date"
            error={errors.end_date?.message}
            {...register('end_date')}
          />
        </div>

        <Textarea
          label="Medidas"
          rows={2}
          placeholder="Busto 90 · Cintura 72 · Cadera 98 · Largo 140"
          error={errors.measurements?.message}
          {...register('measurements')}
        />

        <Textarea
          label="Materiales"
          rows={2}
          placeholder="3 m de gasa, 1 cierre invisible de 40 cm, hilo al tono"
          error={errors.materials?.message}
          {...register('materials')}
        />

        <Textarea
          label="Observaciones"
          rows={2}
          placeholder="Ajustar la pinza del delantero la próxima vez"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}

export function AdminProjectForm({
  proyecto,
  alumnos,
  tipos = [],
  onClose,
}: {
  proyecto: Proyecto | null;
  alumnos: Alumno[];
  tipos?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const listaId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosProyectoAdmin>({
    resolver: zodResolver(esquemaProyectoAdmin),
    defaultValues: {
      ...valoresIniciales(proyecto),
      student_id: proyecto?.student_id ?? '',
      is_featured: proyecto?.is_featured ?? false,
    },
  });

  async function onSubmit(datos: DatosProyectoAdmin) {
    const r = await guardarProyectoAdmin(proyecto?.id ?? null, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}
      description="El proyecto queda a nombre del alumno: es él quien sube las fotos y carga los avances."
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="proyecto-admin-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="proyecto-admin-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-4"
      >
        <Select
          label="Alumno"
          required
          autoFocus
          error={errors.student_id?.message}
          {...register('student_id')}
        >
          <option value="">Elegí un alumno…</option>
          {alumnos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.last_name}, {a.first_name}
            </option>
          ))}
        </Select>

        <Input
          label="Título"
          placeholder="Vestido de fiesta"
          required
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Descripción"
          rows={2}
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tipo de prenda"
            placeholder="Vestido"
            list={listaId}
            error={errors.garment_type?.message}
            {...register('garment_type')}
          />
          <datalist id={listaId}>
            {tipos.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <Input
            label="Tipo de tela"
            placeholder="Gasa"
            error={errors.fabric_type?.message}
            {...register('fabric_type')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Dificultad"
            required
            error={errors.difficulty?.message}
            {...register('difficulty')}
          >
            {opciones(DIFICULTAD_PROYECTO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select label="Estado" required error={errors.status?.message} {...register('status')}>
            {opciones(ESTADO_PROYECTO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Fecha de inicio"
            type="date"
            error={errors.start_date?.message}
            {...register('start_date')}
          />
          <Input
            label="Fecha de fin"
            type="date"
            error={errors.end_date?.message}
            {...register('end_date')}
          />
        </div>

        <Textarea
          label="Medidas"
          rows={2}
          error={errors.measurements?.message}
          {...register('measurements')}
        />

        <Textarea
          label="Materiales"
          rows={2}
          error={errors.materials?.message}
          {...register('materials')}
        />

        <Textarea
          label="Observaciones"
          rows={2}
          error={errors.notes?.message}
          {...register('notes')}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_featured')}
          />
          Destacar el proyecto
          <span className="text-xs text-muted">(uso interno)</span>
        </label>
      </form>
    </Dialog>
  );
}

/** Valores del formulario a partir de la fila (o los de un proyecto nuevo). */
function valoresIniciales(proyecto: Proyecto | null): DatosProyecto {
  return {
    title: proyecto?.title ?? '',
    description: proyecto?.description ?? '',
    garment_type: proyecto?.garment_type ?? '',
    fabric_type: proyecto?.fabric_type ?? '',
    measurements: proyecto?.measurements ?? '',
    materials: proyecto?.materials ?? '',
    difficulty: proyecto?.difficulty ?? 'inicial',
    start_date: proyecto?.start_date ?? '',
    end_date: proyecto?.end_date ?? '',
    status: proyecto?.status ?? 'idea',
    notes: proyecto?.notes ?? '',
  };
}
