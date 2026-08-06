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
  guardarMolde,
  actualizarArchivoMolde,
  quitarPortadaMolde,
} from '@/app/actions/library';
import { esquemaMolde, type CampoMolde, type DatosMolde } from '@/lib/validations/library';
import type { Categoria, MoldeConArchivos } from '@/lib/services/library';
import { TIPOS, type LimitesArchivo } from '@/lib/storage';
import { subirALaBiblioteca } from '@/lib/library-upload';

/**
 * Alta y edición de un molde digital.
 *
 * El PDF es lo único que no es opcional: un molde sin archivo no es un molde. Se
 * exige acá, en el navegador, porque en la base la columna tiene que admitir
 * null: la ruta del bucket necesita el id de la fila y ese id recién existe
 * después de guardar. La base guarda el hueco un instante; la interfaz no deja
 * que ese instante se vuelva permanente.
 */
export function MoldeForm({
  molde,
  categorias,
  limites,
  onClose,
}: {
  molde: MoldeConArchivos | null;
  categorias: Categoria[];
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  const [archivos, setArchivos] = useState<Partial<Record<CampoMolde, File>>>({});
  const [subiendo, setSubiendo] = useState<CampoMolde | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<MoldeConArchivos | null>(molde);
  const [idCreado, setIdCreado] = useState<string | null>(null);
  const [faltaPdf, setFaltaPdf] = useState(false);

  const idActual = molde?.id ?? idCreado;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosMolde>({
    resolver: zodResolver(esquemaMolde),
    defaultValues: {
      title: molde?.title ?? '',
      description: molde?.description ?? '',
      category_id: molde?.category_id ?? '',
      sort_order: molde?.sort_order ?? 100,
      is_published: molde?.is_published ?? true,
    },
  });

  async function quitarPortada() {
    if (!idActual) return;
    const r = await quitarPortadaMolde(idActual);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setGuardado((prev) => (prev ? { ...prev, cover_image_path: null, portadaUrl: null } : prev));
    toast.success(r.message);
    router.refresh();
  }

  async function onSubmit(datos: DatosMolde) {
    const hayPdf = Boolean(archivos.storage_path || guardado?.storage_path);
    if (!hayPdf) {
      setFaltaPdf(true);
      toast.error('Falta el PDF del molde.');
      return;
    }
    setFaltaPdf(false);

    const r = await guardarMolde(idActual, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const id = r.data.id;
    setIdCreado(id);

    // De a uno: dos subidas en paralelo desde un celular se pisan y el
    // porcentaje deja de significar nada.
    for (const [campo, file] of Object.entries(archivos) as Array<[CampoMolde, File]>) {
      setSubiendo(campo);
      setProgreso(0);
      const subida = await subirALaBiblioteca('molderia', id, file, setProgreso);
      setProgreso(null);
      setSubiendo(null);

      if ('error' in subida) {
        toast.error(`${subida.error} El molde se guardó igual: probá subir el archivo de nuevo.`);
        router.refresh();
        return;
      }

      const registro = await actualizarArchivoMolde(id, campo, subida.archivo);
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

  const trabajando = subiendo !== null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={molde ? 'Editar molde' : 'Nuevo molde'}
      description="Las alumnas lo van a poder abrir y descargar desde «Moldería digital»."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || trabajando}>
            Cancelar
          </Button>
          <Button form="molde-form" type="submit" loading={isSubmitting || trabajando}>
            {trabajando ? `Subiendo… ${progreso}%` : 'Guardar'}
          </Button>
        </>
      }
    >
      <form
        id="molde-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
      >
        <Input
          label="Nombre del molde"
          placeholder="Falda recta talle 38-46"
          required
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Textarea
          label="Descripción breve"
          rows={2}
          placeholder="Qué prenda es, qué talles incluye, cómo hay que imprimirlo."
          error={errors.description?.message}
          {...register('description')}
        />

        <CampoArchivo
          label="Archivo PDF del molde"
          hint={`Hasta ${limites.max_document_mb} MB.`}
          tipo="pdf"
          accept="application/pdf"
          limites={limites}
          actual={
            guardado?.storage_path
              ? { url: guardado.pdfUrl, nombre: guardado.file_name ?? 'Molde cargado' }
              : null
          }
          archivo={archivos.storage_path ?? null}
          progreso={subiendo === 'storage_path' ? progreso : null}
          onElegir={(file) => {
            setFaltaPdf(false);
            setArchivos((prev) => ({ ...prev, storage_path: file }));
          }}
          onError={(mensaje) => toast.error(mensaje)}
        />

        {faltaPdf && (
          <p role="alert" className="-mt-2 text-xs font-medium text-danger">
            Elegí el PDF del molde: sin archivo no hay nada para descargar.
          </p>
        )}

        <CampoArchivo
          label="Imagen de portada (opcional)"
          hint={`Hasta ${limites.max_image_mb} MB. Es lo que se ve en la tarjeta del molde.`}
          tipo="imagen"
          accept={TIPOS.imagen.join(',')}
          limites={limites}
          actual={
            guardado?.cover_image_path
              ? { url: guardado.portadaUrl, nombre: 'Portada cargada' }
              : null
          }
          archivo={archivos.cover_image_path ?? null}
          progreso={subiendo === 'cover_image_path' ? progreso : null}
          onElegir={(file) => setArchivos((prev) => ({ ...prev, cover_image_path: file }))}
          onQuitar={idActual ? quitarPortada : undefined}
          onError={(mensaje) => toast.error(mensaje)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Categoría"
            hint="Opcional. Es la sección donde va a aparecer."
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

          <Input
            label="Orden"
            type="number"
            min={0}
            hint="Dentro de la categoría, de menor a mayor."
            error={errors.sort_order?.message}
            {...register('sort_order', { valueAsNumber: true })}
          />
        </div>

        <Checkbox
          label="Visible para las alumnas"
          hint="Sacá el tilde para dejarlo como borrador mientras lo preparás."
          {...register('is_published')}
        />
      </form>
    </Dialog>
  );
}
