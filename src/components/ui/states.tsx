import { cn } from '@/lib/utils';

/** Bloque gris que late mientras carga. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/70', className)} aria-hidden />;
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

/** Pantalla vacía: nunca dejamos un listado en blanco sin explicación. */
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
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-line/50 text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Aviso administrativo (por ejemplo: Mercado Pago sin configurar). */
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
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
  } as const;

  return (
    <div className={cn('rounded-xl px-4 py-3 text-sm', tonos[tone])} role="status">
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-0.5')}>{children}</div>
    </div>
  );
}
