'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  CalendarDays,
  CreditCard,
  FileUp,
  GraduationCap,
  Image as ImageIcon,
  Palette,
  Pencil,
  Plus,
  Power,
  Receipt,
  RotateCcw,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { centsToPesos } from '@/lib/format';
import { MODO_COBRO, opciones } from '@/lib/labels';
import { createClient } from '@/lib/supabase/client';
import { nombreSeguro, subirArchivo } from '@/lib/storage';
import type { Tables } from '@/lib/supabase/database.types';
import {
  esquemaAcademia,
  esquemaArchivos,
  esquemaCuotas,
  esquemaIdentidad,
  esquemaMatricula,
  esquemaMedioPago,
  esquemaMercadoPago,
  esquemaRecibos,
  esquemaRecuperaciones,
  type DatosAcademia,
  type DatosArchivos,
  type DatosCuotas,
  type DatosIdentidad,
  type DatosMatricula,
  type DatosMedioPago,
  type DatosMercadoPago,
  type DatosRecibos,
  type DatosRecuperaciones,
} from '@/lib/validations/settings';
import {
  alternarMedioDePago,
  eliminarMedioDePago,
  guardarAcademia,
  guardarArchivos,
  guardarCuotas,
  guardarIdentidad,
  guardarMatricula,
  guardarMedioDePago,
  guardarMercadoPago,
  guardarRecibos,
  guardarRecuperaciones,
} from '@/app/actions/settings';

type Config = Tables<'academy_settings'>;
type MedioDePago = Tables<'payment_methods'>;

/**
 * Configuración de la academia.
 *
 * Cada sección es un formulario independiente con su propio guardado: así un
 * error en «Recibos» no bloquea el cambio de un color, y cada guardado toca solo
 * lo suyo.
 *
 * TODO lo que se puede configurar vive en la base (academy_settings). En el
 * código no hay ni un solo valor rígido: si mañana el día de vencimiento pasa a
 * ser el 15, se cambia acá y no se toca una línea de código.
 */

const SECCIONES = [
  { id: 'academia', label: 'Academia', icono: Building2 },
  { id: 'identidad', label: 'Identidad visual', icono: Palette },
  { id: 'recibos', label: 'Recibos', icono: Receipt },
  { id: 'matricula', label: 'Matrícula', icono: GraduationCap },
  { id: 'cuotas', label: 'Cuotas', icono: CalendarDays },
  { id: 'recuperaciones', label: 'Recuperaciones', icono: RotateCcw },
  { id: 'archivos', label: 'Archivos', icono: FileUp },
  { id: 'mercadopago', label: 'Mercado Pago', icono: CreditCard },
  { id: 'medios', label: 'Medios de pago', icono: Wallet },
] as const;

type Seccion = (typeof SECCIONES)[number]['id'];

