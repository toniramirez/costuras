import { NumeroAnimado } from '@/components/ui/numero-animado';
import { cn } from '@/lib/utils';

export function Card({
  className,
  interactiva = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Se levanta al pasar el mouse. Solo si la tarjeta hace algo al tocarla. */
  interactiva?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-suave',
        interactiva && 'alzar hover:border-line-strong',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 p-4 sm:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-line px-4 py-3 sm:px-5', className)}
      {...props}
    />
  );
}

/**
 * Métrica del tablero: número grande, etiqueta discreta.
 *
 * El número se cuenta solo al aparecer y arriba lleva un hilo del color del
 * tono: es lo único que distingue una métrica buena de una mala de un vistazo,
 * sin tener que leer el número.
 *
 * `value` acepta un número (se anima) o un texto ya formateado (no se anima:
 * no se puede contar hacia «—»).
 */
export function StatCard({
  label,
  value,
  tipo = 'entero',
  hint,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  /** Número crudo (en centavos si `tipo` es 'moneda') o un texto ya armado. */
  value: number | string;
  tipo?: 'moneda' | 'entero';
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
  className?: string;
}) {
  const tonos = {
    neutral: 'text-ink',
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
  } as const;

  const hilos = {
    neutral: 'bg-line-strong',
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
  } as const;

  return (
    <Card className={cn('relative overflow-hidden p-4', className)}>
      {/* El hilo del tono, cosido al borde de arriba. */}
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-0.5', hilos[tone])}
      />

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>

      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', tonos[tone])}>
        {typeof value === 'number' ? <NumeroAnimado valor={value} tipo={tipo} /> : value}
      </p>

      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
