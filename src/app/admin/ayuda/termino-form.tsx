'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Textarea } from '@/components/ui/field';
import { CampoArchivo } from '@/components/library/campo-archivo';
import {
  guardarTermino,
  actualizarArchivoTermino,
  quitarArchivoTermino,
} from '@/app/actions/library';
import { esquemaTermino, type CampoTermino, type DatosTermino } from '@/lib/validations/library';
import type { TerminoConArchivos } from '@/lib/services/library';
import { TIPOS, type LimitesArchivo } from '@/lib/storage';
import { subirALaBiblioteca } from '@/lib/library-upload';

/**
 * Ficha de un término del glosario.
 *
 * Las tres piezas de material —imagen, video y PDF— son OPCIONALES y viven en
 * columnas distintas de la misma fila, no en una tabla de adjuntos: son siempre
 * las mismas tres y nunca hay dos de la misma clase. Una tabla aparte sería
 * infraestructura para un problema que no existe.
 */
const ADJUNTOS = [
  {
    campo: 'image_path' as const,
    label: 'Imagen (opcional)',
    tipo: 'imagen' as const,
    accept: TIPOS.imagen.join(','),
  },
  {
    campo: 'video_path' as const,
    label: 'Video (opcional)',
    tipo: 'video' as const,
    accept: TIPOS.video.join(','),
  },
  {
    campo: 'pdf_path' as const,
    label: 'PDF (opcional)',
    tipo: 'pdf' as const,
    accept: 'application/pdf',
  },
];

export function TerminoForm({
  termino,
  /** Si la ficha nace de lo que pidió una alumna, la sugerencia se marca sola. */
  sugerencia,
  limites,
  onClose,
}: {
  termino: TerminoConArchivos | null;
  sugerencia?: { id: string; term: string } | null;
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  const [archivos, setArchivos] = useState<Partial<Record<CampoTermino, File>>>({});
  const [subiendo, setSubiendo] = useState<CampoTermino | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<TerminoConArchivos | null>(termino);
  const [idCreado, setIdCreado] = useState<string | null>(null);

  const idActual = termino?.id ?? idCreado;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosTermino>({
    resolver: zodResolver(esquemaTermino),
    defaultValues: {
      term: termino?.term ?? sugerencia?.term ?? '',
      definition: termino?.definition ?? '',
      usage_notes: termino?.usage_notes ?? '',
      video_url: termino?.video_url ?? '',
      is_published: termino?.is_published ?? true,
    },
  });

  /** URL y nombre de lo que ya está guardado en cada campo. */
  function actualDe(campo: CampoTermino) {
    if (!guardado) return null;
    const ruta = guardado[campo];
    if (!ruta) return null;

    const url =
      campo === 'image_path'
        ? guardado.imagenUrl
        : campo === 'video_path'
          ? guardado.videoUrl
          : guardado.pdfUrl;

    return { url, nombre: ruta.split('/').pop() ?? 'Archivo cargado' };
  }

  async function quitar(campo: CampoTermino) {
    if (!idActual) return;
    const r = await quitarArchivoTermino(idActual, campo);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setGuardado((prev) => (prev ? { ...prev, [campo]: null } : prev));
    toast.success(r.message);
    router.refresh();
  }

  async function onSubmit(datos: DatosTermino) {
    const r = await guardarTermino(idActual, datos, sugerencia?.id ?? null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const id = r.data.id;
    setIdCreado(id);

    // Los archivos van de a uno: en un celular, tres subidas en paralelo se
    // pisan entre sí y el porcentaje deja de significar nada.
    for (const [campo, file] of Object.entries(archivos) as Array<[CampoTermino, File]>) {
      setSubiendo(campo);
      setProgreso(0);
      const subida = await subirALaBiblioteca('glosario', id, file, setProgreso);
      setProgreso(null);
      setSubiendo(null);

      if ('error' in subida) {
        toast.error(`${subida.error} El término se guardó igual: probá subir el archivo de nuevo.`);
        router.refresh();
        return;
      }

      const registro = await actualizarArchivoTermino(id, campo, subida.archivo);
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
      title={termino ? 'Editar término' : 'Nuevo término'}
      description={
        sugerencia
          ? `Estás creando la ficha de «${sugerencia.term}», que pidió una alumna.`
          : 'Se ordena solo, alfabéticamente, en el glosario de las alumnas.'
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || trabajando}>
            Cancelar
          </Button>
          <Button form="termino-form" type="submit" loading={isSubmitting || trabajando}>
            {trabajando ? `Subiendo… ${progreso}%` : 'Guardar'}
          </Button>
        </>
      }
    >
      <form
        id="termino-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
      >
        <Input
          label="Palabra"
          placeholder="Hilván"
          required
          autoFocus
          error={errors.term?.message}
          {...register('term')}
        />

        <Textarea
          label="¿Qué es?"
          rows={4}
          required
          placeholder="Costura provisoria de puntadas largas que sujeta dos telas antes de coserlas de verdad."
          error={errors.definition?.message}
          {...register('definition')}
        />

        <Textarea
          label="¿Para qué sirve o cuándo se usa?"
          rows={4}
          placeholder="Se usa para probar el calce de una prenda antes de coserla a máquina. Después se saca."
          error={errors.usage_notes?.message}
          {...register('usage_notes')}
        />

        {ADJUNTOS.map((adjunto) => (
          <CampoArchivo
            key={adjunto.campo}
            label={adjunto.label}
            tipo={adjunto.tipo}
            accept={adjunto.accept}
            limites={limites}
            actual={actualDe(adjunto.campo)}
            archivo={archivos[adjunto.campo] ?? null}
            progreso={subiendo === adjunto.campo ? progreso : null}
            onElegir={(file) => setArchivos((prev) => ({ ...prev, [adjunto.campo]: file }))}
            onQuitar={idActual ? () => quitar(adjunto.campo) : undefined}
            onError={(mensaje) => toast.error(mensaje)}
          />
        ))}

        <Input
          label="…o enlace a un video (opcional)"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          hint="Para videos largos alojados afuera. Si subís un archivo, manda el archivo."
          error={errors.video_url?.message}
          {...register('video_url')}
        />

        <Checkbox
          label="Visible para las alumnas"
          hint="Sacá el tilde para dejarlo como borrador mientras lo preparás."
          {...register('is_published')}
        />
      </form>
    </Dialog>
  );
}
