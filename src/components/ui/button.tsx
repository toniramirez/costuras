'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:brightness-95 active:brightness-90 shadow-sm',
  secondary:
    'bg-secondary text-white hover:brightness-110 active:brightness-95',
  outline:
    'border border-line-strong bg-surface text-ink hover:bg-canvas active:bg-line/40',
  ghost:
    'text-ink hover:bg-line/40 active:bg-line/60',
  danger:
    'bg-danger text-white hover:brightness-95 active:brightness-90',
};

// Alturas cómodas para el pulgar: mínimo 44px (recomendación de accesibilidad).
const TAMANIOS: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Muestra el spinner y BLOQUEA el botón: evita el doble envío del formulario. */
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, fullWidth, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Deshabilitado mientras carga: es la defensa contra el doble clic.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-[filter,background-color] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        'select-none',
        VARIANTES[variant],
        TAMANIOS[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
