'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, ScrollText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Tone } from '@/lib/labels';
import type { Tables } from '@/lib/supabase/database.types';

type Registro = Tables<'audit_logs'>;

/**
 * Auditoría: quién cambió qué y cuándo.
 *
 * Es SOLO LECTURA. La tabla es inmutable: la escriben triggers de la base y ni
 * siquiera la administradora puede modificarla (los permisos de INSERT, UPDATE y
 * DELETE están revocados). Por eso acá no hay ni un botón de editar o borrar:
 * un registro de auditoría que se puede editar no sirve para nada.
 */

/** Las tablas que tienen trigger de auditoría (ver migración de funciones). */
const ENTIDADES: Record<string, string> = {
  students: 'Alumnos',
  monthly_fees: 'Cuotas',
  registration_fees: 'Matrículas',
  payments: 'Pagos',
  payment_proofs: 'Comprobantes',
  cash_accounts: 'Cajas',
  recovery_credits: 'Recuperaciones',
  rates: 'Tarifas',
  plans: 'Modalidades',
  groups: 'Grupos',
};

const ACCIONES: Record<string, { label: string; tone: Tone }> = {
  insert: { label: 'Creación', tone: 'success' },
  update: { label: 'Modificación', tone: 'info' },
  delete: { label: 'Eliminación', tone: 'danger' },
};

/** Nombres legibles de las columnas más frecuentes. El resto se muestra tal cual. */
const CAMPOS: Record<string, string> = {
  status: 'Estado',
  first_name: 'Nombre',
  last_name: 'Apellido',
  dni: 'DNI',
  email: 'Correo',
  phone: 'Teléfono',
  address: 'Dirección',
  notes: 'Notas',
  admin_notes: 'Notas internas',
  name: 'Nombre',
  amount_cents: 'Importe',
  base_amount_cents: 'Importe base',
  final_amount_cents: 'Importe final',
  manual_adjustment_cents: 'Ajuste manual',
  price_cents: 'Precio',
  net_amount_cents: 'Neto acreditado',
  mp_fee_cents: 'Comisión de Mercado Pago',
  initial_balance_cents: 'Saldo inicial',
  due_date: 'Vencimiento',
  paid_date: 'Fecha de pago',
  issued_date: 'Fecha de emisión',
  start_date: 'Fecha de inicio',
  enrollment_date: 'Fecha de inscripción',
  expires_at: 'Vence el',
  receipt_number: 'Número de recibo',
  is_active: 'Activo',
  group_id: 'Grupo',
  plan_id: 'Modalidad',
  rate_id: 'Tarifa',
  created_at: 'Creado el',
  updated_at: 'Actualizado el',
};

type Valores = Record<string, unknown>;

/** El jsonb de la base llega como Json: acá lo tratamos como el objeto que es. */
function comoObjeto(valor: Registro['old_values']): Valores | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor as Valores;
}

/**
 * Los campos que REALMENTE cambiaron.
 *
 * Se comparan serializados: así dos objetos con el mismo contenido no aparecen
 * como distintos solo por ser referencias diferentes.
 */
function camposCambiados(viejo: Valores | null, nuevo: Valores | null): string[] {
  const claves = new Set([...Object.keys(viejo ?? {}), ...Object.keys(nuevo ?? {})]);
  return [...claves]
    .filter((k) => JSON.stringify(viejo?.[k]) !== JSON.stringify(nuevo?.[k]))
    .sort();
}

