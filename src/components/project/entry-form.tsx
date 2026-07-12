'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CloudUpload, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { autoguardarEntrada, guardarEntrada } from '@/app/actions/projects';
import { esquemaEntrada, type DatosEntrada } from '@/lib/validations/projects';
import { todayISO } from '@/lib/format';
import type { Archivo, Entrada } from '@/lib/services/projects';
import type { LimitesArchivo } from '@/lib/storage';
import { FileUploader } from './file-uploader';
import { Attachments } from './attachments';

/**
 * Formulario de un avance, con GUARDADO AUTOMÁTICO de borradores.
 *
 * Se autoguarda a los ~2 s de dejar de escribir (`project_entries.is_draft`).
 * Alguien que está cosiendo escribe con las manos ocupadas, se le cae el
 * teléfono o se le va el navegador: lo escrito no se pierde.
 *
 * Dos cuidados que no se ven pero importan:
 *  · El primer autoguardado devuelve el id y lo recordamos, así el resto
 *    ACTUALIZA esa fila en vez de sembrar un borrador nuevo por cada tecla.
 *  · Al guardar de verdad esperamos al autoguardado en vuelo; si no, los dos
 *    insertarían y quedarían dos avances iguales.
 */

const SEGUNDOS_AUTOGUARDADO = 2000;

type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error';

