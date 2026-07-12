'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Copy,
  History,
  KeyRound,
  Pause,
  Pencil,
  Play,
  Receipt,
  UserMinus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Callout } from '@/components/ui/states';
import {
  actualizarAlumno,
  darDeBajaAlumno,
  pausarAlumno,
  reactivarAlumno,
  restablecerClaveAlumno,
  type ClaveRestablecida,
} from '@/app/actions/students';
import { esquemaAlumnoEdicion, type DatosAlumnoEdicion } from '@/lib/validations/students';
import type { AlumnoDetalle, FichaAlumno } from '@/lib/services/students';
import type { OpcionGrupo } from '@/lib/services/groups';
import type { OpcionTarifa } from '@/lib/services/rates';
import {
  ESTADO_ALUMNO,
  ESTADO_ASISTENCIA,
  ESTADO_CUOTA,
  MODO_COBRO,
} from '@/lib/labels';
import {
  DIAS_SEMANA,
  formatDate,
  formatMoney,
  formatPeriod,
  formatSchedule,
  formatTime,
  formatWeekday,
} from '@/lib/format';

type Plan = { id: string; name: string; price_cents: number };
type OcupacionActual = { current_students: number; capacity: number; is_full: boolean };

const DIAS_VALIDOS = ['0', '1', '2', '3', '4', '5', '6'] as const;
type DiaTexto = (typeof DIAS_VALIDOS)[number] | '';

/** La base guarda el día como número; el <select> trabaja con texto ('' = sin día). */
function aDiaTexto(dia: number | null): DiaTexto {
  const texto = String(dia ?? '');
  return (DIAS_VALIDOS as readonly string[]).includes(texto) ? (texto as DiaTexto) : '';
}

/**
 * Los desplegables muestran solo lo ACTIVO, pero el alumno puede estar en un
 * grupo o con una tarifa que se desactivó. Si no la agregáramos, el desplegable
 * mostraría «sin grupo» y estaría mintiendo.
 */
function conActual<T extends { id: string }>(lista: T[], actual: T | null): T[] {
  if (!actual || lista.some((x) => x.id === actual.id)) return lista;
  return [actual, ...lista];
}

