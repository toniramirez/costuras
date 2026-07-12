'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { POR_PAGINA } from '@/lib/pagination';

/**
 * OJO: `rangoPagina()` y `POR_PAGINA` NO se exportan desde acá.
 * Este archivo es `'use client'`, y sus exportaciones no se pueden invocar desde
 * un Server Component. Para armar el `.range()` en un servicio, importalos de
 * `@/lib/pagination`.
 */
export function Pagination({ total, porPagina = POR_PAGINA }: { total: number; porPagina?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pagina = Math.max(1, Number(searchParams.get('pagina')) || 1);
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  if (paginas <= 1) return null;

  const ir = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete('pagina');
    else params.set('pagina', String(n));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-3 border-t border-line pt-3"
    >
      <p className="text-xs text-muted">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => ir(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Button>
        <span className="text-xs tabular-nums text-muted">
          {pagina} / {paginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => ir(pagina + 1)}
          disabled={pagina >= paginas}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
