'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

/* =============================================================================
   Primitivas de formulario.
   Todas marcan los campos obligatorios, muestran el error debajo y quedan
   correctamente asociadas por id/aria para lectores de pantalla.
   ============================================================================= */

const BASE_CONTROL = cn(
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5',
  'text-ink placeholder:text-muted/60',
  'transition-colors',
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15',
);

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-label="obligatorio">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, required, id, ...props },
  ref,
) {
  const generado = useId();
  const inputId = id ?? generado;

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, className)}
        {...props}
      />
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, error, hint, required, id, rows = 4, ...props },
  ref,
) {
  const generado = useId();
  const inputId = id ?? generado;

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, 'resize-y', className)}
        {...props}
      />
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, error, hint, required, id, children, ...props },
  ref,
) {
  const generado = useId();
  const inputId = id ?? generado;

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, 'appearance-none bg-no-repeat pr-9', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237a716b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: 'right 0.75rem center',
        }}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});

/**
 * Importe en pesos. El formulario trabaja en PESOS y la conversión a centavos
 * se hace al enviar (ver `pesosToCents`): en la base el dinero es SIEMPRE
 * centavos enteros.
 *
 * El "$" va dentro del contenedor del input, no del Field completo: si no,
 * quedaría centrado respecto de la etiqueta.
 */
export const MoneyInput = forwardRef<HTMLInputElement, InputProps>(function MoneyInput(
  { className, label, error, hint, required, id, ...props },
  ref,
) {
  const generado = useId();
  const inputId = id ?? generado;

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
          $
        </span>
        <input
          ref={ref}
          id={inputId}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(BASE_CONTROL, 'pl-7', className)}
          {...props}
        />
      </div>
    </Field>
  );
});
