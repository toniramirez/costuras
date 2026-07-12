import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Column<T> = {
  /** Encabezado de la columna y etiqueta en la tarjeta del celular. */
  header: string;
  render: (item: T) => React.ReactNode;
  /** Línea principal de la tarjeta en el celular (sin etiqueta, más grande). */
  primary?: boolean;
  /** Se muestra a la derecha de la línea principal (estado, importe…). */
  trailing?: boolean;
  /** No aparece en la tarjeta del celular (dato secundario). */
  desktopOnly?: boolean;
  className?: string;
};

/**
 * Listado responsive.
 *
 * En escritorio es una tabla; en el celular, tarjetas. Una tabla apretada en un
 * teléfono es ilegible, y el sistema se usa sobre todo desde el celular.
 */
export function DataList<T>({
  items,
  columns,
  keyOf,
  hrefOf,
  actions,
  className,
}: {
  items: readonly T[];
  columns: ReadonlyArray<Column<T>>;
  keyOf: (item: T) => string;
  /** Si se define, cada fila/tarjeta navega a esa ruta. */
  hrefOf?: (item: T) => string;
  /** Acciones por fila (botones). Se renderizan al final. */
  actions?: (item: T) => React.ReactNode;
  className?: string;
}) {
  const principal = columns.find((c) => c.primary) ?? columns[0];
  const trailing = columns.find((c) => c.trailing);
  const resto = columns.filter((c) => c !== principal && c !== trailing && !c.desktopOnly);

  return (
    <div className={className}>
      {/* ── Celular: tarjetas ─────────────────────────────────────────────── */}
      <ul className="space-y-2 lg:hidden">
        {items.map((item) => {
          const contenido = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-sm font-medium text-ink">
                  {principal.render(item)}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {trailing?.render(item)}
                  {hrefOf && <ChevronRight className="size-4 text-muted" aria-hidden />}
                </div>
              </div>

              {resto.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {resto.map((col) => (
                    <div key={col.header} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted">
                        {col.header}
                      </dt>
                      <dd className="truncate text-sm text-ink">{col.render(item)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {actions && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {actions(item)}
                </div>
              )}
            </>
          );

          return (
            <li
              key={keyOf(item)}
              className="rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(43,37,34,0.04)]"
            >
              {hrefOf && !actions ? (
                <Link href={hrefOf(item)} className="block">
                  {contenido}
                </Link>
              ) : (
                contenido
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Escritorio: tabla ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => (
                <th
                  key={col.header}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
              {actions && <th scope="col" className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={keyOf(item)} className="transition-colors hover:bg-canvas/60">
                {columns.map((col) => (
                  <td key={col.header} className={cn('px-4 py-3 text-ink', col.className)}>
                    {hrefOf && col === principal ? (
                      <Link href={hrefOf(item)} className="font-medium hover:text-brand hover:underline">
                        {col.render(item)}
                      </Link>
                    ) : (
                      col.render(item)
                    )}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">{actions(item)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Encabezado de página: título, bajada y acción principal. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
