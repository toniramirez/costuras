'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECCIONES = [
  { href: '/admin/movimientos', label: 'Movimientos' },
  { href: '/admin/movimientos/categorias', label: 'Categorías' },
] as const;

export function TabsMovimientos() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de movimientos" className="flex gap-1 border-b border-line">
      {SECCIONES.map((s) => {
        const activo = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              activo ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