function mostrar(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  // Todo el dinero se guarda en centavos: mostrarlo crudo sería ilegible.
  if (typeof valor === 'number' && clave.endsWith('_cents')) return formatMoney(valor);
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

export function AuditClient({
  registros,
  total,
  porPagina,
}: {
  registros: Registro[];
  total: number;
  porPagina: number;
}) {
  const [detalle, setDetalle] = useState<Registro | null>(null);

  const columnas: ReadonlyArray<Column<Registro>> = [
    {
      header: 'Qué cambió',
      primary: true,
      render: (r) => (
        <div>
          <span>{ENTIDADES[r.entity_type] ?? r.entity_type}</span>
          {r.entity_id && (
            <p className="font-mono text-xs font-normal text-muted">
              {r.entity_id.slice(0, 8)}…
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Quién',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{r.actor_email ?? 'Sistema'}</p>
          {r.actor_role && <p className="text-xs capitalize text-muted">{r.actor_role}</p>}
        </div>
      ),
    },
    {
      header: 'Cuándo',
      render: (r) => <span className="tabular-nums">{formatDateTime(r.created_at)}</span>,
    },
    {
      header: 'Acción',
      trailing: true,
      render: (r) => {
        const a = ACCIONES[r.action];
        return <Badge tone={a?.tone ?? 'neutral'}>{a?.label ?? r.action}</Badge>;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Auditoría"
        description="El registro de los cambios importantes del sistema. Es inmutable: no se puede editar ni borrar, ni desde acá ni desde ningún lado."
      />

      <FiltersBar>
        <SearchInput param="usuario" placeholder="Buscar por correo de quien hizo el cambio…" />
        <FilterSelect
          param="entidad"
          label="Entidad"
          allLabel="Todas las entidades"
          options={Object.entries(ENTIDADES).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          param="accion"
          label="Acción"
          allLabel="Todas las acciones"
          options={Object.entries(ACCIONES).map(([value, { label }]) => ({ value, label }))}
        />
        <RangoDeFechas />
      </FiltersBar>

      {registros.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-5" />}
          title="No hay movimientos registrados"
          description="Cuando se cree, modifique o elimine un alumno, una cuota o un pago, va a quedar asentado acá."
        />
      ) : (
        <>
          <DataList
            items={registros}
            columns={columnas}
            keyOf={(r) => r.id}
            actions={(r) => (
              <Button size="sm" variant="ghost" onClick={() => setDetalle(r)}>
                <Eye className="size-3.5" aria-hidden />
                Ver detalle
              </Button>
            )}
          />
          <Pagination total={total} porPagina={porPagina} />
        </>
      )}

      {detalle && <DetalleAuditoria registro={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

/** Rango de fechas. Escribe en la URL, igual que el resto de los filtros. */
function RangoDeFechas() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const desde = searchParams.get('desde') ?? '';
  const hasta = searchParams.get('hasta') ?? '';

  const set = (clave: string, valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    // Cambiar un filtro siempre vuelve a la primera página.
    params.delete('pagina');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clases = (activo: string) =>
    cn(
      'h-11 rounded-xl border bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
      activo ? 'border-brand bg-brand/5 font-medium' : 'border-line-strong',
    );

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        aria-label="Desde"
        value={desde}
        max={hasta || undefined}
        onChange={(e) => set('desde', e.target.value)}
        className={clases(desde)}
      />
      <span className="text-xs text-muted">a</span>
      <input
        type="date"
        aria-label="Hasta"
        value={hasta}
        min={desde || undefined}
        onChange={(e) => set('hasta', e.target.value)}
        className={clases(hasta)}
      />
    </div>
  );
}

/**
 * Detalle: qué cambió exactamente.
 *
 * Por defecto se muestran SOLO los campos que cambiaron, que es lo que la
 * persona vino a ver. El resto de la fila está a un clic, por si hace falta el
 * contexto completo.
 */
function DetalleAuditoria({
  registro,
  onClose,
}: {
  registro: Registro;
  onClose: () => void;
}) {
  const [verTodo, setVerTodo] = useState(false);

  const viejo = comoObjeto(registro.old_values);
  const nuevo = comoObjeto(registro.new_values);

  const cambiados = camposCambiados(viejo, nuevo);
  const todas = [...new Set([...Object.keys(viejo ?? {}), ...Object.keys(nuevo ?? {})])].sort();
  const campos = verTodo ? todas : cambiados;

  const accion = ACCIONES[registro.action];
  const esAlta = registro.action === 'insert';
  const esBaja = registro.action === 'delete';

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${accion?.label ?? registro.action} · ${ENTIDADES[registro.entity_type] ?? registro.entity_type}`}
      className="max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted">Cuándo</dt>
            <dd className="truncate text-ink">{formatDateTime(registro.created_at)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Quién</dt>
            <dd className="truncate text-ink">{registro.actor_email ?? 'Sistema'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Registro</dt>
            <dd className="truncate font-mono text-xs text-ink">{registro.entity_id ?? '—'}</dd>
          </div>
        </dl>

        {campos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No hay diferencias registradas para este cambio.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Campo
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Antes
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Después
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campos.map((campo) => {
                  const cambio = cambiados.includes(campo);

                  return (
                    <tr key={campo} className={cn(cambio && 'bg-warning-soft/40')}>
                      <td className="px-3 py-2 align-top">
                        <span className={cn('text-ink', cambio && 'font-medium')}>
                          {CAMPOS[campo] ?? campo}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={cn(
                            'break-words',
                            esAlta ? 'text-muted' : cambio ? 'text-danger line-through' : 'text-muted',
                          )}
                        >
                          {esAlta ? '—' : mostrar(campo, viejo?.[campo])}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={cn(
                            'break-words',
                            esBaja ? 'text-muted' : cambio ? 'font-medium text-success' : 'text-muted',
                          )}
                        >
                          {esBaja ? '—' : mostrar(campo, nuevo?.[campo])}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {todas.length > cambiados.length && (
          <button
            type="button"
            onClick={() => setVerTodo((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <ArrowRight className={cn('size-3.5 transition-transform', verTodo && 'rotate-90')} aria-hidden />
            {verTodo
              ? `Ver solo lo que cambió (${cambiados.length})`
              : `Ver todos los campos (${todas.length})`}
          </button>
        )}
      </div>
    </Dialog>
  );
}
