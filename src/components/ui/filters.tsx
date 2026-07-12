'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Filtros sincronizados con la URL.
 *
 * Los guardamos en los query params, no en estado local: así se conservan al
 * navegar, al volver atrás, al recargar y al compartir el enlace. También hace
 * que las exportaciones respeten exactamente lo que la persona está viendo.
 */
function useFiltroUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  const setParam = (clave: string, valor: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    // Cambiar un filtro siempre vuelve a la primera página.
    params.delete('pagina');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return { searchParams, setParam, pendiente };
}

/** Buscador con retardo: no dispara una consulta por cada tecla. */
export function SearchInput({
  placeholder = 'Buscar…',
  param = 'q',
}: {
  placeholder?: string;
  param?: string;
}) {
  const { searchParams, setParam, pendiente } = useFiltroUrl();
  const valorUrl = searchParams.get(param) ?? '';
  const [valor, setValor] = useState(valorUrl);

  // Si la URL cambia por fuera (botón atrás, «Limpiar filtros»), sincronizamos
  // el input. Se ajusta DURANTE el render y no en un useEffect: setState dentro
  // de un efecto dispara un segundo render en cascada.
  const [urlAnterior, setUrlAnterior] = useState(valorUrl);
  if (valorUrl !== urlAnterior) {
    setUrlAnterior(valorUrl);
    setValor(valorUrl);
  }

  useEffect(() => {
    if (valor === valorUrl) return;
    const t = setTimeout(() => setParam(param, valor.trim() || null), 300);
    return () => clearTimeout(t);
    // setParam se recrea en cada render; no lo incluimos a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, valorUrl, param]);

  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-9 text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      {pendiente ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
      ) : valor ? (
        <button
          type="button"
          onClick={() => setValor('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-line/40"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Desplegable de filtro que escribe en la URL. */
export function FilterSelect({
  param,
  label,
  options,
  allLabel = 'Todos',
  className,
}: {
  param: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  allLabel?: string;
  className?: string;
}) {
  const { searchParams, setParam } = useFiltroUrl();
  const valor = searchParams.get(param) ?? '';

  return (
    <select
      value={valor}
      onChange={(e) => setParam(param, e.target.value || null)}
      aria-label={label}
      className={cn(
        'h-11 rounded-xl border bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
        // Resaltamos cuando hay un filtro activo: si no, se olvida que está puesto.
        valor ? 'border-brand bg-brand/5 font-medium' : 'border-line-strong',
        className,
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Contenedor de la barra de filtros + botón para limpiarlos todos. */
export function FiltersBar({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activos = Array.from(searchParams.keys()).filter((k) => k !== 'pagina').length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {activos > 0 && (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-line/40 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
