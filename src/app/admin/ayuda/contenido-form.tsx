'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/field';
import { CampoArchivo } from '@/components/library/campo-archivo';
import {
  guardarContenido,
  actualizarArchivoContenido,
  quitarArchivoContenido,
} from '@/app/actions/library';
import {
  ACEPTA,
  esquemaContenido,
  TIPOS_CONTENIDO,
  type DatosContenido,
} from '@/lib/validations/library';
import type { Categoria, ContenidoConArchivo } from '@/lib/services/library';
import { TIPO_CONTENIDO } from '@/lib/labels';
import type { LimitesArchivo } from '@/lib/storage';
import { subirALaBiblioteca } from '@/lib/library-upload';

/**
 * Alta y edición de una publicación del centro de ayuda.
 *
 * El formulario cambia según el TIPO: un texto pide un cuerpo; un video, un
 * archivo o un enlace; una imagen o un PDF, un archivo. Mostrar los cuatro
 * campos siempre obligaría a adivinar cuáles ignorar.
 *
 * El archivo se sube DESPUÉS de guardar: la ruta del bucket es
 * `library/ayuda/<id>/<archivo>` y hasta que la fila no existe no hay id.
 */
export function ContenidoForm({
  contenido,
  categorias,
  limites,
  onClose,
}: {
  contenido: ContenidoConArchivo | null;
  categorias: Categoria[];
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  const [archivo, setArchivo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<ContenidoConArchivo | null>(contenido);
  // Si la subida falla después de crear la fila, al reintentar no queremos
  // crear otra: guardamos el id recién creado y de ahí en más actualizamos.
  const [idCreado, setIdCreado] = useState<string | null>(null);

  const idActual = contenido?.id ?? idCreado;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DatosContenido>({
    resolver: zodResolver(esquemaContenido),
    defaultValues: {
      kind: contenido?.kind ?? 'texto',
      title: contenido?.title ?? '',
      description: contenido?.description ?? '',
      body: contenido?.body ?? '',
      external_url: contenido?.external_url ?? '',
      category_id: contenido?.category_id ?? '',
      sort_order: contenido?.sort_order ?? 100,
      is_published: contenido?.is_published ?? true,
    },
  });

  const tipo = watch('kind');
  const esTexto = tipo === 'texto';
  const esVideo = tipo === 'video';

  async function quitarArchivo() {
    if (!idActual) return;
    const r = await quitarArchivoContenido(idActual);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setGuardado((prev) => (prev ? { ...prev, storage_path: null, file_name: null, url: null } : prev));
    toast.success(r.message);
    router.refresh();
  }

  async function onSubmit(datos: DatosContenido) {
    const r = await guardarContenido(idActual, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const id = r.data.id;
    setIdCreado(id);

    if (archivo && !esTexto) {
      setProgreso(0);
      const subida = await subirALaBiblioteca('ayuda', id, archivo, setProgreso);
      setProgreso(null);

      if ('error' in subida) {
        // Lo demás quedó guardado: no cerramos el diálogo para que se pueda
        // reintentar sin volver a escribir todo.
        toast.error(`${subida.error} El contenido se guardó igual: probá subir el archivo de nuevo.`);
        router.refresh();
        return;
      }

      const registro = await actualizarArchivoContenido(id, subida.archivo);
      if (!registro.ok) {
        toast.error(registro.error);
        router.refresh();
        return;
      }
    }

    toast.success(r.message);
    onClose();
    router.refresh();
  }

  const subiendo = progreso !== null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={contenido ? 'Editar contenido' : 'Nuevo contenido'}
      description="Lo que cargues acá lo ven las alumnas en «¡Necesito ayuda!»."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || subiendo}>
            Cancelar
          </Button>
          <Button form="contenido-form" type="submit" loading={isSubmitting || subiendo}>
            {subiendo ? `Subiendo… ${progreso}%` : 'Guardar'}
          </Button>
        </>
      }
    >
      <form
        id="contenido-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Tipo" required error={errors.kind?.message} {...register('kind')}>
            {TIPOS_CONTENIDO.map((valor) => (
              <option key={valor} value={valor}>
                {TIPO_CONTENIDO[valor].label}
              </option>
            ))}
          </Select>

          <Select
            label="Categoría"
            hint="Es la sección donde va a aparecer."
            error={errors.category_id?.message}
            {...register('category_id')}
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Título"
          placeholder="Cómo enhebrar la máquina"
          required
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Descripción breve"
          rows={2}
          placeholder="Una o dos líneas: qué va a encontrar la alumna acá."
          error={errors.description?.message}
          {...register('description')}
        />

        {esTexto ? (
          <Textarea
            label="Texto"
            rows={10}
            required
            placeholder="Escribí la explicación completa. Se muestra tal cual, respetando los saltos de línea."
            error={errors.body?.message}
            {...register('body')}
          />
        ) : (
          <>
            <CampoArchivo
              label={
                esVideo ? 'Video' : tipo === 'imagen' ? 'Imagen' : 'Archivo PDF'
              }
              hint={
                esVideo
                  ? `Hasta ${limites.max_video_mb} MB. Si el video pesa más, pegá el enlace acá abajo.`
                  : tipo === 'imagen'
                    ? `Hasta ${limites.max_image_mb} MB. JPG, PNG o WebP.`
                    : `Hasta ${limites.max_document_mb} MB.`
              }
              tipo={esVideo ? 'video' : tipo === 'imagen' ? 'imagen' : 'pdf'}
              accept={ACEPTA[tipo]}
              limites={limites}
              actual={
                guardado?.storage_path
                  ? { url: guardado.url, nombre: guardado.file_name ?? 'Archivo cargado' }
                  : null
              }
              archivo={archivo}
              progreso={progreso}
              onElegir={setArchivo}
              onQuitar={idActual ? quitarArchivo : undefined}
              onError={(mensaje) => toast.error(mensaje)}
            />

            {esVideo && (
              <Input
                label="…o enlace al video (opcional)"
                type="url"
                placeholder="https://www.youtube.com/watch?v=…"
                hint="Para videos largos alojados afuera. Si subís un archivo, manda el archivo."
                error={errors.external_url?.message}
                {...register('external_url')}
              />
            )}
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Orden"
            type="number"
            min={0}
            hint="Dentro de la categoría, de menor a mayor."
            error={errors.sort_order?.message}
            {...register('sort_order', { valueAsNumber: true })}
          />

          <Checkbox
            label="Visible para las alumnas"
            hint="Sacá el tilde para dejarlo como borrador mientras lo preparás."
            className="sm:mt-6"
            {...register('is_published')}
          />
        </div>
      </form>
    </Dialog>
  );
}
