'use client';

import { forwardRef } from 'react';
import { Carretel } from '@/components/brand/hilo';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-suave hover:shadow-alzado',
  secondary: 'bg-secondary text-white shadow-suave hover:brightness-110',
  outline: 'border border-line-strong bg-surface text-ink hover:border-brand hover:text-brand',
  ghost: 'text-ink hover:bg-line/40',
  danger: 'bg-danger text-white shadow-suave hover:brightness-95',
};

/** El barrido de luz solo tiene sentido sobre relleno: en un fantasma no se vería. */
const CON_LUSTRE: readonly Variant[] = ['primary', 'secondary', 'danger'];

// Alturas cómodas para el pulgar: mínimo 44px (recomendación de accesibilidad).
const TAMANIOS: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Muestra el carretel y BLOQUEA el botón: evita el doble envío del formulario. */
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
        'inline-flex select-none items-center justify-center rounded-xl font-medium',
        // El hundido al apretar es lo que le da tacto: el botón se apoya contra
        // la tela y vuelve. Sin esto el clic no se siente en el celular.
        'transition-[transform,box-shadow,background-color,border-color,color,filter]',
        'duration-200 ease-[var(--ease-tela)] active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variant],
        TAMANIOS[size],
        CON_LUSTRE.includes(variant) && 'lustre',
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Carretel className="size-4" />}
      {children}
    </button>
  );
});
