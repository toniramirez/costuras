'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/field';
import {
  BUCKET_NOVEDADES,
  esquemaNovedad,
  parseAdjuntos,
  type DatosNovedad,
} from '@/lib/validations/comms';
import { guardarNovedad } from '@/app/actions/comms';
// Solo TIPOS del servicio: es `server-only` y esto corre en el navegador.
import type { Novedad, OpcionesDestinatarios } from '@/lib/services/comms';
import type { LimitesArchivo } from '@/lib/storage';
import { PRIORIDAD, opciones } from '@/lib/labels';
import { AdjuntosField, ImagenField } from '@/app/admin/comunicados/_partes/archivos';
import { DestinatariosField } from '@/app/admin/comunicados/_partes/destinatarios';
import { ESTADOS_EDITABLES, fechaParaInput } from '@/app/admin/comunicados/_partes/comunes';

/**
 * Alta y edición de una novedad.
 *
 * Comparte con los comunicados el selector de destinatarios y la subida de
 * archivos: es el mismo mecanismo (ver `/admin/comunicados/_partes`).
 *
 * El id se genera acá, antes de subir nada: la imagen y los adjuntos van a
 * `announcements/<id>/<archivo>` y la política del bucket se apoya en esa carpeta.
 */
export function NovedadForm({
  novedad,
  opcionesDestino,
  limites,
  onClose,
}: {
  novedad: Novedad | null;
  opcionesDestino: OpcionesDestinatarios;
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [id] = useState(() => novedad?.id ?? crypto.randomUUID());

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosNovedad>({
    resolver: zodResolver(esquemaNovedad),
    defaultValues: {
      title: novedad?.title ?? '',
      content: novedad?.content ?? '',
      image_path: novedad?.image_path ?? '',
      attachments: parseAdjuntos(novedad?.attachments),
      published_at: fechaParaInput(novedad?.published_at),
      expires_at: fechaParaInput(novedad?.expires_at),
      priority: novedad?.priority ?? 'normal',
      is_pinned: novedad?.is_pinned ?? false,
      status: novedad?.status === 'publicada' ? 'publicada' : 'borrador',
      scope: novedad?.scope ?? 'todos',
      group_id: undefined,
      workshop_id: undefined,
      student_ids: [],
    },
  });

  const destino = {
    scope: watch('scope'),
    group_id: watch('group_id'),
    workshop_id: watch('workshop_id'),
    student_ids: watch('student_ids'),
  };

  // El alcance se guarda; la lista concreta se expande al publicar. Si hacía falta
  // un destino puntual, hay que volver a elegirlo (le mostramos cuál era).
  const faltaElegir =
    (destino.scope === 'grupo' && !destino.group_id) ||
    (destino.scope === 'taller' && !destino.workshop_id) ||
    (destino.scope === 'alumno' && (destino.student_ids?.length ?? 0) === 0);
  const avisoBorrador =
    novedad && faltaElegir && novedad.scope === destino.scope ? novedad.scope_label : null;

  async function onSubmit(datos: DatosNovedad) {
    const r = await guardarNovedad(id, datos);
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
      title={novedad ? 'Editar novedad' : 'Nueva novedad'}
      description="Las novedades se ven en el inicio del alumno. Las vencidas pasan al historial."
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="novedad-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="novedad-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Título"
          placeholder="Receso de invierno"
          required
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Contenido"
          rows={6}
          placeholder="Contá la novedad…"
          required
          error={errors.content?.message}
          {...register('content')}
        />

        <ImagenField
          bucket={BUCKET_NOVEDADES}
          carpeta={id}
          limites={limites}
          value={watch('image_path') ?? ''}
          onChange={(path) => setValue('image_path', path)}
          error={errors.image_path?.message}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Se publica el"
            type="date"
            hint="Vacío = ahora."
            error={errors.published_at?.message}
            {...register('published_at')}
          />
          <Input
            label="Vence el"
            type="date"
            hint="Después pasa al historial."
            error={errors.expires_at?.message}
            {...register('expires_at')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Prioridad" required error={errors.priority?.message} {...register('priority')}>
            {opciones(PRIORIDAD).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select label="Estado" required error={errors.status?.message} {...register('status')}>
            {ESTADOS_EDITABLES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <DestinatariosField
          opciones={opcionesDestino}
          valor={destino}
          avisoBorrador={avisoBorrador}
          onChange={(v) => {
            setValue('scope', v.scope);
            setValue('group_id', v.group_id);
            setValue('workshop_id', v.workshop_id);
            setValue('student_ids', v.student_ids ?? []);
          }}
          errores={{
            scope: errors.scope?.message,
            group_id: errors.group_id?.message,
            workshop_id: errors.workshop_id?.message,
            student_ids: errors.student_ids?.message,
          }}
        />

        <AdjuntosField
          bucket={BUCKET_NOVEDADES}
          carpeta={id}
          limites={limites}
          value={watch('attachments')}
          onChange={(a) => setValue('attachments', a)}
          error={errors.attachments?.message}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_pinned')}
          />
          Fijar arriba de todo
        </label>
      </form>
    </Dialog>
  );
}
