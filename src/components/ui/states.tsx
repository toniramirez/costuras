import { HiloSuelto, Puntada } from '@/components/brand/hilo';
import { cn } from '@/lib/utils';

/**
 * Bloque que espera mientras carga.
 *
 * No late en gris: le pasa un brillo de seda por encima. Un `pulse` gris es el
 * esqueleto de cualquier app; el reflejo sobre la tela es de esta.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('seda rounded-lg', className)} aria-hidden />;
}

/** Esqueleto de un listado (mientras se resuelve el Suspense). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-card" />
      ))}
    </div>
  );
}

/** Esqueleto de una grilla de métricas. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-card" />
      ))}
    </div>
  );
}

/**
 * Pantalla vacía: nunca dejamos un listado en blanco sin explicación.
 *
 * Sin ícono propio muestra un hilo suelto que se dibuja solo: es lo que hay
 * cuando todavía no se cosió nada. Con `icon`, respeta el que le pasen.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-surgir flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-line/50 text-muted">
          {icon}
        </div>
      ) : (
        <HiloSuelto className="mb-3 text-line-strong" />
      )}

      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Aviso administrativo (por ejemplo: Mercado Pago sin configurar).
 *
 * Lleva un hilo del color del tono cosido al costado izquierdo: se distingue de
 * un párrafo cualquiera aunque el fondo sea suave.
 */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: React.ReactNode;
}) {
  const tonos = {
    info: 'bg-info-soft text-info border-info/30',
    warning: 'bg-warning-soft text-warning border-warning/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
    success: 'bg-success-soft text-success border-success/30',
  } as const;

  return (
    <div
      className={cn(
        'animate-surgir rounded-xl border-l-2 px-4 py-3 text-sm',
        tonos[tone],
      )}
      role="status"
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-0.5')}>{children}</div>
    </div>
  );
}

/**
 * Separador de secciones con la puntada de la marca.
 *
 * Reemplaza al `<hr>` sólido en todo lo decorativo. Con `label`, la puntada se
 * corta para dejar pasar el texto — como una costura que rodea una etiqueta.
 */
export function Separador({ label, className }: { label?: string; className?: string }) {
  if (!label) return <Puntada className={className} />;

  return (
    <div className={cn('flex items-center gap-3', className)} role="separator">
      <Puntada className="flex-1" />
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <Puntada className="flex-1" />
    </div>
  );
}
