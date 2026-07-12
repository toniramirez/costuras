'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/field';
import {
  BUCKET_COMUNICADOS,
  esquemaComunicado,
  parseAdjuntos,
  type DatosComunicado,
} from '@/lib/validations/comms';
import { guardarComunicado } from '@/app/actions/comms';
// Solo TIPOS del servicio: es `server-only` y esto corre en el navegador.
import type { Comunicado, OpcionesDestinatarios } from '@/lib/services/comms';
import type { LimitesArchivo } from '@/lib/storage';
import { PRIORIDAD, opciones } from '@/lib/labels';
import { AdjuntosField } from './archivos';
import { DestinatariosField, destinatariosAlcanzados } from './destinatarios';
import { fechaParaInput } from './comunes';

/**
 * Alta y edición de un comunicado.
 *
 * El id se genera ACÁ, antes de subir nada: los adjuntos van a
 * `communications/<id>/<archivo>` y la política del bucket se apoya en esa carpeta.
 *
 * El envío sale siempre desde este formulario (no hay un botón «enviar» suelto en
 * el listado): así la administradora ve a quién le va a llegar justo antes de
 * mandarlo, y lo confirma.
 */
export function ComunicadoForm({
  comunicado,
  opcionesDestino,
  limites,
  onClose,
}: {
  comunicado: Comunicado | null;
  opcionesDestino: OpcionesDestinatarios;
  limites: LimitesArchivo;
  onClose: () => void;
}) {
  const router = useRouter();

  // Estable entre renders: es la carpeta del bucket donde ya se están subiendo
  // los adjuntos.
  const [id] = useState(() => comunicado?.id ?? crypto.randomUUID());
  const [accion, setAccion] = useState<'borrador' | 'enviar' | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DatosComunicado>({
    resolver: zodResolver(esquemaComunicado),
    defaultValues: {
      subject: comunicado?.subject ?? '',
      body: comunicado?.body ?? '',
      priority: comunicado?.priority ?? 'normal',
      expires_at: fechaParaInput(comunicado?.expires_at),
      // Los adjuntos ya subidos vienen del jsonb; el destino concreto no se puede
      // precargar (ver `avisoBorrador`).
      attachments: parseAdjuntos(comunicado?.attachments),
      scope: comunicado?.scope ?? 'todos',
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
  const adjuntos = watch('attachments');
  const cuantos = destinatariosAlcanzados(opcionesDestino, destino).length;

  // Un borrador guarda el ALCANCE, no la lista: los destinatarios se expanden
  // recién al enviar. Si el alcance necesitaba un destino concreto, hay que
  // volver a elegirlo (y le mostramos cuál era).
  const faltaElegir =
    (destino.scope === 'grupo' && !destino.group_id) ||
    (destino.scope === 'taller' && !destino.workshop_id) ||
    (destino.scope === 'alumno' && (destino.student_ids?.length ?? 0) === 0);
  const avisoBorrador =
    comunicado && faltaElegir && comunicado.scope === destino.scope ? comunicado.scope_label : null;

  async function guardar(datos: DatosComunicado, enviar: boolean) {
    setAccion(enviar ? 'enviar' : 'borrador');
    const r = await guardarComunicado(id, datos, enviar);
    setAccion(null);

    if (!r.ok) {
      toast.error(r.error);
      setConfirmando(false);
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
      title={comunicado ? 'Editar comunicado' : 'Nuevo comunicado'}
      description="El alumno lo recibe en su bandeja y lo marca como leído. No puede responder."
      className="max-w-lg"
      footer={
        confirmando ? (
          <>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={accion !== null}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit((datos) => guardar(datos, true))}
              loading={accion === 'enviar'}
            >
              <Send className="size-4" aria-hidden />
              Sí, enviar a {cuantos} {cuantos === 1 ? 'alumno' : 'alumnos'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={handleSubmit((datos) => guardar(datos, false))}
              loading={accion === 'borrador'}
              disabled={accion !== null}
            >
              Guardar borrador
            </Button>
            <Button
              onClick={handleSubmit(() => setConfirmando(true))}
              disabled={accion !== null}
            >
              <Send className="size-4" aria-hidden />
              Enviar ahora
            </Button>
          </>
        )
      }
    >
      {confirmando ? (
        <div className="space-y-2 text-sm">
          <p className="text-ink">
            Se va a enviar «<strong>{watch('subject')}</strong>» a{' '}
            <strong>
              {cuantos} {cuantos === 1 ? 'alumno' : 'alumnos'}
            </strong>
            .
          </p>
          <p className="text-muted">
            Una vez enviado no se puede editar: lo van a ver tal cual está.
          </p>
        </div>
      ) : (
        <form
          id="comunicado-form"
          onSubmit={(e) => e.preventDefault()}
          noValidate
          className="space-y-4"
        >
          <Input
            label="Asunto"
            placeholder="Cambio de horario del martes"
            required
            autoFocus
            error={errors.subject?.message}
            {...register('subject')}
          />

          <Textarea
            label="Mensaje"
            rows={6}
            placeholder="Escribí el comunicado…"
            required
            error={errors.body?.message}
            {...register('body')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prioridad"
              required
              error={errors.priority?.message}
              {...register('priority')}
            >
              {opciones(PRIORIDAD).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Input
              label="Vence el"
              type="date"
              hint="Opcional."
              error={errors.expires_at?.message}
              {...register('expires_at')}
            />
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
            bucket={BUCKET_COMUNICADOS}
            carpeta={id}
            limites={limites}
            value={adjuntos}
            onChange={(a) => setValue('attachments', a)}
            error={errors.attachments?.message}
          />
        </form>
      )}
    </Dialog>
  );
}
