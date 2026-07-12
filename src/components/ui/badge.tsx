import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/labels';

const TONOS: Record<Tone, string> = {
  neutral: 'bg-line/60 text-muted',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand/10 text-brand',
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
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
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
