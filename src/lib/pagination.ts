/**
 * Paginación — parte que corre en el SERVIDOR.
 *
 * Vive acá y no en `components/ui/pagination.tsx` a propósito: ese archivo es
 * `'use client'`, y en el App Router **todas** las exportaciones de un módulo de
 * cliente se vuelven referencias de cliente. Llamar una de esas funciones desde
 * un Server Component revienta en runtime:
 *
 *   "Attempted to call rangoPagina() from the server but rangoPagina is on the client"
 *
 * Como los servicios (que arman el `.range()` de Supabase) son `server-only`,
 * estas piezas tienen que estar en un módulo neutro.
 */
export const POR_PAGINA = 20;

/** Rango [desde, hasta] para el `.range()` de Supabase. */
export function rangoPagina(pagina: number, porPagina = POR_PAGINA): [number, number] {
  const p = Math.max(1, pagina || 1);
  return [(p - 1) * porPagina, p * porPagina - 1];
}

/** Número de página a partir de los searchParams (1 si no viene o es inválido). */
export function paginaDe(valor: string | undefined): number {
  return Math.max(1, Number(valor) || 1);
}
