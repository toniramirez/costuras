'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowUpFromLine,
  Ban,
  Check,
  CircleDollarSign,
  Clock,
  MapPin,
  Pencil,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { DataList, type Column } from '@/components/ui/data-list';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Callout } from '@/components/ui/states';
import {
  cancelarInscripcion,
  cambiarEstadoTaller,
  confirmarInscripcion,
  inscribirAlumno,
  inscribirExterno,
  marcarAsistencia,
  promoverDeListaEspera,
} from '@/app/actions/workshops';
import {
  CONFIRMADAS,
  PENDIENTES,
  esquemaConfirmarInscripcion,
  esquemaInscripcionAlumno,
  esquemaInscripcionExterna,
  type DatosConfirmarInscripcion,
  type DatosInscripcionAlumno,
  type DatosInscripcionExterna,
} from '@/lib/validations/workshops';
import type {
  AlumnoBuscable,
  FilaInscripcion,
  ResumenInscripciones,
  TallerConCupo,
} from '@/lib/services/workshops';
import type { ActionResult } from '@/lib/action-result';
import type { Enums } from '@/lib/supabase/database.types';
import { ESTADO_INSCRIPCION, ESTADO_TALLER, opciones } from '@/lib/labels';
import { formatDate, formatDateTime, formatMoney, formatTime, todayISO } from '@/lib/format';
import type { LimitesArchivo } from '@/lib/storage';
import { TallerForm, type Caja } from '../taller-form';

type Medio = { id: string; name: string };

