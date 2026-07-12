'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Hourglass,
  Ticket,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import {
  cancelarRecuperacion,
  generarRecuperacion,
  reservarRecuperacion,
  usarRecuperacion,
  vencerRecuperaciones,
} from '@/app/actions/recovery';
import type {
  AusenciaSinCredito,
  GrupoConCupo,
  Recuperacion,
} from '@/lib/services/recovery';
import {
  esquemaCancelacion,
  esquemaDestino,
  esquemaEmision,
  type DatosCancelacion,
  type DatosDestino,
} from '@/lib/validations/recovery';
import { ESTADO_ASISTENCIA, ESTADO_RECUPERACION, opciones } from '@/lib/labels';
import {
  DIAS_SEMANA,
  formatDate,
  formatSchedule,
  formatTimestampAsDate,
  todayISO,
} from '@/lib/format';
import { diaSemanaDe } from '@/app/admin/asistencia/attendance-ui';
import type { Enums } from '@/lib/supabase/database.types';

/** Ausencia de la que se puede emitir un crédito. La arman el historial y esta pantalla. */
export type AusenciaEmitible = {
  attendance_id: string;
  alumno: string;
  fecha: string;
  grupo: string | null;
  status: Enums<'attendance_status'>;
};

/** El formulario de emisión no incluye `force`: se agrega al enviar. */
const esquemaFormEmision = esquemaEmision.omit({ force: true });
type DatosFormEmision = z.infer<typeof esquemaFormEmision>;

/** Días que faltan para una fecha "YYYY-MM-DD" (negativo si ya pasó). */
function diasHasta(fecha: string): number {
  const aDate = (f: string) => {
    const [a, m, d] = f.split('-').map(Number);
    return new Date(a, m - 1, d).getTime();
  };
  return Math.round((aDate(fecha) - aDate(todayISO())) / 86_400_000);
}

function TextoVencimiento({ fecha }: { fecha: string }) {
  const dias = diasHasta(fecha);

  if (dias < 0) return <span className="text-xs text-danger">venció el {formatDate(fecha)}</span>;
  if (dias === 0) return <span className="text-xs font-medium text-danger">vence hoy</span>;
  if (dias <= 7)
    return (
      <span className="text-xs font-medium text-warning">
        vence en {dias} día{dias === 1 ? '' : 's'}
      </span>
    );
  return <span className="text-xs text-muted">vence el {formatDate(fecha)}</span>;
}