export function SettingsClient({
  settings,
  medios,
  mpConfigurado,
  logoUrl,
  isotipoUrl,
}: {
  settings: Config;
  medios: MedioDePago[];
  mpConfigurado: boolean;
  logoUrl: string | null;
  isotipoUrl: string | null;
}) {
  const [seccion, setSeccion] = useState<Seccion>('academia');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Configuración"
        description="Todo lo que la academia puede ajustar sin tocar el código: datos, marca, importes, plazos y medios de pago."
      />

      {/* En el celular la barra se desliza en horizontal: nueve secciones no
          entran de otra forma sin apretar los botones hasta hacerlos ilegibles. */}
      <div
        role="tablist"
        aria-label="Secciones de la configuración"
        className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {SECCIONES.map((s) => {
          const Icono = s.icono;
          const activa = seccion === s.id;

          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setSeccion(s.id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                activa
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted hover:bg-line/40 hover:text-ink',
              )}
            >
              <Icono className="size-4" aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>

      {seccion === 'academia' && <SeccionAcademia settings={settings} />}
      {seccion === 'identidad' && (
        <SeccionIdentidad settings={settings} logoUrl={logoUrl} isotipoUrl={isotipoUrl} />
      )}
      {seccion === 'recibos' && <SeccionRecibos settings={settings} />}
      {seccion === 'matricula' && <SeccionMatricula settings={settings} />}
      {seccion === 'cuotas' && <SeccionCuotas settings={settings} />}
      {seccion === 'recuperaciones' && <SeccionRecuperaciones settings={settings} />}
      {seccion === 'archivos' && <SeccionArchivos settings={settings} />}
      {seccion === 'mercadopago' && (
        <SeccionMercadoPago settings={settings} configurado={mpConfigurado} />
      )}
      {seccion === 'medios' && <SeccionMedios medios={medios} />}
    </div>
  );
}

/* =============================================================================
   Piezas comunes
   ============================================================================= */

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="block">
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Casilla({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-line-strong text-brand focus:ring-brand/20 disabled:opacity-50"
          {...props}
        />
        <span>{label}</span>
      </label>
      {hint && <p className="ml-6.5 mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Botón de guardar, siempre abajo a la derecha y bloqueado mientras envía. */
function Guardar({ enviando }: { enviando: boolean }) {
  return (
    <div className="flex justify-end border-t border-line pt-4">
      <Button type="submit" loading={enviando}>
        Guardar cambios
      </Button>
    </div>
  );
}

/** Muestra el resultado de una action y refresca la pantalla. */
function useGuardado() {
  const router = useRouter();

  return async (resultado: { ok: true; message?: string } | { ok: false; error: string }) => {
    if (!resultado.ok) {
      toast.error(resultado.error);
      return false;
    }
    toast.success(resultado.message);
    router.refresh();
    return true;
  };
}

/* =============================================================================
   Academia
   ============================================================================= */

function SeccionAcademia({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosAcademia>({
    resolver: zodResolver(esquemaAcademia),
    defaultValues: {
      academy_name: settings.academy_name,
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      address: settings.address ?? '',
    },
  });

  return (
    <Seccion
      titulo="Datos de la academia"
      descripcion="Aparecen en los recibos y en los avisos que reciben los alumnos."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarAcademia(d))))}
        noValidate
        className="space-y-4"
      >
        <Input
          label="Nombre"
          required
          error={errors.academy_name?.message}
          {...register('academy_name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Teléfono"
            type="tel"
            placeholder="351 555-5555"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Correo"
            type="email"
            placeholder="hola@costura.com.ar"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <Textarea
          label="Dirección"
          rows={2}
          error={errors.address?.message}
          {...register('address')}
        />

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Identidad visual
   ============================================================================= */

/** URL pública de un archivo del bucket `branding` (es el único bucket público). */
function urlDeMarca(path: string): string {
  return createClient().storage.from('branding').getPublicUrl(path).data.publicUrl;
}

/**
 * El bucket `branding` acepta SVG (un logo vectorial es lo correcto) y tiene un
 * tope duro de 5 MB, así que no alcanza con el `validarArchivo` genérico:
 * validamos acá lo que este bucket realmente permite.
 */
const FORMATOS_MARCA = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const TOPE_MARCA_MB = 5;

function validarImagenDeMarca(file: File, maxImagenMb: number): string | null {
  if (!FORMATOS_MARCA.includes(file.type)) {
    return 'El formato no está permitido. Usá PNG, JPG, WebP o SVG.';
  }
  const tope = Math.min(maxImagenMb, TOPE_MARCA_MB);
  if (file.size > tope * 1024 * 1024) {
    return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${tope} MB.`;
  }
  return null;
}

function SeccionIdentidad({
  settings,
  logoUrl,
  isotipoUrl,
}: {
  settings: Config;
  logoUrl: string | null;
  isotipoUrl: string | null;
}) {
  const guardado = useGuardado();
  const [vistaLogo, setVistaLogo] = useState<string | null>(logoUrl);
  const [vistaIsotipo, setVistaIsotipo] = useState<string | null>(isotipoUrl);
  const [subiendo, setSubiendo] = useState<'logo' | 'isotipo' | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosIdentidad>({
    resolver: zodResolver(esquemaIdentidad),
    defaultValues: {
      logo_path: settings.logo_path ?? '',
      isotype_path: settings.isotype_path ?? '',
      primary_color: settings.primary_color,
      secondary_color: settings.secondary_color,
      accent_color: settings.accent_color,
    },
  });

  // useWatch (y no watch()) porque watch devuelve una FUNCIÓN nueva en cada
  // render: el compilador de React no puede memoizar el componente y se saltea
  // la optimización de toda la sección.
  const primario = useWatch({ control, name: 'primary_color' });
  const secundario = useWatch({ control, name: 'secondary_color' });
  const acento = useWatch({ control, name: 'accent_color' });

  async function subir(cual: 'logo' | 'isotipo', file: File) {
    const problema = validarImagenDeMarca(file, settings.max_image_mb);
    if (problema) {
      toast.error(problema);
      return;
    }

    setSubiendo(cual);
    // El bucket `branding` es plano: branding/<archivo>.
    const resultado = await subirArchivo('branding', nombreSeguro(file.name), file);
    setSubiendo(null);

    if ('error' in resultado) {
      toast.error(resultado.error);
      return;
    }

    if (cual === 'logo') {
      setValue('logo_path', resultado.path, { shouldDirty: true });
      setVistaLogo(urlDeMarca(resultado.path));
    } else {
      setValue('isotype_path', resultado.path, { shouldDirty: true });
      setVistaIsotipo(urlDeMarca(resultado.path));
    }

    toast.success('Imagen subida. Acordate de guardar los cambios.');
  }

  function quitar(cual: 'logo' | 'isotipo') {
    if (cual === 'logo') {
      setValue('logo_path', '', { shouldDirty: true });
      setVistaLogo(null);
    } else {
      setValue('isotype_path', '', { shouldDirty: true });
      setVistaIsotipo(null);
    }
  }

  return (
    <Seccion
      titulo="Identidad visual"
      descripcion="El logo, el isotipo y los colores de la academia."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarIdentidad(d))))}
        noValidate
        className="space-y-5"
      >
        {/* Las rutas de las imágenes no tienen un control visible (las escribe
            la subida), pero son datos del formulario: van registradas para que
            viajen sí o sí en el envío. */}
        <input type="hidden" {...register('logo_path')} />
        <input type="hidden" {...register('isotype_path')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SubidorDeImagen
            label="Logo"
            hint="Se muestra en el encabezado y en la pantalla de ingreso. Idealmente horizontal, con fondo transparente."
            url={vistaLogo}
            subiendo={subiendo === 'logo'}
            onArchivo={(f) => subir('logo', f)}
            onQuitar={() => quitar('logo')}
          />
          <SubidorDeImagen
            label="Isotipo"
            hint="La marca sin texto (el símbolo solo). Se usa donde no entra el logo completo."
            url={vistaIsotipo}
            subiendo={subiendo === 'isotipo'}
            onArchivo={(f) => subir('isotipo', f)}
            onQuitar={() => quitar('isotipo')}
          />
        </div>

        <Callout tone="info" title="Los colores se aplican en toda la aplicación">
          Lo que elijas acá cambia los botones, los enlaces y los detalles de todas las pantallas
          —también las que ven los alumnos— apenas guardes. Elegí colores con buen contraste sobre
          fondo claro: si no, los textos se vuelven difíciles de leer.
        </Callout>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectorDeColor
            label="Color primario"
            hint="Botones y enlaces."
            valor={primario}
            onChange={(v) => setValue('primary_color', v, { shouldValidate: true, shouldDirty: true })}
            error={errors.primary_color?.message}
          />
          <SelectorDeColor
            label="Color secundario"
            hint="Fondos y acentos oscuros."
            valor={secundario}
            onChange={(v) =>
              setValue('secondary_color', v, { shouldValidate: true, shouldDirty: true })
            }
            error={errors.secondary_color?.message}
          />
          <SelectorDeColor
            label="Color de acento"
            hint="Detalles y destacados. Usalo con moderación."
            valor={acento}
            onChange={(v) => setValue('accent_color', v, { shouldValidate: true, shouldDirty: true })}
            error={errors.accent_color?.message}
          />
        </div>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

function SubidorDeImagen({
  label,
  hint,
  url,
  subiendo,
  onArchivo,
  onQuitar,
}: {
  label: string;
  hint: string;
  url: string | null;
  subiendo: boolean;
  onArchivo: (file: File) => void;
  onQuitar: () => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`${label} de la academia`} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-5 text-muted" aria-hidden />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <label
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas',
              subiendo && 'pointer-events-none opacity-50',
            )}
          >
            <Upload className="size-3.5" aria-hidden />
            {subiendo ? 'Subiendo…' : url ? 'Cambiar' : 'Subir'}
            <input
              type="file"
              accept={FORMATOS_MARCA.join(',')}
              className="sr-only"
              disabled={subiendo}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onArchivo(file);
                // Permite volver a elegir el mismo archivo si algo falló.
                e.target.value = '';
              }}
            />
          </label>

          {url && (
            <Button type="button" size="sm" variant="ghost" onClick={onQuitar} disabled={subiendo}>
              <Trash2 className="size-3.5 text-danger" aria-hidden />
              Quitar
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}

/**
 * Selector de color: la ruedita del sistema y el hexadecimal, sincronizados.
 * Los dos controlan el mismo valor, así que van controlados (no registrados):
 * con inputs no controlados, tocar la ruedita no actualizaría el texto.
 */
function SelectorDeColor({
  label,
  hint,
  valor,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  valor: string;
  onChange: (valor: string) => void;
  error?: string;
}) {
  // <input type="color"> exige un #RRGGBB válido; si la persona está escribiendo
  // el hexadecimal a mano, le mostramos algo neutro en vez de romper.
  const valido = /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : '#ffffff';

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valido}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}: elegir con la paleta`}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface p-1"
        />
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label}: código hexadecimal`}
          aria-invalid={error ? true : undefined}
          placeholder="#8C6A5D"
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 font-mono text-ink uppercase placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger"
        />
      </div>
    </Field>
  );
}

/* =============================================================================
   Recibos
   ============================================================================= */

function SeccionRecibos({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRecibos>({
    resolver: zodResolver(esquemaRecibos),
    defaultValues: {
      receipt_prefix: settings.receipt_prefix,
      receipt_next_number: settings.receipt_next_number,
      receipt_footer: settings.receipt_footer ?? '',
      receipt_legal: settings.receipt_legal,
    },
  });

  return (
    <Seccion
      titulo="Recibos"
      descripcion="La numeración es correlativa y la lleva la base: no se saltea ni se repite, aunque dos pagos entren al mismo tiempo."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarRecibos(d))))}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prefijo"
            required
            hint="El recibo se ve así: R-000123."
            error={errors.receipt_prefix?.message}
            {...register('receipt_prefix')}
          />
          <Input
            label="Próximo número"
            type="number"
            min={1}
            required
            hint="Ojo: bajarlo puede generar recibos con números repetidos."
            error={errors.receipt_next_number?.message}
            {...register('receipt_next_number', { valueAsNumber: true })}
          />
        </div>

        <Input
          label="Pie del recibo"
          placeholder="¡Gracias por elegirnos!"
          error={errors.receipt_footer?.message}
          {...register('receipt_footer')}
        />

        <Textarea
          label="Leyenda legal"
          rows={2}
          required
          hint="Se imprime al pie de cada recibo."
          error={errors.receipt_legal?.message}
          {...register('receipt_legal')}
        />

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Matrícula
   ============================================================================= */

const MODO_MATRICULA = [
  { value: 'unica', label: 'Única (se cobra una sola vez al inscribirse)' },
  { value: 'anual', label: 'Anual (se cobra todos los años)' },
] as const;

function SeccionMatricula({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosMatricula>({
    resolver: zodResolver(esquemaMatricula),
    defaultValues: {
      importe: centsToPesos(settings.registration_fee_cents),
      registration_mode: settings.registration_mode,
      registration_due_days: settings.registration_due_days,
    },
  });

  return (
    <Seccion titulo="Matrícula" descripcion="Lo que se cobra al inscribirse.">
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarMatricula(d))))}
        noValidate
        className="space-y-4"
      >
        <MoneyInput
          label="Importe"
          required
          hint="En pesos. Poné 0 si la academia no cobra matrícula."
          error={errors.importe?.message}
          {...register('importe', { valueAsNumber: true })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Modo"
            required
            error={errors.registration_mode?.message}
            {...register('registration_mode')}
          >
            {MODO_MATRICULA.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Input
            label="Días para pagarla"
            type="number"
            min={0}
            required
            hint="Desde la inscripción hasta el vencimiento."
            error={errors.registration_due_days?.message}
            {...register('registration_due_days', { valueAsNumber: true })}
          />
        </div>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Cuotas
   ============================================================================= */

function SeccionCuotas({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosCuotas>({
    resolver: zodResolver(esquemaCuotas),
    defaultValues: {
      fee_due_day: settings.fee_due_day,
      default_charge_mode: settings.default_charge_mode,
      bill_january: settings.bill_january,
      bill_february: settings.bill_february,
      jan_feb_charge_mode: settings.jan_feb_charge_mode,
    },
  });

  return (
    <Seccion
      titulo="Cuotas"
      descripcion="Cuándo vencen y cómo se cobra el primer mes de cada alumno."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarCuotas(d))))}
        noValidate
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Día de vencimiento"
            type="number"
            min={1}
            max={28}
            required
            hint="Del 1 al 28: no todos los meses llegan al 29."
            error={errors.fee_due_day?.message}
            {...register('fee_due_day', { valueAsNumber: true })}
          />

          <Select
            label="Modo de cobro por defecto"
            required
            hint="Cómo se cobra el primer mes de quien se inscribe."
            error={errors.default_charge_mode?.message}
            {...register('default_charge_mode')}
          >
            {opciones(MODO_COBRO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-3 rounded-xl bg-canvas p-4">
          <p className="text-sm font-medium text-ink">Receso de verano</p>
          <p className="text-xs text-muted">
            En enero y febrero muchas academias no dictan clases. Si no los facturás, no se generan
            cuotas de esos meses.
          </p>

          <div className="space-y-2.5 pt-1">
            <Casilla label="Facturar enero" {...register('bill_january')} />
            <Casilla label="Facturar febrero" {...register('bill_february')} />
          </div>

          <Select
            label="Modo de cobro para quien se inscribe en enero o febrero"
            required
            hint="Suele convenir «empezar a cobrar el mes siguiente»: se inscribe en el verano y la primera cuota le llega en marzo."
            error={errors.jan_feb_charge_mode?.message}
            {...register('jan_feb_charge_mode')}
          >
            {opciones(MODO_COBRO).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Recuperaciones
   ============================================================================= */

function SeccionRecuperaciones({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRecuperaciones>({
    resolver: zodResolver(esquemaRecuperaciones),
    defaultValues: {
      recovery_min_notice_hours: settings.recovery_min_notice_hours,
      recovery_validity_days: settings.recovery_validity_days,
    },
  });

  return (
    <Seccion
      titulo="Recuperaciones"
      descripcion="Cuándo una falta da derecho a recuperar la clase y hasta cuándo se puede usar ese crédito."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarRecuperaciones(d))))}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Horas mínimas de aviso"
            type="number"
            min={0}
            required
            hint="Si avisa con menos anticipación, la falta no genera recuperación."
            error={errors.recovery_min_notice_hours?.message}
            {...register('recovery_min_notice_hours', { valueAsNumber: true })}
          />
          <Input
            label="Días de vigencia"
            type="number"
            min={1}
            required
            hint="Cuánto dura el crédito antes de vencer."
            error={errors.recovery_validity_days?.message}
            {...register('recovery_validity_days', { valueAsNumber: true })}
          />
        </div>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Archivos
   ============================================================================= */

function SeccionArchivos({ settings }: { settings: Config }) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosArchivos>({
    resolver: zodResolver(esquemaArchivos),
    defaultValues: {
      max_image_mb: settings.max_image_mb,
      max_document_mb: settings.max_document_mb,
      max_video_mb: settings.max_video_mb,
    },
  });

  return (
    <Seccion
      titulo="Límites de archivos"
      descripcion="El tamaño máximo que puede subir un alumno (fotos de proyectos, comprobantes, videos)."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarArchivos(d))))}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Imágenes (MB)"
            type="number"
            min={1}
            required
            error={errors.max_image_mb?.message}
            {...register('max_image_mb', { valueAsNumber: true })}
          />
          <Input
            label="Documentos (MB)"
            type="number"
            min={1}
            required
            error={errors.max_document_mb?.message}
            {...register('max_document_mb', { valueAsNumber: true })}
          />
          <Input
            label="Videos (MB)"
            type="number"
            min={1}
            required
            error={errors.max_video_mb?.message}
            {...register('max_video_mb', { valueAsNumber: true })}
          />
        </div>

        <Callout tone="info">
          El almacenamiento también tiene un tope propio por tipo de archivo. Si subís estos valores
          por encima de ese tope, manda el más chico de los dos.
        </Callout>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Mercado Pago
   ============================================================================= */

function SeccionMercadoPago({
  settings,
  configurado,
}: {
  settings: Config;
  configurado: boolean;
}) {
  const guardado = useGuardado();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosMercadoPago>({
    resolver: zodResolver(esquemaMercadoPago),
    defaultValues: {
      // Sin credenciales en el servidor no se puede activar: si la base quedó en
      // true (por ejemplo, se borró la variable de entorno), acá se ve apagado.
      mp_enabled: settings.mp_enabled && configurado,
      mp_public_key: settings.mp_public_key ?? '',
    },
  });

  return (
    <Seccion
      titulo="Mercado Pago"
      descripcion="Con esto activado, el alumno puede pagar su cuota desde el celular."
    >
      <form
        onSubmit={handleSubmit(async (d) => void (await guardado(await guardarMercadoPago(d))))}
        noValidate
        className="space-y-4"
      >
        {!configurado && (
          <Callout tone="warning" title="Mercado Pago no está configurado en el servidor">
            <p>
              Falta la variable de entorno <code className="font-mono">MERCADOPAGO_ACCESS_TOKEN</code>.
              Hasta que se cargue, no se puede activar el cobro en línea.
            </p>
            <p className="mt-1.5">
              <strong className="font-medium">La aplicación funciona igual:</strong> los pagos se
              registran de forma manual (efectivo, transferencia con comprobante) y todo lo demás
              —cuotas, recibos, caja— sigue andando como siempre.
            </p>
          </Callout>
        )}

        <Casilla
          label="Aceptar pagos con Mercado Pago"
          hint={
            configurado
              ? 'Los alumnos van a ver el botón «Pagar» en sus cuotas pendientes.'
              : 'No se puede activar sin el token del servidor.'
          }
          disabled={!configurado}
          {...register('mp_enabled')}
        />

        <Input
          label="Public key"
          placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={!configurado}
          hint="La encontrás en Mercado Pago → Tus integraciones → Credenciales. Es pública por diseño: no es la clave secreta."
          error={errors.mp_public_key?.message}
          {...register('mp_public_key')}
        />

        <Callout tone="info" title="El access token nunca se guarda acá">
          La clave secreta vive únicamente en una variable de entorno del servidor. No se guarda en
          la base ni llega al navegador, ni siquiera a esta pantalla.
        </Callout>

        <Guardar enviando={isSubmitting} />
      </form>
    </Seccion>
  );
}

/* =============================================================================
   Medios de pago
   ============================================================================= */

function SeccionMedios({ medios }: { medios: MedioDePago[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<MedioDePago | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<MedioDePago | null>(null);

  const columnas: ReadonlyArray<Column<MedioDePago>> = [
    {
      header: 'Medio',
      primary: true,
      render: (m) => (
        <div>
          <span>{m.name}</span>
          <p className="font-mono text-xs font-normal text-muted">{m.code}</p>
        </div>
      ),
    },
    {
      header: 'Comprobante',
      render: (m) =>
        m.requires_proof ? <Badge tone="info">Pide comprobante</Badge> : <span className="text-muted">No</span>,
    },
    { header: 'Orden', render: (m) => m.sort_order, desktopOnly: true },
    {
      header: 'Estado',
      trailing: true,
      render: (m) =>
        m.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>,
    },
  ];

  async function cambiarEstado(medio: MedioDePago) {
    const r = await alternarMedioDePago(medio.id, !medio.is_active);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarMedioDePago(aEliminar.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Medios de pago</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Los que aparecen al cobrar una cuota. Un medio que pide comprobante (como la
              transferencia) hace que el alumno tenga que subir el suyo.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nuevo
          </Button>
        </CardHeader>

        <CardContent>
          <DataList
            items={medios}
            columns={columnas}
            keyOf={(m) => m.id}
            actions={(m) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cambiarEstado(m)}>
                  <Power className="size-3.5" aria-hidden />
                  {m.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(m)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </>
            )}
          />
        </CardContent>
      </Card>

      {editando !== undefined && (
        <FormMedioDePago medio={editando} onClose={() => setEditando(undefined)} />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar medio de pago"
        description={`Vas a eliminar «${aEliminar?.name}». Si ya se usó en algún pago, el sistema no lo va a borrar: te va a sugerir desactivarlo para no romper el historial.`}
      />
    </>
  );
}

function FormMedioDePago({
  medio,
  onClose,
}: {
  medio: MedioDePago | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosMedioPago>({
    resolver: zodResolver(esquemaMedioPago),
    defaultValues: medio
      ? {
          name: medio.name,
          code: medio.code,
          is_active: medio.is_active,
          requires_proof: medio.requires_proof,
          sort_order: medio.sort_order,
        }
      : {
          name: '',
          code: '',
          is_active: true,
          requires_proof: false,
          sort_order: 10,
        },
  });

  async function onSubmit(datos: DatosMedioPago) {
    const r = await guardarMedioDePago(medio?.id ?? null, datos);
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
      title={medio ? 'Editar medio de pago' : 'Nuevo medio de pago'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="medio-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="medio-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Transferencia"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Código"
          placeholder="transferencia"
          required
          // El código es la llave con la que la base encuentra el medio
          // «mercadopago» al acreditar un pago del webhook: cambiarlo rompería la
          // acreditación automática. Por eso, una vez creado, no se toca.
          readOnly={Boolean(medio)}
          className={medio ? 'bg-canvas text-muted' : undefined}
          hint={
            medio
              ? 'El código no se puede cambiar: la base lo usa para identificar el medio.'
              : 'Identificador interno. Solo minúsculas, números y guion bajo.'
          }
          error={errors.code?.message}
          {...register('code')}
        />

        <Input
          label="Orden"
          type="number"
          min={0}
          required
          hint="Define en qué posición aparece en las listas."
          error={errors.sort_order?.message}
          {...register('sort_order', { valueAsNumber: true })}
        />

        <div className="space-y-2.5">
          <Casilla
            label="Pide comprobante"
            hint="El alumno tiene que subir una foto del pago y la administradora la aprueba."
            {...register('requires_proof')}
          />
          <Casilla label="Activo" {...register('is_active')} />
        </div>
      </form>
    </Dialog>
  );
}
