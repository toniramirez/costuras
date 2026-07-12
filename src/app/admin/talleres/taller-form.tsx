'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { esquemaTaller, type DatosTaller } from '@/lib/validations/workshops';
import {
  guardarTaller,
  actualizarImagenTaller,
  quitarImagenTaller,
} from '@/app/actions/workshops';
import type { TallerConCupo } from '@/lib/services/workshops';
import { ESTADO_TALLER, opciones } from '@/lib/labels';
import { centsToPesos } from '@/lib/format';
import {
  subirArchivo,
  validarArchivo,
  nombreSeguro,
  type LimitesArchivo,
} from '@/lib/storage';

export type Caja = { id: string; name: string };

/**
 * Alta y edición de un taller.
 *
 * La imagen se sube DESPUÉS de guardar: el bucket exige la ruta
 * `workshops/<workshop_id>/<archivo>` y hasta que el taller no existe no hay id.
 * Por eso el orden es: guardar → subir → registrar la ruta.
 */
export function TallerForm({
  taller,
  cajas,
  limites,
  onClose,
}: {
  taller: TallerConCupo | null;
  cajas: Caja[];
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [imagenActual, setImagenActual] = useState<string | null>(taller?.imagenUrl ?? null);
  // Si la subida falla después de crear el taller, no queremos crear otro al
  // reintentar: guardamos el id recién creado y a partir de ahí actualizamos.
  const [idCreado, setIdCreado] = useState<string | null>(null);

  const idActual = taller?.id ?? idCreado;

  // La vista previa es una URL de objeto: hay que liberarla cuando cambia o cuando
  // se cierra el diálogo, o se filtra memoria.
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosTaller>({
    resolver: zodResolver(esquemaTaller),
    defaultValues: taller
      ? {
          name: taller.name,
          description: taller.description ?? '',
          category: taller.category ?? '',
          responsible_name: taller.responsible_name ?? '',
          event_date: taller.event_date ?? '',
          start_time: taller.start_time?.slice(0, 5) ?? '',
          end_time: taller.end_time?.slice(0, 5) ?? '',
          capacity: taller.capacity,
          precio: centsToPesos(Number(taller.price_cents)),
          materials_included: taller.materials_included ?? '',
          materials_to_bring: taller.materials_to_bring ?? '',
          location: taller.location ?? '',
          status: taller.status,
          cash_account_id: taller.cash_account_id ?? '',
        }
      : {
          name: '',
          description: '',
          category: '',
          responsible_name: '',
          event_date: '',
          start_time: '',
          end_time: '',
          capacity: 10,
          precio: 0,
          materials_included: '',
          materials_to_bring: '',
          location: '',
          status: 'borrador',
          cash_account_id: '',
        },
  });

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setArchivo(null);
      setVistaPrevia(null);
      return;
    }

    // Tipo y tamaño se validan ANTES de subir: los límites salen de la
    // configuración de la academia, no están escritos a mano en el código.
    const problema = validarArchivo(file, limites);
    if (problema) {
      toast.error(problema);
      e.target.value = '';
      return;
    }

    setArchivo(file);
    setVistaPrevia(URL.createObjectURL(file));
  }

  async function quitarImagen() {
    if (!idActual) return;
    const r = await quitarImagenTaller(idActual);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setImagenActual(null);
    toast.success(r.message);
    router.refresh();
  }

  async function onSubmit(datos: DatosTaller) {
    const r = await guardarTaller(idActual, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const id = r.data.id;
    setIdCreado(id);

    if (archivo) {
      setProgreso(0);
      const subida = await subirArchivo(
        'workshops',
        `${id}/${nombreSeguro(archivo.name)}`,
        archivo,
        setProgreso,
      );
      setProgreso(null);

      if ('error' in subida) {
        // El taller quedó guardado; solo falló la imagen. No cerramos el diálogo
        // para que se pueda reintentar sin perder lo cargado.
        toast.error(`${subida.error} El taller se guardó igual: probá subir la imagen de nuevo.`);
        router.refresh();
        return;
      }

      const registro = await actualizarImagenTaller(id, subida.path);
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
      title={taller ? 'Editar taller' : 'Nuevo taller'}
      description="El lugar de cada persona recién se ocupa cuando se confirma su pago."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || subiendo}>
            Cancelar
          </Button>
          <Button form="taller-form" type="submit" loading={isSubmitting || subiendo}>
            {subiendo ? `Subiendo imagen… ${progreso}%` : 'Guardar'}
          </Button>
        </>
      }
    >
      <form
        id="taller-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
      >
        <Input
          label="Nombre"
          placeholder="Taller de bolsos de tela"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Categoría"
            placeholder="Accesorios"
            error={errors.category?.message}
            {...register('category')}
          />
          <Input
            label="Responsable"
            placeholder="Ana Paula"
            hint="Puede ser alguien externo a la academia."
            error={errors.responsible_name?.message}
            {...register('responsible_name')}
          />
        </div>

        <Textarea
          label="Descripción"
          rows={3}
          placeholder="De qué se trata el taller y a quién está dirigido."
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Fecha"
            type="date"
            error={errors.event_date?.message}
            {...register('event_date')}
          />
          <Input
            label="Hora de inicio"
            type="time"
            error={errors.start_time?.message}
            {...register('start_time')}
          />
          <Input
            label="Hora de fin"
            type="time"
            error={errors.end_time?.message}
            {...register('end_time')}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Cupo"
            type="number"
            min={0}
            required
            hint="0 = sin límite de lugares."
            error={errors.capacity?.message}
            {...register('capacity', { valueAsNumber: true })}
          />
          <MoneyInput
            label="Precio"
            required
            hint="En pesos. Si es 0, el taller es gratuito y la inscripción se confirma sola."
            error={errors.precio?.message}
            {...register('precio', { valueAsNumber: true })}
          />
        </div>

        <Input
          label="Ubicación"
          placeholder="Salón de la academia"
          error={errors.location?.message}
          {...register('location')}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea
            label="Materiales incluidos"
            rows={3}
            placeholder="Telas, hilos y moldes."
            error={errors.materials_included?.message}
            {...register('materials_included')}
          />
          <Textarea
            label="Materiales que trae la persona"
            rows={3}
            placeholder="Tijera, alfileres y cinta métrica."
            error={errors.materials_to_bring?.message}
            {...register('materials_to_bring')}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Estado" required error={errors.status?.message} {...register('status')}>
            {opciones(ESTADO_TALLER).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select
            label="Caja asociada"
            hint="Ahí entra el ingreso al confirmar cada pago."
            error={errors.cash_account_id?.message}
            {...register('cash_account_id')}
          >
            <option value="">Sin caja asignada</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {/* ── Imagen ────────────────────────────────────────────────────────── */}
        <Field label="Imagen del taller" hint={`Hasta ${limites.max_image_mb} MB. JPG, PNG o WebP.`}>
          <div className="flex items-center gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
              {vistaPrevia || imagenActual ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
                <img
                  src={vistaPrevia ?? imagenActual ?? ''}
                  alt="Imagen del taller"
                  className="size-full object-cover"
                />
              ) : (
                <ImagePlus className="size-5 text-muted" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={elegirArchivo}
                aria-label="Elegir imagen del taller"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-line/60 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
              />

              {subiendo && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              )}

              {imagenActual && !archivo && idActual && (
                <Button type="button" size="sm" variant="ghost" onClick={quitarImagen}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                  Quitar imagen
                </Button>
              )}
            </div>
          </div>
        </Field>
      </form>
    </Dialog>
  );
}