export function EntryForm({
  projectId,
  studentId,
  entrada,
  archivos,
  urls,
  limites,
  onClose,
}: {
  projectId: string;
  studentId: string;
  /** null = avance nuevo. */
  entrada: Entrada | null;
  archivos: Archivo[];
  urls: Record<string, string>;
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  const [entryId, setEntryId] = useState<string | null>(entrada?.id ?? null);
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo');

  const idRef = useRef<string | null>(entrada?.id ?? null);
  const enVueloRef = useRef<Promise<void> | null>(null);
  const enviandoRef = useRef(false);
  const relojRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    subscribe,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<DatosEntrada>({
    resolver: zodResolver(esquemaEntrada),
    defaultValues: {
      title: entrada?.title ?? '',
      body: entrada?.body ?? '',
      step_notes: entrada?.step_notes ?? '',
      entry_date: entrada?.entry_date ?? todayISO(),
      materials_used: entrada?.materials_used ?? '',
      measurements: entrada?.measurements ?? '',
    },
  });

  /**
   * Nos suscribimos a los cambios del formulario y reprogramamos el reloj en
   * cada tecla: el guardado sale ~2 s después de la última.
   *
   * Va por `subscribe()` (no por `watch()` ni por un efecto que mire los
   * valores): así el formulario no re-renderiza en cada tecla y el setState
   * ocurre dentro del callback de una suscripción, que es donde corresponde.
   */
  useEffect(() => {
    const desuscribir = subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        if (enviandoRef.current) return;

        // No sembramos borradores vacíos: si todavía no escribió nada, no hay
        // nada que guardar.
        const hayAlgo = !!(
          values.title?.trim() ||
          values.body?.trim() ||
          values.step_notes?.trim()
        );
        if (!hayAlgo) return;

        setEstado('pendiente');

        if (relojRef.current) clearTimeout(relojRef.current);

        relojRef.current = setTimeout(() => {
          // Puede haber apretado Guardar mientras corría el reloj.
          if (enviandoRef.current) return;

          const promesa = (async () => {
            setEstado('guardando');
            const r = await autoguardarEntrada(projectId, idRef.current, getValues());

            if (r.ok) {
              idRef.current = r.data.id;
              setEntryId(r.data.id);
              setEstado('guardado');
            } else {
              setEstado('error');
            }
          })();

          enVueloRef.current = promesa;
          void promesa.finally(() => {
            if (enVueloRef.current === promesa) enVueloRef.current = null;
          });
        }, SEGUNDOS_AUTOGUARDADO);
      },
    });

    return () => {
      desuscribir();
      if (relojRef.current) clearTimeout(relojRef.current);
    };
  }, [subscribe, getValues, projectId]);

  async function alGuardar(datos: DatosEntrada) {
    enviandoRef.current = true;
    if (relojRef.current) clearTimeout(relojRef.current);

    try {
      // Si hay un autoguardado en vuelo, lo esperamos: si no, los dos podrían
      // insertar y quedarían dos avances iguales.
      if (enVueloRef.current) await enVueloRef.current;

      const r = await guardarEntrada(projectId, idRef.current, datos);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onClose();
      router.refresh();
    } finally {
      enviandoRef.current = false;
    }
  }

  const adjuntosDeLaEntrada = archivos.filter((a) => a.entry_id === entryId);

  return (
    <Dialog
      open
      onClose={onClose}
      title={entrada ? 'Editar avance' : 'Nuevo avance'}
      description="Contá qué hiciste hoy. Se guarda solo mientras escribís."
      className="max-w-lg"
      footer={
        <>
          <AvisoGuardado estado={estado} />
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cerrar
          </Button>
          <Button form="entrada-form" type="submit" loading={isSubmitting}>
            Guardar avance
          </Button>
        </>
      }
    >
      {/* handleSubmit() se llama al enviar, no al renderizar: el onSubmit lee
          refs y no deben tocarse durante el render. */}
      <form
        id="entrada-form"
        onSubmit={(e) => void handleSubmit(alGuardar)(e)}
        noValidate
        className="space-y-4"
      >
        <Input
          label="Título"
          placeholder="Corté las piezas"
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Input
          label="Fecha"
          type="date"
          required
          error={errors.entry_date?.message}
          {...register('entry_date')}
        />

        <Textarea
          label="Qué hiciste"
          rows={4}
          placeholder="Hoy corté las piezas del delantero y armé las pinzas…"
          error={errors.body?.message}
          {...register('body')}
        />

        <Textarea
          label="Paso a paso"
          rows={4}
          placeholder={'1. Planché la tela\n2. Marqué las pinzas\n3. Corté con 1 cm de costura'}
          hint="Las anotaciones que te sirvan para repetirlo."
          error={errors.step_notes?.message}
          {...register('step_notes')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label="Materiales usados"
            rows={2}
            placeholder="Hilo poliéster, 2 m de gabardina"
            error={errors.materials_used?.message}
            {...register('materials_used')}
          />
          <Textarea
            label="Medidas"
            rows={2}
            placeholder="Cintura 72 cm · Largo 98 cm"
            error={errors.measurements?.message}
            {...register('measurements')}
          />
        </div>

        {/* Adjuntos: necesitan que el avance exista (el archivo se cuelga de su
            id). El autoguardado crea el borrador solo, así que en cuanto haya
            algo escrito aparece el botón. */}
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-medium text-ink">Fotos, videos y moldes</h3>

          {entryId ? (
            <>
              <FileUploader
                studentId={studentId}
                projectId={projectId}
                entryId={entryId}
                limites={limites}
              />
              <Attachments archivos={adjuntosDeLaEntrada} urls={urls} puedeEditar />
            </>
          ) : (
            <p className="text-xs text-muted">
              Escribí algo y, en cuanto se guarde el borrador (un par de segundos), vas a poder
              adjuntar fotos, videos y moldes.
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** Estado del autoguardado. Silencioso, pero visible: la persona tiene que saber. */
function AvisoGuardado({ estado }: { estado: EstadoGuardado }) {
  if (estado === 'inactivo') return <span className="mr-auto" />;

  const contenido = {
    pendiente: (
      <>
        <CloudUpload className="size-3.5" aria-hidden />
        Sin guardar…
      </>
    ),
    guardando: (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Guardando…
      </>
    ),
    guardado: (
      <>
        <Check className="size-3.5 text-success" aria-hidden />
        Borrador guardado
      </>
    ),
    error: (
      <>
        <TriangleAlert className="size-3.5 text-danger" aria-hidden />
        No se pudo guardar el borrador
      </>
    ),
  }[estado];

  return (
    <span
      aria-live="polite"
      className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted"
    >
      {contenido}
    </span>
  );
}
