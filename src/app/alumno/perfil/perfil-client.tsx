'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Camera, GraduationCap, KeyRound, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/data-list';
import { Callout } from '@/components/ui/states';
import { createClient } from '@/lib/supabase/client';
import { mapAuthError } from '@/lib/auth-errors';
import { ESTADO_ALUMNO } from '@/lib/labels';
import { formatMoney, formatSchedule, formatTime, formatWeekday } from '@/lib/format';
import { TIPOS, nombreSeguro, subirArchivo, validarArchivo, type LimitesArchivo } from '@/lib/storage';
import {
  esquemaClave,
  esquemaPerfil,
  type DatosClave,
  type DatosPerfil,
} from '@/lib/validations/student-portal';
import { actualizarFotoPerfil, guardarPerfil } from '@/app/actions/student-portal';
import type { Perfil } from '@/lib/services/student-portal';

const TIPOS_FOTO: readonly string[] = TIPOS.imagen;

export function PerfilClient({
  perfil,
  profileId,
  correoDeIngreso,
  limites,
}: {
  perfil: Perfil;
  profileId: string;
  correoDeIngreso: string | null;
  limites: LimitesArchivo;
}) {
  const { ficha } = perfil;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Mi perfil" description="Tus datos de contacto y tu contraseña." />

      <Foto perfil={perfil} profileId={profileId} limites={limites} />

      <DatosDeContacto ficha={ficha} />

      <MiCursada perfil={perfil} />

      <Contrasenia correoDeIngreso={correoDeIngreso} />
    </div>
  );
}

/* =============================================================================
   Foto
   ========================================================================== */