export function TallerDetalleClient({
  taller,
  inscripciones,
  resumen,
  cajas,
  medios,
  alumnos,
  filtroEstado,
  limites,
}: {
  taller: TallerConCupo;
  inscripciones: FilaInscripcion[];
  resumen: ResumenInscripciones;
  cajas: Caja[];
  medios: Medio[];
  alumnos: AlumnoBuscable[];
  filtroEstado: string;
  limites: LimitesArchivo;
}) {
  const router = useRouter();

  const [editando, setEditando] = useState(false);
  const [inscribiendo, setInscribiendo] = useState<'alumno' | 'externa' | null>(null);
  const [aConfirmar, setAConfirmar] = useState<FilaInscripcion | null>(null);
  const [aCancelar, setACancelar] = useState<FilaInscripcion | null>(null);
  const [promoviendo, setPromoviendo] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const gratuito = Number(taller.price_cents) === 0;
  const cupoLleno = taller.capacity > 0 && taller.confirmados >= taller.capacity;
  // La asistencia se marca DESPUÉS del taller: antes no significa nada.
  const yaPaso =
    taller.status === 'finalizado' || (!!taller.event_date && taller.event_date <= todayISO());

  const confirmados = inscripciones.filter((i) => CONFIRMADAS.includes(i.status));
  const pendientes = inscripciones.filter((i) => PENDIENTES.includes(i.status));
  const espera = inscripciones.filter((i) => i.status === 'lista_espera');
  const canceladas = inscripciones.filter((i) => i.status === 'cancelada');

  // Con un filtro de estado puesto, las listas que no pueden contenerlo se ocultan.
  const visible = (estados: ReadonlyArray<Enums<'workshop_reg_status'>>) =>
    !filtroEstado || estados.includes(filtroEstado as Enums<'workshop_reg_status'>);

  /** Muestra el resultado de una action y vuelve a leer del servidor. */
  function avisar(r: ActionResult<unknown>) {
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  async function cambiarEstado(estado: Enums<'workshop_status'>) {
    setCambiandoEstado(true);
    const r = await cambiarEstadoTaller(taller.id, estado);
    setCambiandoEstado(false);
    avisar(r);
  }

  async function confirmarPromocion() {
    avisar(await promoverDeListaEspera(taller.id));
  }

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    avisar(await cancelarInscripcion(taller.id, aCancelar.id));
  }

  async function marcar(inscripcion: FilaInscripcion, asistio: boolean) {
    avisar(await marcarAsistencia(taller.id, inscripcion.id, asistio));
  }

  /** Columnas comunes a todas las listas de inscripciones. */
  const columnasBase: ReadonlyArray<Column<FilaInscripcion>> = [
    {
      header: 'Persona',
      primary: true,
      render: (i) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            {i.nombre}
            {i.esExterna && (
              <Badge tone="neutral" className="font-normal">
                Externa
              </Badge>
            )}
          </span>
          {i.contacto.length > 0 && (
            <p className="truncate text-xs font-normal text-muted">{i.contacto.join(' · ')}</p>
          )}
          {i.notes && <p className="truncate text-xs font-normal text-muted">{i.notes}</p>}
        </div>
      ),
    },
    {
      header: 'Importe',
      render: (i) =>
        Number(i.amount_cents) === 0 ? (
          <span className="text-muted">Gratuito</span>
        ) : (
          <span className="tabular-nums">{formatMoney(Number(i.amount_cents))}</span>
        ),
    },
    {
      header: 'Inscripta',
      desktopOnly: true,
      render: (i) => <span className="text-muted">{formatDateTime(i.registered_at)}</span>,
    },
    {
      header: 'Estado',
      trailing: true,
      render: (i) => <StatusBadge value={i.status} map={ESTADO_INSCRIPCION} />,
    },
  ];

  const columnasEspera: ReadonlyArray<Column<FilaInscripcion>> = [
    {
      header: 'Orden',
      render: (i) => (
        <span className="font-semibold tabular-nums text-ink">{i.waitlist_position ?? '—'}</span>
      ),
    },
    ...columnasBase,
  ];

  const accionesCancelar = (i: FilaInscripcion) => (
    <Button size="sm" variant="ghost" onClick={() => setACancelar(i)}>
      <Ban className="size-3.5 text-danger" aria-hidden />
      Cancelar
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Link
          href="/admin/talleres"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Talleres
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{taller.name}</h1>
              <StatusBadge value={taller.status} map={ESTADO_TALLER} />
              {gratuito && <Badge tone="brand">Gratuito</Badge>}
            </div>
            {taller.category && <p className="mt-0.5 text-sm text-muted">{taller.category}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Estado del taller"
              value={taller.status}
              disabled={cambiandoEstado}
              onChange={(e) => cambiarEstado(e.target.value as Enums<'workshop_status'>)}
              className="h-11 py-0"
            >
              {opciones(ESTADO_TALLER).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-4" aria-hidden />
              Editar
            </Button>
          </div>
        </header>
      </div>

      {/* ── La regla del módulo, siempre a la vista ───────────────────────── */}
      <Callout tone="info" title="El cupo se ocupa con el pago confirmado">
        Una inscripción pendiente de pago <strong>no reserva el lugar</strong>. Al confirmar el pago
        se registra el ingreso, se emite el recibo y recién ahí el lugar queda ocupado. Si el cupo se
        llena, las nuevas inscripciones van solas a la lista de espera, por orden de llegada.
      </Callout>

      {/* ── Números del taller ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Cupo ocupado"
          value={taller.capacity > 0 ? `${taller.confirmados} / ${taller.capacity}` : String(taller.confirmados)}
          hint={taller.capacity > 0 ? (cupoLleno ? 'Completo' : `Quedan ${taller.capacity - taller.confirmados}`) : 'Sin límite'}
          icon={<Users className="size-4" />}
          tone={cupoLleno ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Pendientes de pago"
          value={resumen.pendientes}
          hint="No ocupan lugar"
          tone={resumen.pendientes > 0 ? 'warning' : 'neutral'}
        />
        <StatCard label="Lista de espera" value={resumen.espera} hint="Por orden de llegada" />
        <StatCard
          label="Cobrado"
          value={formatMoney(resumen.cobradoCents)}
          hint="Inscripciones confirmadas"
          icon={<CircleDollarSign className="size-4" />}
          tone={resumen.cobradoCents > 0 ? 'success' : 'neutral'}
        />
      </div>

      {/* ── Ficha ─────────────────────────────────────────────────────────── */}
      <FichaTaller taller={taller} cajas={cajas} />

      {/* ── Inscripciones ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Inscripciones</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setInscribiendo('alumno')}>
              <UserPlus className="size-4" aria-hidden />
              Inscribir alumno
            </Button>
            <Button variant="outline" onClick={() => setInscribiendo('externa')}>
              <UserPlus className="size-4" aria-hidden />
              Inscribir persona externa
            </Button>
          </div>
        </div>

        <FiltersBar>
          <SearchInput placeholder="Buscar por nombre, teléfono o correo…" />
          <FilterSelect
            param="estado"
            label="Estado de la inscripción"
            allLabel="Todos los estados"
            options={opciones(ESTADO_INSCRIPCION)}
          />
        </FiltersBar>

        {visible(CONFIRMADAS) && (
          <Seccion
            titulo="Confirmados"
            descripcion="Pagaron y tienen su lugar. La asistencia se marca después del taller."
            cantidad={confirmados.length}
            vacio="Todavía no hay inscripciones confirmadas."
            filas={confirmados}
            columnas={columnasBase}
            acciones={(i) => (
              <>
                {yaPaso && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => marcar(i, true)}
                      disabled={i.status === 'asistio'}
                    >
                      <Check className="size-3.5 text-success" aria-hidden />
                      Asistió
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => marcar(i, false)}
                      disabled={i.status === 'no_asistio'}
                    >
                      <X className="size-3.5 text-danger" aria-hidden />
                      No asistió
                    </Button>
                  </>
                )}
                {accionesCancelar(i)}
              </>
            )}
          />
        )}

        {visible(PENDIENTES) && (
          <Seccion
            titulo="Pendientes de pago"
            descripcion="Anotados, pero el lugar todavía NO está ocupado. Se ocupa al confirmar el pago."
            cantidad={pendientes.length}
            vacio="No hay inscripciones esperando el pago."
            filas={pendientes}
            columnas={columnasBase}
            acciones={(i) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setAConfirmar(i)}>
                  <CircleDollarSign className="size-3.5" aria-hidden />
                  Confirmar pago
                </Button>
                {accionesCancelar(i)}
              </>
            )}
          />
        )}

        {visible(['lista_espera']) && (
          <Seccion
            titulo="Lista de espera"
            descripcion="Por orden de llegada. Al promover, la persona queda pendiente de pago (no confirmada)."
            cantidad={espera.length}
            vacio="No hay nadie en la lista de espera."
            filas={espera}
            columnas={columnasEspera}
            accion={
              espera.length > 0 ? (
                <Button size="sm" variant="outline" onClick={() => setPromoviendo(true)}>
                  <ArrowUpFromLine className="size-3.5" aria-hidden />
                  Promover al primero
                </Button>
              ) : undefined
            }
            acciones={accionesCancelar}
          />
        )}

        {/* Solo aparece si hay canceladas… o si el filtro las está pidiendo. */}
        {visible(['cancelada']) && (canceladas.length > 0 || filtroEstado === 'cancelada') && (
          <Seccion
            titulo="Canceladas"
            descripcion="Ya no ocupan lugar ni figuran en la lista de espera."
            cantidad={canceladas.length}
            vacio="No hay inscripciones canceladas."
            filas={canceladas}
            columnas={columnasBase}
          />
        )}
      </section>

      {/* ── Diálogos ──────────────────────────────────────────────────────── */}
      {editando && (
        <TallerForm
          taller={taller}
          cajas={cajas}
          limites={limites}
          onClose={() => setEditando(false)}
        />
      )}

      {inscribiendo === 'alumno' && (
        <InscribirAlumnoDialog
          tallerId={taller.id}
          alumnos={alumnos}
          yaInscriptos={resumen.alumnosInscriptos}
          cupoLleno={cupoLleno}
          gratuito={gratuito}
          onClose={() => setInscribiendo(null)}
        />
      )}

      {inscribiendo === 'externa' && (
        <InscribirExternaDialog
          tallerId={taller.id}
          cupoLleno={cupoLleno}
          gratuito={gratuito}
          onClose={() => setInscribiendo(null)}
        />
      )}

      {aConfirmar && (
        <ConfirmarPagoDialog
          taller={taller}
          inscripcion={aConfirmar}
          medios={medios}
          cajas={cajas}
          onClose={() => setAConfirmar(null)}
        />
      )}

      <ConfirmDialog
        open={promoviendo}
        onClose={() => setPromoviendo(false)}
        onConfirm={confirmarPromocion}
        danger={false}
        confirmLabel="Promover"
        title="Promover al primero de la lista de espera"
        description="La primera persona de la lista pasa a «pendiente de pago». El lugar NO queda ocupado hasta que confirmes su pago. Si el taller es gratuito, se confirma sola."
      />

      <ConfirmDialog
        open={aCancelar !== null}
        onClose={() => setACancelar(null)}
        onConfirm={confirmarCancelacion}
        confirmLabel="Cancelar inscripción"
        cancelLabel="Volver"
        title="Cancelar inscripción"
        description={
          aCancelar?.payment_id
            ? `Vas a cancelar la inscripción de ${aCancelar.nombre}. El lugar queda libre, pero el pago ya registrado NO se anula: si corresponde devolverlo, anulá el pago desde Finanzas.`
            : `Vas a cancelar la inscripción de ${aCancelar?.nombre ?? ''}. Si estaba en la lista de espera, sale de la lista.`
        }
      />
    </div>
  );
}

/* ===========================================================================
   Ficha del taller
   =========================================================================== */

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono?: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        {icono}
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function FichaTaller({ taller, cajas }: { taller: TallerConCupo; cajas: Caja[] }) {
  const caja = cajas.find((c) => c.id === taller.cash_account_id);

  const horario = taller.start_time
    ? `${formatTime(taller.start_time)}${taller.end_time ? ` a ${formatTime(taller.end_time)}` : ''}`
    : '—';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha del taller</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {taller.imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
            <img
              src={taller.imagenUrl}
              alt={`Imagen de ${taller.name}`}
              className="h-40 w-full rounded-xl object-cover sm:w-56"
            />
          )}
          <div className="min-w-0 flex-1 space-y-4">
            {taller.description && <p className="text-sm text-ink">{taller.description}</p>}

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Dato etiqueta="Fecha">{formatDate(taller.event_date)}</Dato>
              <Dato icono={<Clock className="size-3" aria-hidden />} etiqueta="Horario">
                {horario}
              </Dato>
              <Dato icono={<MapPin className="size-3" aria-hidden />} etiqueta="Ubicación">
                {taller.location || '—'}
              </Dato>
              <Dato etiqueta="Responsable">{taller.responsible_name || '—'}</Dato>
              <Dato etiqueta="Precio">
                {Number(taller.price_cents) === 0 ? 'Gratuito' : formatMoney(Number(taller.price_cents))}
              </Dato>
              <Dato etiqueta="Caja">{caja?.name ?? 'Sin asignar'}</Dato>
            </dl>
          </div>
        </div>

        {(taller.materials_included || taller.materials_to_bring) && (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {taller.materials_included && (
              <Dato etiqueta="Materiales incluidos">{taller.materials_included}</Dato>
            )}
            {taller.materials_to_bring && (
              <Dato etiqueta="Lo que trae la persona">{taller.materials_to_bring}</Dato>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ===========================================================================
   Sección de inscripciones
   =========================================================================== */

function Seccion({
  titulo,
  descripcion,
  cantidad,
  vacio,
  filas,
  columnas,
  acciones,
  accion,
}: {
  titulo: string;
  descripcion: string;
  cantidad: number;
  vacio: string;
  filas: FilaInscripcion[];
  columnas: ReadonlyArray<Column<FilaInscripcion>>;
  acciones?: (i: FilaInscripcion) => React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {titulo}
            <Badge tone="neutral">{cantidad}</Badge>
          </h3>
          <p className="text-xs text-muted">{descripcion}</p>
        </div>
        {accion}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface/50 px-4 py-6 text-center text-sm text-muted">
          {vacio}
        </p>
      ) : (
        <DataList items={filas} columns={columnas} keyOf={(i) => i.id} actions={acciones} />
      )}
    </section>
  );
}

/* ===========================================================================
   Confirmar el pago  →  recién acá se ocupa el lugar
   =========================================================================== */

function ConfirmarPagoDialog({
  taller,
  inscripcion,
  medios,
  cajas,
  onClose,
}: {
  taller: TallerConCupo;
  inscripcion: FilaInscripcion;
  medios: Medio[];
  cajas: Caja[];
  onClose: () => void;
}) {
  const router = useRouter();
  const faltaConfigurar = medios.length === 0 || cajas.length === 0;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosConfirmarInscripcion>({
    resolver: zodResolver(esquemaConfirmarInscripcion),
    defaultValues: {
      method_id: medios[0]?.id ?? '',
      cash_account_id: taller.cash_account_id ?? cajas[0]?.id ?? '',
      paid_at: todayISO(),
      reference: '',
    },
  });

  async function onSubmit(datos: DatosConfirmarInscripcion) {
    const r = await confirmarInscripcion(taller.id, inscripcion.id, datos);
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
      title="Confirmar el pago"
      description={`${inscripcion.nombre} · ${formatMoney(Number(inscripcion.amount_cents))}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            form="confirmar-pago"
            type="submit"
            loading={isSubmitting}
            disabled={faltaConfigurar}
          >
            Confirmar y ocupar el lugar
          </Button>
        </>
      }
    >
      <form id="confirmar-pago" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Callout tone="warning">
          Al confirmar se registra el pago, se genera el ingreso y se emite el recibo.{' '}
          <strong>Recién ahí el lugar queda ocupado.</strong> Si el cupo se llenó mientras tanto, el
          sistema no va a permitir la confirmación.
        </Callout>

        {faltaConfigurar && (
          <Callout tone="danger">
            Para cobrar necesitás al menos un medio de pago y una caja activa. Cargalos en la
            configuración y volvé a intentar.
          </Callout>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Medio de pago" required error={errors.method_id?.message} {...register('method_id')}>
            <option value="">Elegí un medio</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>

          <Select
            label="Caja de destino"
            required
            hint="Ahí entra el ingreso."
            error={errors.cash_account_id?.message}
            {...register('cash_account_id')}
          >
            <option value="">Elegí una caja</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Fecha del pago"
            type="date"
            required
            error={errors.paid_at?.message}
            {...register('paid_at')}
          />
          <Input
            label="Referencia"
            placeholder="N.º de transferencia"
            hint="Opcional."
            error={errors.reference?.message}
            {...register('reference')}
          />
        </div>
      </form>
    </Dialog>
  );
}

/* ===========================================================================
   Inscribir a un alumno de la academia
   =========================================================================== */

function AvisoCupo({ cupoLleno, gratuito }: { cupoLleno: boolean; gratuito: boolean }) {
  if (cupoLleno) {
    return (
      <Callout tone="warning">
        El cupo está completo: esta inscripción va a la <strong>lista de espera</strong>, al final de
        la fila.
      </Callout>
    );
  }
  return (
    <Callout tone="info">
      {gratuito ? (
        <>
          El taller es gratuito: la inscripción queda <strong>confirmada</strong> al instante y ocupa
          el lugar.
        </>
      ) : (
        <>
          La inscripción queda <strong>pendiente de pago</strong>. El lugar recién se ocupa cuando
          confirmás el pago.
        </>
      )}
    </Callout>
  );
}

function InscribirAlumnoDialog({
  tallerId,
  alumnos,
  yaInscriptos,
  cupoLleno,
  gratuito,
  onClose,
}: {
  tallerId: string;
  alumnos: AlumnoBuscable[];
  yaInscriptos: string[];
  cupoLleno: boolean;
  gratuito: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosInscripcionAlumno>({
    resolver: zodResolver(esquemaInscripcionAlumno),
    defaultValues: { student_id: '', notes: '' },
  });

  /** El alumno se elige tocando la lista: el id queda en el formulario y acá. */
  function elegir(id: string) {
    setElegido(id);
    setValue('student_id', id, { shouldValidate: true });
  }

  const anotados = useMemo(() => new Set(yaInscriptos), [yaInscriptos]);

  const resultados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const lista = t
      ? alumnos.filter((a) =>
          `${a.first_name} ${a.last_name} ${a.dni ?? ''}`.toLowerCase().includes(t),
        )
      : alumnos;
    return lista.slice(0, 50);
  }, [alumnos, busqueda]);

  async function onSubmit(datos: DatosInscripcionAlumno) {
    const r = await inscribirAlumno(tallerId, datos);
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
      title="Inscribir alumno"
      description="Buscá al alumno y anotalo en el taller."
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="inscribir-alumno" type="submit" loading={isSubmitting}>
            Inscribir
          </Button>
        </>
      }
    >
      <form id="inscribir-alumno" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <AvisoCupo cupoLleno={cupoLleno} gratuito={gratuito} />

        <Field
          label="Alumno"
          htmlFor="buscar-alumno"
          required
          error={errors.student_id?.message}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              id="buscar-alumno"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o DNI…"
              autoFocus
              className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {/* El id viaja en el formulario; se elige tocando la lista. */}
          <input type="hidden" {...register('student_id')} />

          <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {resultados.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted">
                No hay alumnos que coincidan.
              </li>
            )}

            {resultados.map((a) => {
              const anotado = anotados.has(a.id);
              const seleccionado = elegido === a.id;

              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={anotado}
                    onClick={() => elegir(a.id)}
                    className={[
                      'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm',
                      anotado
                        ? 'cursor-not-allowed text-muted'
                        : seleccionado
                          ? 'bg-brand/10 font-medium text-brand'
                          : 'text-ink hover:bg-canvas',
                    ].join(' ')}
                  >
                    <span className="min-w-0 truncate">
                      {a.last_name}, {a.first_name}
                      {a.dni && <span className="ml-1.5 text-xs text-muted">DNI {a.dni}</span>}
                    </span>
                    {anotado ? (
                      <Badge tone="neutral">Ya inscripto</Badge>
                    ) : seleccionado ? (
                      <Check className="size-4 shrink-0" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Field>

        <Textarea
          label="Observaciones"
          rows={2}
          placeholder="Algo para tener en cuenta."
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}

/* ===========================================================================
   Inscribir a una persona externa (no es alumna de la academia)
   =========================================================================== */

function InscribirExternaDialog({
  tallerId,
  cupoLleno,
  gratuito,
  onClose,
}: {
  tallerId: string;
  cupoLleno: boolean;
  gratuito: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosInscripcionExterna>({
    resolver: zodResolver(esquemaInscripcionExterna),
    defaultValues: { first_name: '', last_name: '', phone: '', email: '', notes: '' },
  });

  async function onSubmit(datos: DatosInscripcionExterna) {
    const r = await inscribirExterno(tallerId, datos);
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
      title="Inscribir persona externa"
      description="Para quien no es alumna de la academia. Queda registrada solo en este taller."
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="inscribir-externa" type="submit" loading={isSubmitting}>
            Inscribir
          </Button>
        </>
      }
    >
      <form id="inscribir-externa" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <AvisoCupo cupoLleno={cupoLleno} gratuito={gratuito} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Nombre"
            required
            autoFocus
            error={errors.first_name?.message}
            {...register('first_name')}
          />
          <Input
            label="Apellido"
            required
            error={errors.last_name?.message}
            {...register('last_name')}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Teléfono"
            type="tel"
            required
            placeholder="351 555 5555"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Correo"
            type="email"
            hint="Opcional."
            placeholder="persona@correo.com"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <Textarea
          label="Observaciones"
          rows={2}
          placeholder="Cómo llegó, si trae materiales, etc."
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}