export function StudentDetail({
  alumno,
  ficha,
  grupos,
  planes,
  tarifas,
  ocupacionActual,
}: {
  alumno: AlumnoDetalle;
  ficha: FichaAlumno;
  grupos: OpcionGrupo[];
  planes: Plan[];
  tarifas: OpcionTarifa[];
  ocupacionActual: OcupacionActual | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState<'pausar' | 'reactivar' | null>(null);
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);
  const [claveNueva, setClaveNueva] = useState<ClaveRestablecida | null>(null);

  const nombre = `${alumno.first_name} ${alumno.last_name}`;
  const cuotaCents = alumno.rates?.amount_cents ?? alumno.plans?.price_cents ?? 0;
  const inscripcion = ficha.inscripciones[0] ?? null;

  async function cambiarEstado(accion: 'pausar' | 'reactivar') {
    const r = accion === 'pausar' ? await pausarAlumno(alumno.id) : await reactivarAlumno(alumno.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  async function restablecerClave() {
    const r = await restablecerClaveAlumno(alumno.id);
    setRestableciendo(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    // La clave se muestra en el acto: es la única vez que se puede leer.
    setClaveNueva(r.data);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/alumnos')}>
          <ArrowLeft className="size-4" aria-hidden />
          Alumnos
        </Button>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{nombre}</h1>
              <StatusBadge value={alumno.status} map={ESTADO_ALUMNO} />
              {alumno.profiles?.must_change_password && (
                <Badge tone="info">Todavía no entró al sistema</Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              Alumno desde el {formatDate(alumno.enrollment_date)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Button>

            {/* Sin usuario no hay contraseña que restablecer. */}
            {alumno.profile_id && (
              <Button variant="outline" size="sm" onClick={() => setRestableciendo(true)}>
                <KeyRound className="size-3.5" aria-hidden />
                Restablecer contraseña
              </Button>
            )}

            {alumno.status === 'activo' && (
              <Button variant="outline" size="sm" onClick={() => setConfirmar('pausar')}>
                <Pause className="size-3.5" aria-hidden />
                Pausar
              </Button>
            )}

            {(alumno.status === 'pausado' ||
              alumno.status === 'baja' ||
              alumno.status === 'pendiente') && (
              <Button variant="outline" size="sm" onClick={() => setConfirmar('reactivar')}>
                <Play className="size-3.5" aria-hidden />
                {alumno.status === 'baja' ? 'Reincorporar' : 'Activar'}
              </Button>
            )}

            {alumno.status !== 'baja' && (
              <Button variant="outline" size="sm" onClick={() => setDandoDeBaja(true)}>
                <UserMinus className="size-3.5 text-danger" aria-hidden />
                Dar de baja
              </Button>
            )}
          </div>
        </header>
      </div>

      {alumno.status === 'baja' && (
        <Callout tone="warning" title="Alumno dado de baja">
          No se le generan cuotas y no ocupa lugar en ningún grupo. Su historial queda intacto: por
          eso no se borra.
        </Callout>
      )}

      {!alumno.profile_id && (
        <Callout tone="warning" title="Sin usuario para entrar al sistema">
          Esta ficha no tiene un usuario asociado, así que el alumno no puede ingresar. Suele pasar
          con fichas cargadas antes de que existiera el acceso de alumnos.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Datos personales y contacto ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato etiqueta="DNI" valor={alumno.dni} />
              <Dato etiqueta="Nacimiento" valor={alumno.birth_date && formatDate(alumno.birth_date)} />
              <Dato etiqueta="Correo" valor={alumno.email} ancho />
              <Dato etiqueta="Teléfono" valor={alumno.phone} />
              <Dato etiqueta="Domicilio" valor={alumno.address} />
              <Dato etiqueta="Contacto de emergencia" valor={alumno.emergency_contact} />
              <Dato etiqueta="Teléfono de emergencia" valor={alumno.emergency_phone} />
            </dl>
          </CardContent>
        </Card>

        {/* ── Cursada ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Cursada</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato
                etiqueta="Grupo"
                ancho
                valor={
                  alumno.groups ? (
                    <span>
                      {alumno.groups.name}
                      <span className="block text-xs text-muted">
                        {formatSchedule(
                          alumno.groups.weekday,
                          alumno.groups.start_time,
                          alumno.groups.end_time,
                        )}
                        {ocupacionActual && ocupacionActual.capacity > 0 && (
                          <>
                            {' · '}
                            {ocupacionActual.current_students}/{ocupacionActual.capacity} lugares
                          </>
                        )}
                      </span>
                    </span>
                  ) : null
                }
              />
              <Dato etiqueta="Modalidad" valor={alumno.plans?.name} />
              <Dato
                etiqueta="Tarifa"
                valor={alumno.rates ? alumno.rates.name : 'Precio base de la modalidad'}
              />
              <Dato
                etiqueta="Cuota mensual"
                valor={<span className="font-medium tabular-nums">{formatMoney(cuotaCents)}</span>}
              />
              <Dato
                etiqueta="Horario propio"
                valor={
                  alumno.fixed_weekday !== null
                    ? `${formatWeekday(alumno.fixed_weekday)} ${formatTime(alumno.fixed_time)}`
                    : null
                }
              />
              <Dato
                etiqueta="Empezó a cursar"
                valor={alumno.start_date && formatDate(alumno.start_date)}
              />
            </dl>

            {ocupacionActual?.is_full && (
              <p className="mt-3 text-xs text-warning">
                El grupo está completo ({ocupacionActual.current_students}/
                {ocupacionActual.capacity}).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Inscripción ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4 text-muted" aria-hidden />
            Inscripción
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inscripcion ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <Dato etiqueta="Inscripto el" valor={formatDate(inscripcion.enrolled_at)} />
              <Dato
                etiqueta="Cobro del 1er mes"
                valor={MODO_COBRO[inscripcion.charge_mode].label}
              />
              <Dato
                etiqueta="Primer período"
                valor={
                  inscripcion.first_period_year && inscripcion.first_period_month
                    ? formatPeriod(inscripcion.first_period_year, inscripcion.first_period_month)
                    : null
                }
              />
              <Dato
                etiqueta="Importe del 1er mes"
                valor={
                  inscripcion.prorated_amount_cents !== null
                    ? formatMoney(inscripcion.prorated_amount_cents)
                    : inscripcion.manual_amount_cents !== null
                      ? formatMoney(inscripcion.manual_amount_cents)
                      : null
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-muted">
              Esta ficha no tiene una inscripción registrada. Las cuotas se le generan igual, con el
              mes completo.
            </p>
          )}

          {alumno.registration_fee_exempt && (
            <p className="mt-3">
              <Badge tone="brand">Exento de matrícula</Badge>
            </p>
          )}

          {alumno.admin_notes && (
            <div className="mt-4 rounded-xl bg-canvas px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">Notas administrativas</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{alumno.admin_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Matrícula y cuotas ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-muted" aria-hidden />
              Matrícula
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.matriculas.length === 0 ? (
              <p className="text-sm text-muted">No tiene matrícula registrada.</p>
            ) : (
              <ul className="space-y-2.5">
                {ficha.matriculas.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums text-ink">
                        {formatMoney(m.amount_cents)}
                      </p>
                      <p className="text-xs text-muted">
                        Emitida el {formatDate(m.issued_date)}
                        {m.due_date && ` · vence el ${formatDate(m.due_date)}`}
                      </p>
                    </div>
                    <StatusBadge value={m.status} map={ESTADO_CUOTA} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted" aria-hidden />
              Últimas cuotas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.cuotas.length === 0 ? (
              <p className="text-sm text-muted">Todavía no se le generó ninguna cuota.</p>
            ) : (
              <ul className="space-y-2.5">
                {ficha.cuotas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {formatPeriod(c.period_year, c.period_month)}
                      </p>
                      <p className="text-xs tabular-nums text-muted">
                        {formatMoney(c.final_amount_cents)}
                        {c.due_date && ` · vence el ${formatDate(c.due_date)}`}
                      </p>
                    </div>
                    <StatusBadge value={c.status} map={ESTADO_CUOTA} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Asistencia ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted" aria-hidden />
            Asistencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ficha.asistencia.total === 0 ? (
            <p className="text-sm text-muted">Todavía no tiene asistencias registradas.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metrica
                  etiqueta="Presencia"
                  valor={
                    ficha.asistencia.porcentaje === null
                      ? '—'
                      : `${ficha.asistencia.porcentaje}%`
                  }
                  tono={
                    ficha.asistencia.porcentaje !== null && ficha.asistencia.porcentaje < 70
                      ? 'text-danger'
                      : 'text-success'
                  }
                />
                <Metrica etiqueta="Presentes" valor={ficha.asistencia.presentes} />
                <Metrica
                  etiqueta="Ausentes"
                  valor={
                    ficha.asistencia.ausentesJustificadas +
                    ficha.asistencia.ausentesSinJustificar
                  }
                />
                <Metrica etiqueta="Recuperaciones" valor={ficha.asistencia.recuperaciones} />
              </div>

              {ficha.asistenciasRecientes.length > 0 && (
                <ul className="space-y-2 border-t border-line pt-3">
                  {ficha.asistenciasRecientes.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink">{formatDate(a.fecha)}</span>
                      <StatusBadge value={a.status} map={ESTADO_ASISTENCIA} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Historiales ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-muted" aria-hidden />
              Historial de grupos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.historialGrupos.length === 0 ? (
              <p className="text-sm text-muted">Nunca estuvo asignado a un grupo.</p>
            ) : (
              <ul className="space-y-2.5">
                {ficha.historialGrupos.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{h.groups?.name ?? 'Grupo'}</p>
                      <p className="text-xs text-muted">
                        {h.groups &&
                          formatSchedule(h.groups.weekday, h.groups.start_time, h.groups.end_time)}
                      </p>
                      <p className="text-xs tabular-nums text-muted">
                        Desde {formatDate(h.from_date)}
                        {h.to_date ? ` hasta ${formatDate(h.to_date)}` : ''}
                      </p>
                    </div>
                    {!h.to_date && <Badge tone="success">Actual</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-muted" aria-hidden />
              Historial de tarifas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.historialTarifas.length === 0 ? (
              <p className="text-sm text-muted">Nunca tuvo una tarifa asignada.</p>
            ) : (
              <ul className="space-y-2.5">
                {ficha.historialTarifas.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{h.rates?.name ?? 'Tarifa'}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {formatMoney(h.amount_cents)} · desde {formatDate(h.from_date)}
                        {h.to_date ? ` hasta ${formatDate(h.to_date)}` : ''}
                      </p>
                    </div>
                    {!h.to_date && <Badge tone="success">Actual</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Diálogos ───────────────────────────────────────────────────── */}
      {editando && (
        <EditarAlumno
          alumno={alumno}
          grupos={grupos}
          planes={planes}
          tarifas={tarifas}
          onClose={() => setEditando(false)}
        />
      )}

      <ConfirmDialog
        open={confirmar === 'pausar'}
        onClose={() => setConfirmar(null)}
        onConfirm={() => cambiarEstado('pausar')}
        title="Pausar alumno"
        description={`${nombre} deja de cursar por un tiempo: no se le generan cuotas nuevas y libera su lugar en el grupo. Las cuotas ya emitidas quedan como están.`}
        confirmLabel="Pausar"
        danger={false}
      />

      <ConfirmDialog
        open={confirmar === 'reactivar'}
        onClose={() => setConfirmar(null)}
        onConfirm={() => cambiarEstado('reactivar')}
        title={alumno.status === 'baja' ? 'Reincorporar alumno' : 'Activar alumno'}
        description={`${nombre} vuelve a estar activo: se le van a generar cuotas y vuelve a ocupar lugar en su grupo.`}
        confirmLabel={alumno.status === 'baja' ? 'Reincorporar' : 'Activar'}
        danger={false}
      />

      <ConfirmDialog
        open={restableciendo}
        onClose={() => setRestableciendo(false)}
        onConfirm={restablecerClave}
        title="Restablecer contraseña"
        description={`Se le va a generar una contraseña nueva a ${nombre}. La de ahora deja de funcionar en el acto, así que pasásela por teléfono o WhatsApp. Al entrar, va a tener que elegir una propia.`}
        confirmLabel="Generar contraseña"
        danger={false}
      />

      {claveNueva && (
        <ClaveNueva
          nombre={nombre}
          clave={claveNueva}
          onClose={() => setClaveNueva(null)}
        />
      )}

      {dandoDeBaja && (
        <DarDeBaja alumno={alumno} onClose={() => setDandoDeBaja(false)} />
      )}
    </div>
  );
}

/**
 * La contraseña nueva se ve UNA sola vez: no se guarda en ningún lado.
 * Si se pierde, no pasa nada grave — se genera otra.
 */
function ClaveNueva({
  nombre,
  clave,
  onClose,
}: {
  nombre: string;
  clave: ClaveRestablecida;
  onClose: () => void;
}) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave.claveTemporal);
      toast.success('Contraseña copiada');
    } catch {
      toast.error('No se pudo copiar. Anotala a mano.');
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Contraseña nueva"
      description={`Pasásela a ${nombre}. No se vuelve a mostrar.`}
      footer={<Button onClick={onClose}>Listo</Button>}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-canvas p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Correo</p>
          <p className="break-all text-sm font-medium text-ink">{clave.email}</p>

          <p className="mt-3 text-xs uppercase tracking-wide text-muted">Contraseña temporal</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-lg bg-surface px-3 py-2 font-mono text-base tracking-wide text-ink">
              {clave.claveTemporal}
            </code>
            <Button variant="outline" size="sm" onClick={copiar} aria-label="Copiar contraseña">
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <Callout tone="info">
          <span className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            La primera vez que entre con esta contraseña, el sistema le va a pedir que elija una
            suya. Si la perdés, generá otra desde acá mismo.
          </span>
        </Callout>
      </div>
    </Dialog>
  );
}

/** Par etiqueta/valor de la ficha. Un guion cuando no hay dato: nunca un hueco. */
function Dato({
  etiqueta,
  valor,
  ancho,
}: {
  etiqueta: string;
  valor?: React.ReactNode;
  ancho?: boolean;
}) {
  return (
    <div className={ancho ? 'col-span-2' : undefined}>
      <dt className="text-xs uppercase tracking-wide text-muted">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-ink">{valor || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  tono = 'text-ink',
}: {
  etiqueta: string;
  valor: string | number;
  tono?: string;
}) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-muted">{etiqueta}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tono}`}>{valor}</p>
    </div>
  );
}

/**
 * Edición de la ficha.
 *
 * Cambiar el grupo o la tarifa NO pisa la historia: la action cierra la fila
 * abierta del historial y abre una nueva (la tarifa, con el importe congelado).
 */
function EditarAlumno({
  alumno,
  grupos,
  planes,
  tarifas,
  onClose,
}: {
  alumno: AlumnoDetalle;
  grupos: OpcionGrupo[];
  planes: Plan[];
  tarifas: OpcionTarifa[];
  onClose: () => void;
}) {
  const router = useRouter();

  // El grupo/modalidad/tarifa actual puede estar desactivado: igual tiene que
  // aparecer en el desplegable, si no el formulario mentiría.
  const opcionesGrupo = conActual<OpcionGrupo>(
    grupos,
    alumno.groups
      ? {
          id: alumno.groups.id,
          name: alumno.groups.name,
          weekday: alumno.groups.weekday,
          start_time: alumno.groups.start_time,
          end_time: alumno.groups.end_time,
          capacity: alumno.groups.capacity,
          plan_id: null,
          current_students: 0,
          available_slots: 0,
          is_full: false,
        }
      : null,
  );
  const opcionesPlan = conActual<Plan>(planes, alumno.plans);
  const opcionesTarifa = conActual<OpcionTarifa>(
    tarifas,
    alumno.rates
      ? {
          id: alumno.rates.id,
          name: alumno.rates.name,
          amount_cents: alumno.rates.amount_cents,
          plan_id: null,
        }
      : null,
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DatosAlumnoEdicion>({
    resolver: zodResolver(esquemaAlumnoEdicion),
    defaultValues: {
      first_name: alumno.first_name,
      last_name: alumno.last_name,
      dni: alumno.dni ?? '',
      birth_date: alumno.birth_date ?? '',
      email: alumno.email ?? '',
      phone: alumno.phone ?? '',
      address: alumno.address ?? '',
      emergency_contact: alumno.emergency_contact ?? '',
      emergency_phone: alumno.emergency_phone ?? '',
      group_id: alumno.group_id ?? '',
      plan_id: alumno.plan_id ?? '',
      rate_id: alumno.rate_id ?? '',
      fixed_weekday: aDiaTexto(alumno.fixed_weekday),
      // La base devuelve "15:00:00"; el <input type="time"> trabaja con "15:00".
      fixed_time: alumno.fixed_time ? alumno.fixed_time.slice(0, 5) : '',
      enrollment_date: alumno.enrollment_date,
      start_date: alumno.start_date ?? '',
      registration_fee_exempt: alumno.registration_fee_exempt,
      admin_notes: alumno.admin_notes ?? '',
    },
  });

  // `useWatch` en vez de `watch()`: es la API que el compilador de React sabe memorizar.
  const grupoId = useWatch({ control, name: 'group_id' });
  const grupoElegido = grupos.find((g) => g.id === grupoId);
  // Se avisa si el grupo NUEVO está completo, pero se deja confirmar igual.
  const avisarCompleto = grupoElegido?.is_full && grupoId !== alumno.group_id;

  async function onSubmit(datos: DatosAlumnoEdicion) {
    const r = await actualizarAlumno(alumno.id, datos);
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
      title="Editar alumno"
      description="Si cambiás el grupo o la tarifa, queda registrado en el historial."
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="alumno-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="alumno-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="max-h-[60vh] space-y-4 overflow-y-auto pr-1"
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Input label="DNI" error={errors.dni?.message} {...register('dni')} />
          <Input
            label="Fecha de nacimiento"
            type="date"
            error={errors.birth_date?.message}
            {...register('birth_date')}
          />
        </div>

        <Input
          label="Correo"
          type="email"
          required
          hint="Es el correo con el que entra al sistema: si lo cambiás, cambia también su usuario."
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Teléfono" type="tel" error={errors.phone?.message} {...register('phone')} />
          <Input label="Domicilio" error={errors.address?.message} {...register('address')} />
          <Input
            label="Contacto de emergencia"
            error={errors.emergency_contact?.message}
            {...register('emergency_contact')}
          />
          <Input
            label="Teléfono de emergencia"
            type="tel"
            error={errors.emergency_phone?.message}
            {...register('emergency_phone')}
          />
        </div>

        <Select label="Grupo" error={errors.group_id?.message} {...register('group_id')}>
          <option value="">Sin grupo asignado</option>
          {opcionesGrupo.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {formatSchedule(g.weekday, g.start_time, g.end_time)}
              {g.capacity > 0 ? ` · ${g.current_students}/${g.capacity}` : ''}
            </option>
          ))}
        </Select>

        {avisarCompleto && grupoElegido && (
          <Callout tone="warning" title="El grupo está completo">
            «{grupoElegido.name}» ya tiene {grupoElegido.current_students} de{' '}
            {grupoElegido.capacity} lugares ocupados. Podés pasarlo igual si querés hacer una
            excepción.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Modalidad" error={errors.plan_id?.message} {...register('plan_id')}>
            <option value="">Sin modalidad</option>
            {opcionesPlan.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.price_cents)}
              </option>
            ))}
          </Select>

          <Select
            label="Tarifa"
            hint="Sin tarifa se cobra el precio base."
            error={errors.rate_id?.message}
            {...register('rate_id')}
          >
            <option value="">Precio base de la modalidad</option>
            {opcionesTarifa.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {formatMoney(t.amount_cents)}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Día fijo"
            error={errors.fixed_weekday?.message}
            {...register('fixed_weekday')}
          >
            <option value="">Sin día fijo</option>
            {DIAS_SEMANA.map((label, value) => (
              <option key={label} value={String(value)}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            label="Hora fija"
            type="time"
            error={errors.fixed_time?.message}
            {...register('fixed_time')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Fecha de inscripción"
            type="date"
            required
            error={errors.enrollment_date?.message}
            {...register('enrollment_date')}
          />
          <Input
            label="Empieza a cursar"
            type="date"
            error={errors.start_date?.message}
            {...register('start_date')}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('registration_fee_exempt')}
          />
          Exento de matrícula
        </label>

        <Textarea
          label="Notas administrativas"
          rows={3}
          error={errors.admin_notes?.message}
          {...register('admin_notes')}
        />
      </form>
    </Dialog>
  );
}

/**
 * Baja lógica, con confirmación y motivo.
 *
 * Nunca se borra a un alumno con historia: sus cuotas, pagos y recibos son el
 * registro contable de la academia. El motivo queda escrito en la ficha.
 */
function DarDeBaja({ alumno, onClose }: { alumno: AlumnoDetalle; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);

  async function confirmar() {
    setProcesando(true);
    try {
      const r = await darDeBajaAlumno(alumno.id, { motivo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onClose();
      router.refresh();
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Dar de baja"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmar} loading={procesando}>
            Dar de baja
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {alumno.first_name} {alumno.last_name} deja de ser alumno: no se le generan más cuotas y
          libera su lugar en el grupo. <strong className="text-ink">No se borra nada</strong>: su
          historial, sus cuotas y sus pagos quedan intactos, y podés reincorporarlo cuando quieras.
        </p>

        <Textarea
          label="Motivo"
          rows={2}
          placeholder="Se mudó de ciudad"
          hint="Queda escrito en las notas de la ficha."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
