'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/data-list';
import { Callout } from '@/components/ui/states';
import { crearAlumno, type AlumnoCreado } from '@/app/actions/students';
import {
  CAMPOS_PASO,
  TITULOS_PASO,
  esquemaAlumno,
  type DatosAlumno,
} from '@/lib/validations/students';
import type { OpcionGrupo } from '@/lib/services/groups';
import type { OpcionTarifa } from '@/lib/services/rates';
import { MODO_COBRO, opciones } from '@/lib/labels';
import { DIAS_SEMANA, MESES, formatMoney, formatSchedule } from '@/lib/format';
import type { Enums } from '@/lib/supabase/database.types';

type Plan = { id: string; name: string; price_cents: number };

const ULTIMO = TITULOS_PASO.length - 1;
const OPCIONES_DIA = DIAS_SEMANA.map((label, value) => ({ value: String(value), label }));

export function StudentWizard({
  grupos,
  planes,
  tarifas,
  hoy,
  matriculaCents,
  diasVencimiento,
  modoPorDefecto,
}: {
  grupos: OpcionGrupo[];
  planes: Plan[];
  tarifas: OpcionTarifa[];
  hoy: string;
  matriculaCents: number;
  diasVencimiento: number;
  modoPorDefecto: Enums<'charge_mode'>;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [creado, setCreado] = useState<AlumnoCreado | null>(null);

  const [anioHoy, mesHoy] = hoy.split('-').map(Number);

  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<DatosAlumno>({
    resolver: zodResolver(esquemaAlumno),
    defaultValues: {
      first_name: '',
      last_name: '',
      dni: '',
      birth_date: '',
      email: '',
      phone: '',
      address: '',
      emergency_contact: '',
      emergency_phone: '',
      group_id: '',
      plan_id: '',
      rate_id: '',
      fixed_weekday: '',
      fixed_time: '',
      enrollment_date: hoy,
      start_date: hoy,
      status: 'activo',
      registration_fee_exempt: false,
      charge_mode: modoPorDefecto,
      first_period_year: anioHoy,
      first_period_month: mesHoy,
      importe_primer_mes: undefined,
      admin_notes: '',
    },
  });

  // `useWatch` en vez de `watch()`: se suscribe solo a estos campos y es la API
  // que el compilador de React sabe memorizar.
  const grupoId = useWatch({ control, name: 'group_id' });
  const planId = useWatch({ control, name: 'plan_id' });
  const tarifaId = useWatch({ control, name: 'rate_id' });
  const modo = useWatch({ control, name: 'charge_mode' });
  const exento = useWatch({ control, name: 'registration_fee_exempt' });
  const fechaInicio = useWatch({ control, name: 'start_date' });
  const fechaInscripcion = useWatch({ control, name: 'enrollment_date' });

  const grupo = grupos.find((g) => g.id === grupoId);
  const pideImporte = modo === 'proporcional' || modo === 'manual';

  /** Lo que se le va a cobrar por mes: la tarifa manda; si no tiene, el precio base. */
  const cuotaMensualCents =
    tarifas.find((t) => t.id === tarifaId)?.amount_cents ??
    planes.find((p) => p.id === planId)?.price_cents ??
    0;

  // Elegir grupo completa la modalidad, si todavía no se eligió una. Nunca pisa
  // lo que la persona haya puesto a mano.
  useEffect(() => {
    if (grupo?.plan_id && !getValues('plan_id')) {
      setValue('plan_id', grupo.plan_id, { shouldValidate: false });
    }
  }, [grupo, getValues, setValue]);

  // El primer período a facturar sigue a la fecha de inicio (o a la de
  // inscripción). Queda editable: esto es una ayuda, no una imposición.
  useEffect(() => {
    const base = fechaInicio || fechaInscripcion;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base ?? '')) return;
    const [anio, mes] = base.split('-').map(Number);
    setValue('first_period_year', anio, { shouldValidate: false });
    setValue('first_period_month', mes, { shouldValidate: false });
  }, [fechaInicio, fechaInscripcion, setValue]);

  // Si el modo de cobro no pide importe, se limpia el campo. Si no, quedaría un
  // NaN escondido de un campo que ni siquiera se ve y el formulario no enviaría.
  useEffect(() => {
    if (!pideImporte) setValue('importe_primer_mes', undefined, { shouldValidate: false });
  }, [pideImporte, setValue]);

  async function siguiente() {
    const ok = await trigger(CAMPOS_PASO[paso]);
    if (!ok) return;
    setPaso((p) => Math.min(p + 1, ULTIMO));
  }

  // Enter dentro de un paso avanza, no envía el formulario a medio completar.
  function alTeclear(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.target instanceof HTMLTextAreaElement) return;
    if (paso < ULTIMO) {
      e.preventDefault();
      void siguiente();
    }
  }

  async function onSubmit(datos: DatosAlumno) {
    const r = await crearAlumno(datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    // La contraseña temporal se muestra UNA vez: no queda guardada en ningún lado.
    setCreado(r.data);
  }

  /**
   * Si al enviar quedó un error en un paso anterior, el formulario no puede
   * fallar en silencio: te lleva al paso donde está el problema.
   */
  function alFallar(errores: FieldErrors<DatosAlumno>) {
    const pasoConError = CAMPOS_PASO.findIndex((campos) => campos.some((c) => errores[c]));
    if (pasoConError >= 0 && pasoConError !== paso) setPaso(pasoConError);
    toast.error('Revisá los datos marcados en rojo.');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Nuevo alumno"
        description="Se crea la ficha y el usuario con el que el alumno entra al sistema."
      />

      <Pasos actual={paso} />

      <Card>
        <CardContent className="pt-5 sm:pt-5">
          <form
            onSubmit={handleSubmit(onSubmit, alFallar)}
            onKeyDown={alTeclear}
            noValidate
            className="space-y-4"
          >
            {/* ── Paso 1 · Datos personales ─────────────────────────────── */}
            {paso === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Nombre"
                    required
                    autoFocus
                    autoComplete="given-name"
                    error={errors.first_name?.message}
                    {...register('first_name')}
                  />
                  <Input
                    label="Apellido"
                    required
                    autoComplete="family-name"
                    error={errors.last_name?.message}
                    {...register('last_name')}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="DNI"
                    inputMode="numeric"
                    placeholder="30123456"
                    error={errors.dni?.message}
                    {...register('dni')}
                  />
                  <Input
                    label="Fecha de nacimiento"
                    type="date"
                    error={errors.birth_date?.message}
                    {...register('birth_date')}
                  />
                </div>
              </>
            )}

            {/* ── Paso 2 · Contacto ─────────────────────────────────────── */}
            {paso === 1 && (
              <>
                <Input
                  label="Correo"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  hint="Con este correo el alumno entra al sistema. Se crea su usuario automáticamente."
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  label="Teléfono"
                  type="tel"
                  placeholder="351 123 4567"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
                <Input
                  label="Domicilio"
                  error={errors.address?.message}
                  {...register('address')}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Contacto de emergencia"
                    placeholder="María (madre)"
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
              </>
            )}

            {/* ── Paso 3 · Académico ────────────────────────────────────── */}
            {paso === 2 && (
              <>
                <Select
                  label="Grupo"
                  autoFocus
                  hint="El cupo se calcula solo: cuenta alumnos activos y pendientes."
                  error={errors.group_id?.message}
                  {...register('group_id')}
                >
                  <option value="">Sin grupo asignado</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {formatSchedule(g.weekday, g.start_time, g.end_time)}
                      {g.capacity > 0 ? ` · ${g.current_students}/${g.capacity}` : ''}
                      {g.is_full ? ' · COMPLETO' : ''}
                    </option>
                  ))}
                </Select>

                {/* Se avisa, pero se deja seguir: la decisión es de la administradora. */}
                {grupo?.is_full && (
                  <Callout tone="warning" title="El grupo está completo">
                    «{grupo.name}» ya tiene {grupo.current_students} de {grupo.capacity} lugares
                    ocupados. Podés inscribirlo igual si querés hacer una excepción.
                  </Callout>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Modalidad" error={errors.plan_id?.message} {...register('plan_id')}>
                    <option value="">Sin modalidad</option>
                    {planes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatMoney(p.price_cents)}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Tarifa"
                    hint="Si no ponés tarifa, se cobra el precio base de la modalidad."
                    error={errors.rate_id?.message}
                    {...register('rate_id')}
                  >
                    <option value="">Precio base de la modalidad</option>
                    {tarifas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {formatMoney(t.amount_cents)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Día fijo"
                    hint="Solo si tiene un horario propio distinto al del grupo."
                    error={errors.fixed_weekday?.message}
                    {...register('fixed_weekday')}
                  >
                    <option value="">Sin día fijo</option>
                    {OPCIONES_DIA.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
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

                <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
                  Cuota mensual:{' '}
                  <strong className="text-ink tabular-nums">{formatMoney(cuotaMensualCents)}</strong>
                </p>
              </>
            )}

            {/* ── Paso 4 · Inscripción ──────────────────────────────────── */}
            {paso === 3 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Fecha de inscripción"
                    type="date"
                    required
                    autoFocus
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

                <Select
                  label="Estado"
                  required
                  hint="Solo a los alumnos activos se les generan cuotas."
                  error={errors.status?.message}
                  {...register('status')}
                >
                  <option value="activo">Activo</option>
                  <option value="pendiente">Pendiente de iniciar</option>
                </Select>

                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <p className="text-sm font-medium text-ink">Cobro del primer mes</p>

                  <Select
                    label="Modo de cobro"
                    required
                    hint="Para el ingreso a mitad de mes. Los meses siguientes se cobran completos."
                    error={errors.charge_mode?.message}
                    {...register('charge_mode')}
                  >
                    {opciones(MODO_COBRO).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                      label="Primer mes"
                      required
                      error={errors.first_period_month?.message}
                      // valueAsNumber: RHF entrega un número, no un string. Es lo
                      // que hace que z.number() encaje sin necesidad de z.coerce.
                      {...register('first_period_month', { valueAsNumber: true })}
                    >
                      {MESES.map((nombre, i) => (
                        <option key={nombre} value={i + 1}>
                          {nombre}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Año"
                      type="number"
                      min={2020}
                      max={2100}
                      required
                      error={errors.first_period_year?.message}
                      {...register('first_period_year', { valueAsNumber: true })}
                    />
                  </div>

                  {pideImporte && (
                    <MoneyInput
                      label={
                        modo === 'proporcional' ? 'Importe proporcional' : 'Importe del primer mes'
                      }
                      required
                      hint={`El mes completo sería ${formatMoney(cuotaMensualCents)}. Los meses siguientes se cobran completos.`}
                      error={errors.importe_primer_mes?.message}
                      {...register('importe_primer_mes', { valueAsNumber: true })}
                    />
                  )}

                  {modo === 'mes_siguiente' && (
                    <p className="text-xs text-muted">
                      No se le va a generar cuota de este mes: la primera cuota sale el mes que viene.
                    </p>
                  )}
                </div>

                {matriculaCents > 0 && (
                  <div className="space-y-2 rounded-xl border border-line bg-canvas/60 p-4">
                    <p className="text-sm font-medium text-ink">Matrícula</p>
                    <label className="flex items-center gap-2.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
                        {...register('registration_fee_exempt')}
                      />
                      Exento de matrícula
                    </label>
                    <p className="text-xs text-muted">
                      {exento ? (
                        'No se le va a generar la matrícula.'
                      ) : (
                        <>
                          Se le va a generar una matrícula de{' '}
                          <strong className="text-ink">{formatMoney(matriculaCents)}</strong>, con
                          vencimiento a {diasVencimiento} día(s).
                        </>
                      )}
                    </p>
                  </div>
                )}

                <Textarea
                  label="Notas administrativas"
                  rows={2}
                  hint="Solo las ve la administración."
                  error={errors.admin_notes?.message}
                  {...register('admin_notes')}
                />
              </>
            )}

            {/* ── Navegación ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => (paso === 0 ? router.push('/admin/alumnos') : setPaso((p) => p - 1))}
                disabled={isSubmitting}
              >
                <ArrowLeft className="size-4" aria-hidden />
                {paso === 0 ? 'Cancelar' : 'Atrás'}
              </Button>

              {paso < ULTIMO ? (
                <Button type="button" onClick={siguiente}>
                  Siguiente
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button type="submit" loading={isSubmitting}>
                  <Check className="size-4" aria-hidden />
                  Crear alumno
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {creado && <ClaveTemporal alumno={creado} />}
    </div>
  );
}

/** Barra de pasos: dónde estoy y cuánto falta. */
function Pasos({ actual }: { actual: number }) {
  return (
    <ol className="flex items-center gap-1.5">
      {TITULOS_PASO.map((titulo, i) => {
        const hecho = i < actual;
        const activo = i === actual;
        return (
          <li key={titulo} className="flex flex-1 flex-col gap-1.5">
            <span
              className={
                'h-1 rounded-full ' +
                (hecho || activo ? 'bg-brand' : 'bg-line')
              }
              aria-hidden
            />
            <span
              className={
                'truncate text-[11px] font-medium ' + (activo ? 'text-brand' : 'text-muted')
              }
            >
              {i + 1}. {titulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * La contraseña temporal se ve UNA sola vez.
 *
 * No se guarda en ningún lado: si se pierde, se genera otra desde la ficha del
 * alumno («Restablecer contraseña»). El alumno está obligado a cambiarla en su
 * primer ingreso.
 */
function ClaveTemporal({ alumno }: { alumno: AlumnoCreado }) {
  const router = useRouter();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(alumno.claveTemporal);
      toast.success('Contraseña copiada');
    } catch {
      toast.error('No se pudo copiar. Anotala a mano.');
    }
  }

  return (
    <Dialog
      open
      onClose={() => router.push(`/admin/alumnos/${alumno.id}`)}
      title="Alumno creado"
      description="Anotá la contraseña temporal: no se vuelve a mostrar."
      footer={
        <Button onClick={() => router.push(`/admin/alumnos/${alumno.id}`)}>Ir a la ficha</Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-canvas p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Correo</p>
          <p className="break-all text-sm font-medium text-ink">{alumno.email}</p>

          <p className="mt-3 text-xs uppercase tracking-wide text-muted">Contraseña temporal</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-lg bg-surface px-3 py-2 font-mono text-base tracking-wide text-ink">
              {alumno.claveTemporal}
            </code>
            <Button variant="outline" size="sm" onClick={copiar} aria-label="Copiar contraseña">
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <Callout tone="info">
          <span className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            El alumno tiene que cambiarla la primera vez que entre. Si la perdés, generá otra desde
            la ficha del alumno, con «Restablecer contraseña».
          </span>
        </Callout>

        {alumno.matriculaCents !== null && (
          <p className="text-sm text-muted">
            Se generó la matrícula por{' '}
            <strong className="text-ink">{formatMoney(alumno.matriculaCents)}</strong>.
          </p>
        )}
      </div>
    </Dialog>
  );
}
