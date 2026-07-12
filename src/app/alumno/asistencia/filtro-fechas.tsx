'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Rango de fechas, sincronizado con la URL.
 *
 * El kit trae `SearchInput` y `FilterSelect`, pero no un filtro de fechas: acá
 * repetimos la misma idea (escribir en los query params, no en estado local) con
 * dos <input type="date">, que en el celular abren el selector nativo.
 */
export function FiltroFechas() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  const setParam = (clave: string, valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    // Cambiar un filtro siempre vuelve a la primera página.
    params.delete('pagina');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clases = (activo: string) =>
    [
      'h-11 rounded-xl border bg-surface px-3 text-sm text-ink',
      'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
      activo ? 'border-brand bg-brand/5 font-medium' : 'border-line-strong',
    ].join(' ');

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={desde}
        max={hasta || undefined}
        onChange={(e) => setParam('desde', e.target.value)}
        aria-label="Desde"
        className={clases(desde)}
      />
      <span className="text-sm text-muted" aria-hidden>
        a
      </span>
      <input
        type="date"
        value={hasta}
        min={desde || undefined}
        onChange={(e) => setParam('hasta', e.target.value)}
        aria-label="Hasta"
        className={clases(hasta)}
      />
    </div>
  );
}
