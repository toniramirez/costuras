import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  FileClock,
  Receipt,
  UserPlus,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAdminDashboard } from '@/lib/services/dashboard';
import { formatDate, formatMoney, formatPeriod, formatTime, TIMEZONE } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Inicio' };

/**
 * El Inicio contesta UNA pregunta: ¿qué tengo que hacer hoy?
 *
 * Antes era un tablero de quince números y un selector de mes: información
 * cierta, pero que no pedía nada. Había que leerla toda para recién ahí darse
 * cuenta de que había tres comprobantes esperando.
 *
 * Ahora lo primero y más grande son los pendientes, y cada uno es un enlace a
 * la pantalla donde se resuelve. Los números del mes quedaron abajo, reducidos
 * a los cuatro que se miran de verdad; el detalle (y el resto de los meses) está
 * en cada área, que es donde se trabaja.
 */
export default async function AdminHomePage() {
  const d = await getAdminDashboard();

  const hoyTexto = formatInTimeZone(new Date(), TIMEZONE, "EEEE d 'de' MMMM", { locale: es });
  const sinTomar = d.clasesDeHoy.filter((c) => !c.asistenciaTomada);

  const pendientes = [
    ...sinTomar.map((clase) => ({
      key: `clase-${clase.id}`,
      href: `/admin/asistencia?grupo=${clase.id}&fecha=${d.hoy}`,
      icon: <CalendarCheck className="size-5" aria-hidden />,
      tono: 'info' as const,
      titulo: `Tomar asistencia de ${clase.name}`,
      detalle: `Hoy ${formatTime(clase.start_time)}${
        clase.end_time ? ` a ${formatTime(clase.end_time)}` : ''
      }`,
    })),

    ...(d.pendientes.comprobantes > 0
      ? [
          {
            key: 'comprobantes',
            href: '/admin/comprobantes',
            icon: <FileClock className="size-5" aria-hidden />,
            tono: 'info' as const,
            titulo:
              d.pendientes.comprobantes === 1
                ? 'Revisar 1 comprobante'
                : `Revisar ${d.pendientes.comprobantes} comprobantes`,
            detalle: 'Alumnos que ya pagaron y esperan la confirmación',
          },
        ]
      : []),

    ...(d.cuotas.vencidas > 0
      ? [
          {
            key: 'vencidas',
            href: '/admin/cuotas?estado=vencida',
            icon: <AlertTriangle className="size-5" aria-hidden />,
            tono: 'danger' as const,
            titulo:
              d.cuotas.vencidas === 1
                ? 'Hay 1 cuota vencida'
                : `Hay ${d.cuotas.vencidas} cuotas vencidas`,
            detalle: `${formatMoney(d.cuotas.totalPorCobrar)} sin cobrar en total`,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Inicio</h1>
        <p className="text-sm capitalize text-muted">{hoyTexto}</p>
      </header>

      {/* 1. Lo que hay que hacer. Es lo primero porque es lo único que apura. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Para hacer</h2>

        {pendientes.length === 0 ? (
          <Card className="flex items-center gap-3 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">Todo al día.</p>
              <p className="text-sm text-muted">
                No hay asistencias sin tomar, comprobantes sin revisar ni cuotas vencidas.
              </p>
            </div>
          </Card>
        ) : (
          <ul className="space-y-2">
            {pendientes.map((p) => (
              <li key={p.key}>
                <Link
                  href={p.href}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-canvas"
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full',
                      p.tono === 'danger'
                        ? 'bg-danger-soft text-danger'
                        : 'bg-info-soft text-info',
                    )}
                  >
                    {p.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.titulo}</span>
                    <span className="block truncate text-sm text-muted">{p.detalle}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Las tres cosas que se hacen todos los días, a un toque. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Ir directo a</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AccesoRapido
            href="/admin/asistencia"
            icon={<CalendarCheck className="size-5" aria-hidden />}
            label="Tomar asistencia"
          />
          <AccesoRapido
            href="/admin/cuotas"
            icon={<Receipt className="size-5" aria-hidden />}
            label="Cobrar una cuota"
          />
          <AccesoRapido
            href="/admin/alumnos"
            icon={<UserPlus className="size-5" aria-hidden />}
            label="Anotar un alumno"
          />
        </div>
      </section>

      {/* 3. Cómo viene el mes. Cuatro números, no quince. */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {formatPeriod(d.periodo.anio, d.periodo.mes)}
          </h2>
          <Link href="/admin/cuotas" className="text-sm font-medium text-brand hover:underline">
            Ver el detalle
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero label="Alumnos activos" valor={String(d.alumnos.activos)} />
          <Numero label="Cobrado" valor={formatMoney(d.finanzas.ingresos)} tono="success" />
          <Numero
            label="Falta cobrar"
            valor={formatMoney(d.cuotas.totalPorCobrar)}
            tono={d.cuotas.totalPorCobrar > 0 ? 'danger' : 'neutral'}
          />
          <Numero
            label="Resultado"
            valor={formatMoney(d.finanzas.resultado)}
            tono={d.finanzas.resultado >= 0 ? 'success' : 'danger'}
          />
        </div>
      </section>

      {/* 4. Lo que se viene. Solo si hay algo. */}
      {d.talleres.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-muted" aria-hidden />
              Próximos talleres
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {d.talleres.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="text-xs text-muted">{formatDate(t.event_date)}</p>
                  </div>
                  <Badge tone={t.status === 'cupo_completo' ? 'warning' : 'info'}>
                    {t.status === 'cupo_completo' ? 'Cupo completo' : `${t.capacity} lugares`}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccesoRapido({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-brand/5"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}

/** Un número del mes. Grande el número, chica la etiqueta. */
function Numero({
  label,
  valor,
  tono = 'neutral',
}: {
  label: string;
  valor: string;
  tono?: 'neutral' | 'success' | 'danger';
}) {
  const tonos = {
    neutral: 'text-ink',
    success: 'text-success',
    danger: 'text-danger',
  } as const;

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl', tonos[tono])}>
        {valor}
      </p>
    </Card>
  );
}