function Foto({
  perfil,
  profileId,
  limites,
}: {
  perfil: Perfil;
  profileId: string;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { ficha, avatarUrl } = perfil;
  const iniciales = `${ficha.first_name.charAt(0)}${ficha.last_name.charAt(0)}`.toUpperCase();

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // El input se limpia siempre: si elige la MISMA foto otra vez, tiene que
    // volver a dispararse el change.
    e.target.value = '';
    setError(null);
    if (!file) return;

    if (!TIPOS_FOTO.includes(file.type)) {
      setError('Tiene que ser una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }

    const invalido = validarArchivo(file, limites);
    if (invalido) {
      setError(invalido);
      return;
    }

    setProgreso(0);

    // La política del bucket exige que la primera carpeta sea el id del perfil:
    // avatars/<profile_id>/<archivo>.
    const path = `${profileId}/${nombreSeguro(file.name)}`;
    const subida = await subirArchivo('avatars', path, file, setProgreso);

    if ('error' in subida) {
      setProgreso(null);
      setError(subida.error);
      return;
    }

    const r = await actualizarFotoPerfil({ filePath: subida.path });
    setProgreso(null);

    if (!r.ok) {
      setError(r.error);
      return;
    }

    toast.success(r.message);
    router.refresh();
  }

  const subiendo = progreso !== null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-20 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xl font-semibold text-brand">
              {iniciales}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-ink">
              {ficha.first_name} {ficha.last_name}
            </p>
            <div className="mt-1">
              <StatusBadge value={ficha.status} map={ESTADO_ALUMNO} />
            </div>

            <input
              ref={input}
              type="file"
              accept={TIPOS_FOTO.join(',')}
              onChange={elegirFoto}
              className="sr-only"
              aria-label="Elegir foto de perfil"
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              loading={subiendo}
              onClick={() => input.current?.click()}
            >
              <Camera className="size-3.5" aria-hidden />
              {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
            </Button>
          </div>
        </div>

        {subiendo && (
          <div className="mt-3 space-y-1.5">
            <div
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de la subida"
              className="h-2 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {progreso < 100 ? `Subiendo… ${progreso}%` : 'Guardando…'}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* =============================================================================
   Datos de contacto (lo único que el alumno edita de su ficha)
   ========================================================================== */

function DatosDeContacto({ ficha }: { ficha: Perfil['ficha'] }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosPerfil>({
    resolver: zodResolver(esquemaPerfil),
    defaultValues: {
      phone: ficha.phone ?? '',
      email: ficha.email ?? '',
      birth_date: ficha.birth_date ?? '',
      address: ficha.address ?? '',
      emergency_contact: ficha.emergency_contact ?? '',
      emergency_phone: ficha.emergency_phone ?? '',
    },
  });

  async function onSubmit(datos: DatosPerfil) {
    const r = await guardarPerfil(datos);
    if (!r.ok) {
      // Si la base rechaza algo (por ejemplo, el trigger que protege las
      // columnas administrativas), el motivo se muestra tal cual.
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-4 text-muted" aria-hidden />
          Mis datos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Teléfono"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="351 123 4567"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              error={errors.birth_date?.message}
              {...register('birth_date')}
            />
          </div>

          <Input
            label="Correo de contacto"
            type="email"
            inputMode="email"
            autoComplete="email"
            hint="Es el correo donde la academia te escribe. No es el que usás para ingresar."
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Dirección"
            autoComplete="street-address"
            error={errors.address?.message}
            {...register('address')}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Contacto de emergencia"
              placeholder="Nombre y parentesco"
              error={errors.emergency_contact?.message}
              {...register('emergency_contact')}
            />
            <Input
              label="Teléfono de emergencia"
              type="tel"
              inputMode="tel"
              error={errors.emergency_phone?.message}
              {...register('emergency_phone')}
            />
          </div>

          <Button type="submit" loading={isSubmitting} fullWidth className="sm:w-auto">
            Guardar cambios
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* =============================================================================
   Mi cursada (solo lectura: lo administra la academia)
   ========================================================================== */

function MiCursada({ perfil }: { perfil: Perfil }) {
  const { ficha, tarifaCents } = perfil;
  const grupo = ficha.groups;

  const horarioFijo =
    ficha.fixed_weekday !== null && ficha.fixed_time
      ? `${formatWeekday(ficha.fixed_weekday)} a las ${formatTime(ficha.fixed_time)}`
      : grupo
        ? formatSchedule(grupo.weekday, grupo.start_time, grupo.end_time)
        : null;

  const datos: Array<{ etiqueta: string; valor: React.ReactNode }> = [
    { etiqueta: 'Día y horario', valor: horarioFijo ?? 'Sin asignar' },
    { etiqueta: 'Grupo', valor: grupo?.name ?? 'Sin asignar' },
    { etiqueta: 'Modalidad', valor: ficha.plans?.name ?? 'Sin asignar' },
    {
      etiqueta: 'Tarifa mensual',
      valor:
        tarifaCents === null ? (
          'Sin asignar'
        ) : (
          <span className="tabular-nums">{formatMoney(tarifaCents)}</span>
        ),
    },
    { etiqueta: 'Estado', valor: <StatusBadge value={ficha.status} map={ESTADO_ALUMNO} /> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted" aria-hidden />
          Mi cursada
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y divide-line">
          {datos.map((d) => (
            <div key={d.etiqueta} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-sm text-muted">{d.etiqueta}</dt>
              <dd className="text-right text-sm font-medium text-ink">{d.valor}</dd>
            </div>
          ))}
        </dl>

        <Callout tone="info">
          <span className="inline-flex items-start gap-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Tu tarifa, tu grupo, tu modalidad y tu estado los administra la academia: acá son de
            solo lectura. Si algo no coincide, escribile.
          </span>
        </Callout>
      </CardContent>
    </Card>
  );
}

/* =============================================================================
   Contraseña
   ========================================================================== */

function Contrasenia({ correoDeIngreso }: { correoDeIngreso: string | null }) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosClave>({
    resolver: zodResolver(esquemaClave),
    defaultValues: { actual: '', nueva: '', confirmacion: '' },
  });

  async function onSubmit(datos: DatosClave) {
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setError('Tu sesión expiró. Volvé a ingresar.');
      return;
    }

    // Verificamos la contraseña ACTUAL antes de cambiarla: si alguien encuentra
    // la sesión abierta, no debería poder dejarte afuera de tu propia cuenta.
    const { error: errorActual } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: datos.actual,
    });

    if (errorActual) {
      setError('La contraseña actual no es correcta.');
      return;
    }

    const { error: errorCambio } = await supabase.auth.updateUser({ password: datos.nueva });

    if (errorCambio) {
      setError(mapAuthError(errorCambio.message));
      return;
    }

    toast.success('Tu contraseña se actualizó correctamente.');
    reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted" aria-hidden />
          Contraseña
        </CardTitle>
      </CardHeader>
      <CardContent>
        {correoDeIngreso && (
          <p className="mb-4 text-sm text-muted">
            Ingresás con <span className="font-medium text-ink">{correoDeIngreso}</span>.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            required
            error={errors.actual?.message}
            {...register('actual')}
          />
          <Input
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            hint="Mínimo 8 caracteres, con letras y números."
            error={errors.nueva?.message}
            {...register('nueva')}
          />
          <Input
            label="Repetir contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmacion?.message}
            {...register('confirmacion')}
          />

          <Button type="submit" loading={isSubmitting} fullWidth className="sm:w-auto">
            Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
