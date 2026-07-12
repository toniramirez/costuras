import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/labels';

/**
 * El anillo (`ring-1` hacia adentro) es lo que separa una insignia del fondo de
 * la fila sin tener que subirle la saturación al relleno. Así el estado se lee
 * igual de bien y la pantalla no se llena de manchas de color.
 */
const TONOS: Record<Tone, string> = {
  neutral: 'bg-line/50 text-muted ring-line-strong/60',
  success: 'bg-success-soft text-success ring-success/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  warning: 'bg-warning-soft text-warning ring-warning/20',
  info: 'bg-info-soft text-info ring-info/20',
  brand: 'bg-brand/10 text-brand ring-brand/20',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5',
        'text-xs font-medium ring-1 ring-inset',
        TONOS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Insignia de estado a partir de un mapa de etiquetas (ver lib/labels). */
export function StatusBadge<T extends string>({
  value,
  map,
  className,
}: {
  value: T;
  map: Record<T, { label: string; tone: Tone }>;
  className?: string;
}) {
  const entrada = map[value];
  if (!entrada) return null;
  return (
    <Badge tone={entrada.tone} className={className}>
      {entrada.label}
    </Badge>
  );
}