export function RecoveryClient({
  filas,
  total,
  ausencias,
  grupos,
  resumen,
  avisoHoras,
  validezDias,
}: {
  filas: Recuperacion[];
  total: number;
  ausencias: AusenciaSinCredito[];
  grupos: GrupoConCupo[];
  resumen: { disponibles: number; reservadas: number; aVencer: number };
  avisoHoras: number;
  validezDias: number;
}) {
  const router = useRouter();

  const [aEmitir, setAEmitir] = useState<AusenciaEmitible | null>(null);
  const [aReservar, setAReservar] = useState<Recuperacion | null>(null);
  const [aUsar, setAUsar] = useState<Recuperacion | null>(null);
  const [aCancelar, setACancelar] = useState<Recuperacion | null>(null);
  const [venciendo, setVenciendo] = useState(false);

  async function vencer() {
    setVenciendo(true);
    const r = await vencerRecuperaciones();
    setVenciendo(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const n = r.data.vencidas;
    // Ojo con el plural: "recuperación" pierde la tilde al pasar a "recuperaciones".
    if (n === 0) toast.info('No había recuperaciones para vencer.');
    else if (n === 1) toast.success('Se venció 1 recuperación.');
    else toast.success(`Se vencieron ${n} recuperaciones.`);
    router.refresh();
  }

  const columnas: ReadonlyArray<Column<Recuperacion>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (c) => (
        <div>
          <span>{c.alumno}</span>
          {c.reason && <p className="text-xs font-normal text-muted">{c.reason}</p>}
        </div>
      ),
    },
    {
      header: 'Ausencia',
      render: (c) =>
        c.origen_fecha ? (
          <span className="text-sm">
            {formatDate(c.origen_fecha)}
            {c.origen_grupo && <span className="text-muted"> · {c.origen_grupo}</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: 'Recupera',
      render: (c) =>
        c.reservado_fecha ? (
          <span className="text-sm">
            {formatDate(c.reservado_fecha)}
            {c.reservado_grupo && <span className="text-muted"> · {c.reservado_grupo}</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: 'Vigencia',
      desktopOnly: true,
      render: (c) => {
        if (c.status === 'disponible' || c.status === 'reservada')
          return <TextoVencimiento fecha={c.expires_at} />;
        if (c.status === 'utilizada' && c.used_at)
          return (
            <span className="text-xs text-muted">usada el {formatTimestampAsDate(c.used_at)}</span>
          );
        if (c.status === 'cancelada' && c.cancel_reason)
          return <span className="text-xs text-muted">cancelada: {c.cancel_reason}</span>;
        return <span className="text-xs text-muted">—</span>;
      },
    },
    {
      header: 'Estado',
      trailing: true,
      render: (c) => <StatusBadge value={c.status} map={ESTADO_RECUPERACION} />,
    },
  ];

  const columnasAusencia: ReadonlyArray<Column<AusenciaSinCredito>> = [
    {
      header: 'Alumno',
      primary: true,
      render: (a) => (
        <div>
          <span>{a.alumno}</span>
          {a.observation && <p className="text-xs font-normal text-muted">{a.observation}</p>}
        </div>
      ),
    },
    {
      header: 'Clase',
      render: (a) => (
        <span className="text-sm">
          {formatDate(a.fecha)}
          {a.grupo && <span className="text-muted"> · {a.grupo}</span>}
        </span>
      ),
    },
    {
      header: 'Ausencia',
      trailing: true,
      render: (a) => <StatusBadge value={a.status} map={ESTADO_ASISTENCIA} />,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Recuperaciones"
        description="Créditos por ausencia justificada: se generan, se reservan en otro grupo y se consumen una sola vez."
        action={
          <Button variant="outline" onClick={vencer} loading={venciendo}>
            <Hourglass className="size-4" aria-hidden />
            Vencer las que corresponda
            {resumen.aVencer > 0 && ` (${resumen.aVencer})`}
          </Button>
        }
      />

      <Callout tone="info" title="Cómo funciona">
        La recuperación corresponde solo si la ausencia se avisó con al menos{' '}
        <strong>{avisoHoras} horas</strong> de anticipación. El crédito vence a los{' '}
        <strong>{validezDias} días</strong> de la clase perdida y no se puede usar dos veces.
      </Callout>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Disponibles" value={resumen.disponibles} icon={<Ticket className="size-4" />} />
        <StatCard
          label="Reservadas"
          value={resumen.reservadas}
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="A vencer"
          value={resumen.aVencer}
          tone={resumen.aVencer > 0 ? 'warning' : 'neutral'}
          icon={<CalendarClock className="size-4" />}
        />
      </div>

      {/* ── Ausencias que todavía no generaron crédito ──────────────────────── */}
      {ausencias.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">
            Ausencias sin recuperación ({ausencias.length})
          </h2>
          <p className="text-sm text-muted">
            Las justificadas generan crédito directamente. Las que no están justificadas solo con
            una excepción manual.
          </p>

          <DataList
            items={ausencias}
            columns={columnasAusencia}
            keyOf={(a) => a.attendance_id}
            actions={(a) => (
              <Button
                size="sm"
                variant={a.status === 'ausente_justificada' ? 'primary' : 'outline'}
                onClick={() =>
                  setAEmitir({
                    attendance_id: a.attendance_id,
                    alumno: a.alumno,
                    fecha: a.fecha,
                    grupo: a.grupo,
                    status: a.status,
                  })
                }
              >
                <CalendarPlus className="size-3.5" aria-hidden />
                {a.status === 'ausente_justificada' ? 'Generar recuperación' : 'Generar con excepción'}
              </Button>
            )}
          />
        </section>
      )}

      {/* ── Listado de créditos ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Créditos</h2>

        <FiltersBar>
          <SearchInput placeholder="Buscar alumno…" />
          <FilterSelect
            param="estado"
            label="Estado"
            allLabel="Todos"
            options={opciones(ESTADO_RECUPERACION)}
          />
        </FiltersBar>

        {filas.length === 0 ? (
          <EmptyState
            icon={<Ticket className="size-5" />}
            title="No hay recuperaciones"
            description="Los créditos se generan desde una ausencia justificada. Cuando cargues una, va a aparecer acá arriba para generarla."
          />
        ) : (
          <>
            <DataList
              items={filas}
              columns={columnas}
              keyOf={(c) => c.id}
              actions={(c) => (
                <>
                  {c.status === 'disponible' && (
                    <Button size="sm" variant="ghost" onClick={() => setAReservar(c)}>
                      <CalendarCheck className="size-3.5" aria-hidden />
                      Reservar
                    </Button>
                  )}

                  {(c.status === 'disponible' || c.status === 'reservada') && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setAUsar(c)}>
                        <Ticket className="size-3.5" aria-hidden />
                        Registrar uso
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Cancelar recuperación"
                        onClick={() => setACancelar(c)}
                      >
                        <Ban className="size-3.5 text-danger" aria-hidden />
                      </Button>
                    </>
                  )}
                </>
              )}
            />
            <Pagination total={total} />
          </>
        )}
      </section>

      {aEmitir && (
        <DialogEmision
          ausencia={aEmitir}
          validezDias={validezDias}
          onClose={() => setAEmitir(null)}
        />
      )}

      {aReservar && (
        <DialogDestino
          titulo="Reservar recuperación"
          etiqueta="Reservar"
          credito={aReservar}
          grupos={grupos}
          bloquearLlenos
          maxFecha={aReservar.expires_at}
          minFecha={todayISO()}
          ayuda="Si el grupo no tiene cupo, el sistema no deja reservar."
          onClose={() => setAReservar(null)}
          onSubmit={reservarRecuperacion}
        />
      )}

      {aUsar && (
        <DialogDestino
          titulo="Registrar uso"
          etiqueta="Registrar uso"
          credito={aUsar}
          grupos={grupos}
          bloquearLlenos={false}
          ayuda="Queda como utilizada y la clase aparece en asistencia como recuperación. No se puede usar dos veces."
          onClose={() => setAUsar(null)}
          onSubmit={usarRecuperacion}
        />
      )}

      {aCancelar && (
        <DialogCancelar credito={aCancelar} onClose={() => setACancelar(null)} />
      )}
    </div>
  );
}

/**
 * Generar el crédito a partir de una ausencia.
 *
 * Si la ausencia NO está justificada, la base solo la acepta con `p_force`: por
 * eso hay que autorizarla explícitamente. Sin esa marca, el botón no se habilita.
 */
export function DialogEmision({
  ausencia,
  validezDias,
  onClose,
}: {
  ausencia: AusenciaEmitible;
  validezDias: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const sinJustificar = ausencia.status !== 'ausente_justificada';

  // La autorización no es un campo más del formulario: es un gesto explícito.
  // Por eso el formulario valida SIN `force` y se lo agregamos al enviar (el
  // servidor lo vuelve a validar con el esquema completo).
  const [autorizado, setAutorizado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosFormEmision>({
    resolver: zodResolver(esquemaFormEmision),
    defaultValues: { attendance_id: ausencia.attendance_id, reason: '' },
  });

  async function onSubmit(datos: DatosFormEmision) {
    const r = await generarRecuperacion({ ...datos, force: sinJustificar && autorizado });
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
      title="Generar recuperación"
      description={`${ausencia.alumno} · clase del ${formatDate(ausencia.fecha)}${
        ausencia.grupo ? ` · ${ausencia.grupo}` : ''
      }`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            form="emision-form"
            type="submit"
            variant={sinJustificar ? 'danger' : 'primary'}
            loading={isSubmitting}
            disabled={sinJustificar && !autorizado}
          >
            {sinJustificar ? 'Generar como excepción' : 'Generar recuperación'}
          </Button>
        </>
      }
    >
      <form id="emision-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <input type="hidden" {...register('attendance_id')} />

        {sinJustificar && (
          <Callout tone="warning" title="Esta ausencia no está justificada">
            Por regla, la recuperación corresponde solo a las ausencias avisadas a tiempo. Podés
            generarla igual como excepción, pero queda asentado quién la autorizó.
          </Callout>
        )}

        <Textarea
          label="Motivo"
          rows={2}
          autoFocus
          placeholder="Avisó el día anterior por un problema de salud."
          hint={`El crédito va a vencer a los ${validezDias} días de la clase perdida.`}
          error={errors.reason?.message}
          {...register('reason')}
        />

        {sinJustificar && (
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={autorizado}
              onChange={(e) => setAutorizado(e.target.checked)}
              className="mt-0.5 size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            />
            Autorizo esta recuperación como excepción manual.
          </label>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Grupo y fecha de destino: sirve para reservar y para registrar el uso.
 *
 * La ocupación sale de la vista `group_occupancy` (nunca se suma a mano). Al
 * reservar, los grupos llenos se deshabilitan; si igual llegara una reserva sin
 * cupo, la base la rechaza y el mensaje se muestra tal cual.
 */
function DialogDestino({
  titulo,
  etiqueta,
  ayuda,
  credito,
  grupos,
  bloquearLlenos,
  minFecha,
  maxFecha,
  onClose,
  onSubmit,
}: {
  titulo: string;
  etiqueta: string;
  ayuda: string;
  credito: Recuperacion;
  grupos: GrupoConCupo[];
  bloquearLlenos: boolean;
  minFecha?: string;
  maxFecha?: string;
  onClose: () => void;
  onSubmit: (datos: DatosDestino) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DatosDestino>({
    resolver: zodResolver(esquemaDestino),
    defaultValues: {
      credit_id: credito.id,
      group_id: credito.reservado_grupo_id ?? '',
      date: credito.reservado_fecha ?? '',
    },
  });

  const grupoElegido = grupos.find((g) => g.id === watch('group_id'));
  const fechaElegida = watch('date');

  // Aviso (no bloquea): la fecha no cae en el día que se dicta ese grupo.
  const diaDistinto =
    grupoElegido && /^\d{4}-\d{2}-\d{2}$/.test(fechaElegida ?? '')
      ? diaSemanaDe(fechaElegida) !== grupoElegido.weekday
      : false;

  async function enviar(datos: DatosDestino) {
    const r = await onSubmit(datos);
    if (!r.ok) {
      // Los mensajes de la base ya vienen en español: se muestran tal cual.
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
      title={titulo}
      description={`${credito.alumno} · el crédito vence el ${formatDate(credito.expires_at)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="destino-form" type="submit" loading={isSubmitting}>
            {etiqueta}
          </Button>
        </>
      }
    >
      <form id="destino-form" onSubmit={handleSubmit(enviar)} noValidate className="space-y-4">
        <input type="hidden" {...register('credit_id')} />

        <Select
          label="Grupo"
          required
          autoFocus
          error={errors.group_id?.message}
          {...register('group_id')}
        >
          <option value="">Elegí un grupo…</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id} disabled={bloquearLlenos && g.lleno}>
              {g.name} · {formatSchedule(g.weekday, g.start_time, g.end_time)} · {g.ocupados}/
              {g.capacity}
              {g.lleno ? ' · sin cupo' : ''}
            </option>
          ))}
        </Select>

        {grupoElegido && (
          <p className="-mt-2 text-xs text-muted">
            {grupoElegido.lleno ? (
              <span className="font-medium text-danger">
                Sin cupo: {grupoElegido.ocupados} de {grupoElegido.capacity}.
              </span>
            ) : (
              <>
                Ocupación: {grupoElegido.ocupados} de {grupoElegido.capacity} · quedan{' '}
                {grupoElegido.libres}.
              </>
            )}
          </p>
        )}

        <Input
          label="Fecha de la recuperación"
          type="date"
          required
          min={minFecha}
          max={maxFecha}
          error={errors.date?.message}
          {...register('date')}
        />

        {diaDistinto && grupoElegido && (
          <Callout tone="warning">
            Ese grupo se dicta los {DIAS_SEMANA[grupoElegido.weekday].toLowerCase()} y la fecha
            elegida cae {DIAS_SEMANA[diaSemanaDe(fechaElegida)].toLowerCase()}.
          </Callout>
        )}

        <p className="text-xs text-muted">{ayuda}</p>
      </form>
    </Dialog>
  );
}

/**
 * Cancelar un crédito. Es irreversible: la base solo cancela los que están
 * disponibles o reservados, y el motivo queda asentado en el historial.
 */
function DialogCancelar({
  credito,
  onClose,
}: {
  credito: Recuperacion;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosCancelacion>({
    resolver: zodResolver(esquemaCancelacion),
    defaultValues: { credit_id: credito.id, reason: '' },
  });

  async function onSubmit(datos: DatosCancelacion) {
    const r = await cancelarRecuperacion(datos);
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
      title="Cancelar recuperación"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Volver
          </Button>
          <Button form="cancelar-form" type="submit" variant="danger" loading={isSubmitting}>
            Cancelar recuperación
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft">
          <AlertTriangle className="size-4 text-danger" aria-hidden />
        </div>

        <form
          id="cancelar-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="min-w-0 flex-1 space-y-3"
        >
          <input type="hidden" {...register('credit_id')} />

          <p className="text-sm text-muted">
            El crédito de <strong className="text-ink">{credito.alumno}</strong> queda cancelado y
            no se va a poder usar. Esta acción no se puede deshacer.
          </p>

          <Textarea
            label="Motivo"
            rows={2}
            autoFocus
            required
            placeholder="El alumno se dio de baja."
            error={errors.reason?.message}
            {...register('reason')}
          />
        </form>
      </div>
    </Dialog>
  );
}
