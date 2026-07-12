'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Pencil,
  RotateCcw,
  Scale,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { Callout, EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { centsToPesos, formatDate, formatMoney, todayISO } from '@/lib/format';
import { esquemaMovimiento, type DatosMovimiento } from '@/lib/validations/movements';
import { eliminarMovimiento, guardarMovimiento } from '@/app/actions/movements';
import { anularPago } from '@/app/actions/fees';
import type { FilaMovimiento, TotalesMovimientos } from '@/lib/services/movements';
import { AnularPagoDialog } from '../cuotas/pago-dialogs';
import { TabsMovimientos } from './tabs';

type Categoria = { id: string; name: string; kind: 'ingreso' | 'gasto' };
type Opcion = { id: string; name: string };
type Alumno = { id: string; first_name: string; last_name: string };

/** Los gastos restan; el ajuste ya viene con signo. */
const importeConSigno = (m: FilaMovimiento): number =>
  m.type === 'gasto' ? -Number(m.amount_cents) : Number(m.amount_cents);

export function MovimientosClient({
  movimientos,
  total,
  totales,
  categorias,
  cajas,
  medios,
  alumnos,
  talleres,
}: {
  movimientos: FilaMovimiento[];
  total: number;
  totales: TotalesMovimientos;
  categorias: Categoria[];
  cajas: Opcion[];
  medios: Opcion[];
  alumnos: Alumno[];
  talleres: Opcion[];
}) {
  const router = useRouter();

  const [editando, setEditando] = useState<
    { movimiento: FilaMovimiento | null; tipo: 'ingreso' | 'gasto' } | undefined
  >(undefined);
  const [aEliminar, setAEliminar] = useState<FilaMovimiento | null>(null);
  const [aAnularPago, setAAnularPago] = useState<FilaMovimiento | null>(null);

  const faltaConfig = cajas.length === 0 || medios.length === 0 || categorias.length === 0;

  const columnas: ReadonlyArray<Column<FilaMovimiento>> = [
    {
      header: 'Concepto',
      primary: true,
      render: (m) => (
        <div>
          <span>{m.description || 'Sin descripción'}</span>
          <p className="text-xs font-normal text-muted">
            {m.financial_categories?.name ?? 'Sin categoría'}
            {m.students && ` · ${m.students.first_name} ${m.students.last_name}`}
          </p>
        </div>
      ),
    },
    {
      header: 'Fecha',
      render: (m) => formatDate(m.movement_date),
    },
    {
      header: 'Caja',
      render: (m) => m.cash_accounts?.name ?? '—',
    },
    {
      header: 'Medio',
      desktopOnly: true,
      render: (m) => <span className="text-muted">{m.payment_methods?.name ?? '—'}</span>,
    },
    {
      header: 'Origen',
      desktopOnly: true,
      render: (m) =>
        m.payment_id ? (
          <Badge tone="info">Pago</Badge>
        ) : m.is_reversal ? (
          <Badge tone="neutral">Reverso</Badge>
        ) : m.type === 'ajuste' ? (
          <Badge tone="warning">Ajuste</Badge>
        ) : (
          <span className="text-muted">Manual</span>
        ),
    },
    {
      header: 'Importe',
      trailing: true,
      render: (m) => {
        const importe = importeConSigno(m);
        return (
          <span
            className={`font-semibold tabular-nums ${importe < 0 ? 'text-danger' : 'text-success'}`}
          >
            {formatMoney(importe)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Ingresos y gastos"
        description="El libro mayor de la academia. Lo que nace de un cobro no se edita acá: se corrige anulando el pago."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={faltaConfig}
              onClick={() => setEditando({ movimiento: null, tipo: 'gasto' })}
            >
              <ArrowDownLeft className="size-4" aria-hidden />
              Nuevo gasto
            </Button>
            <Button
              disabled={faltaConfig}
              onClick={() => setEditando({ movimiento: null, tipo: 'ingreso' })}
            >
              <ArrowUpRight className="size-4" aria-hidden />
              Nuevo ingreso
            </Button>
          </div>
        }
      />

      <TabsMovimientos />

      {faltaConfig && (
        <Callout tone="warning" title="Falta configurar algo">
          Para cargar un movimiento hace falta al menos una caja activa, un medio de pago activo y
          una categoría activa.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Ingresos"
          value={formatMoney(totales.ingresos)}
          tone="success"
          icon={<ArrowUpRight className="size-4" />}
        />
        <StatCard
          label="Gastos"
          value={formatMoney(totales.gastos)}
          tone="danger"
          icon={<ArrowDownLeft className="size-4" />}
        />
        <StatCard
          label="Resultado"
          value={formatMoney(totales.resultado)}
          tone={totales.resultado < 0 ? 'danger' : 'success'}
          hint={
            totales.ajustes !== 0
              ? `Incluye ${formatMoney(totales.ajustes)} de ajustes`
              : 'Ingresos menos gastos'
          }
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      <FiltersBar>
        <RangoFechas />
        <FilterSelect
          param="tipo"
          label="Tipo"
          allLabel="Todos los tipos"
          options={[
            { value: 'ingreso', label: 'Ingresos' },
            { value: 'gasto', label: 'Gastos' },
            { value: 'ajuste', label: 'Ajustes' },
          ]}
        />
        <FilterSelect
          param="categoria"
          label="Categoría"
          allLabel="Todas las categorías"
          options={categorias.map((c) => ({
            value: c.id,
            label: `${c.name} (${c.kind})`,
          }))}
        />
        <FilterSelect
          param="caja"
          label="Caja"
          allLabel="Todas las cajas"
          options={cajas.map((c) => ({ value: c.id, label: c.name }))}
        />
      </FiltersBar>

      {movimientos.length === 0 ? (
        <EmptyState
          icon={<Scale className="size-5" />}
          title="No hay movimientos con esos filtros"
          description="Los cobros de cuotas se asientan solos. Acá cargás lo demás: alquiler, materiales, servicios…"
        />
      ) : (
        <>
          <DataList
            items={movimientos}
            columns={columnas}
            keyOf={(m) => m.id}
            actions={(m) => {
              if (m.payment_id) {
                return (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                      <Lock className="size-3.5" aria-hidden />
                      Lo generó un pago
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setAAnularPago(m)}>
                      <RotateCcw className="size-3.5 text-danger" aria-hidden />
                      Anular el pago
                    </Button>
                  </>
                );
              }

              if (m.is_reversal) {
                return (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Lock className="size-3.5" aria-hidden />
                    Reverso de un pago anulado
                  </span>
                );
              }

              return (
                <>
                  {m.type !== 'ajuste' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditando({
                          movimiento: m,
                          tipo: m.type === 'gasto' ? 'gasto' : 'ingreso',
                        })
                      }
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Editar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setAEliminar(m)}>
                    <Trash2 className="size-3.5 text-danger" aria-hidden />
                  </Button>
                </>
              );
            }}
          />
          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <MovimientoForm
          movimiento={editando.movimiento}
          tipoInicial={editando.tipo}
          categorias={categorias}
          cajas={cajas}
          medios={medios}
          alumnos={alumnos}
          talleres={talleres}
          onClose={() => setEditando(undefined)}
        />
      )}

      {aAnularPago && aAnularPago.payment_id && (
        <AnularPagoDialog
          alumno={
            aAnularPago.students
              ? `${aAnularPago.students.first_name} ${aAnularPago.students.last_name}`
              : 'Sin alumno'
          }
          concepto={aAnularPago.description || 'Cobro'}
          importeCents={Number(aAnularPago.amount_cents)}
          onClose={() => setAAnularPago(null)}
          onConfirm={(datos) => anularPago(aAnularPago.payment_id!, datos)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (!aEliminar) return;
          const r = await eliminarMovimiento(aEliminar.id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
          router.refresh();
        }}
        title="Eliminar el movimiento"
        description={`Vas a borrar «${aEliminar?.description ?? 'este movimiento'}» de ${formatMoney(
          aEliminar ? Math.abs(Number(aEliminar.amount_cents)) : 0,
        )}. El saldo de la caja se recalcula solo.`}
      />
    </div>
  );
}

/** Rango de fechas, sincronizado con la URL como el resto de los filtros. */
function RangoFechas() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const cambiar = (clave: 'desde' | 'hasta', valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    params.delete('pagina');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clase =
    'h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        aria-label="Desde"
        value={searchParams.get('desde') ?? ''}
        onChange={(e) => cambiar('desde', e.target.value)}
        className={clase}
      />
      <span className="text-sm text-muted">a</span>
      <input
        type="date"
        aria-label="Hasta"
        value={searchParams.get('hasta') ?? ''}
        onChange={(e) => cambiar('hasta', e.target.value)}
        className={clase}
      />
    </div>
  );
}

function MovimientoForm({
  movimiento,
  tipoInicial,
  categorias,
  cajas,
  medios,
  alumnos,
  talleres,
  onClose,
}: {
  movimiento: FilaMovimiento | null;
  tipoInicial: 'ingreso' | 'gasto';
  categorias: Categoria[];
  cajas: Opcion[];
  medios: Opcion[];
  alumnos: Alumno[];
  talleres: Opcion[];
  onClose: () => void;
}) {
  const router = useRouter();

  const tipo = movimiento?.type === 'gasto' || movimiento?.type === 'ingreso'
    ? movimiento.type
    : tipoInicial;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosMovimiento>({
    resolver: zodResolver(esquemaMovimiento),
    defaultValues: movimiento
      ? {
          type: tipo,
          movement_date: movimiento.movement_date,
          category_id: movimiento.category_id ?? '',
          importe: centsToPesos(Number(movimiento.amount_cents)),
          cash_account_id: movimiento.cash_account_id,
          payment_method_id: movimiento.payment_method_id ?? '',
          description: movimiento.description ?? '',
          student_id: movimiento.student_id ?? '',
          workshop_id: movimiento.workshop_id ?? '',
          notes: movimiento.notes ?? '',
        }
      : {
          type: tipoInicial,
          movement_date: todayISO(),
          category_id: categorias.find((c) => c.kind === tipoInicial)?.id ?? '',
          importe: 0,
          cash_account_id: cajas[0]?.id ?? '',
          payment_method_id: medios[0]?.id ?? '',
          description: '',
          student_id: '',
          workshop_id: '',
          notes: '',
        },
  });

  const tipoElegido = useWatch({ control, name: 'type' });
  const categoriasDelTipo = categorias.filter((c) => c.kind === tipoElegido);

  // El campo `type` de RHF ya trae su onChange: lo llamamos y además reseteamos
  // la categoría, porque las de ingreso no sirven para un gasto.
  const registroTipo = register('type');

  async function onSubmit(datos: DatosMovimiento) {
    const r = await guardarMovimiento(movimiento?.id ?? null, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        movimiento
          ? 'Editar movimiento'
          : tipoInicial === 'ingreso'
            ? 'Nuevo ingreso'
            : 'Nuevo gasto'
      }
      description="El importe va en pesos. El signo lo pone el tipo: los gastos restan."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="movimiento-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="movimiento-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            required
            error={errors.type?.message}
            {...registroTipo}
            onChange={(e) => {
              registroTipo.onChange(e);
              const nuevo = e.target.value as 'ingreso' | 'gasto';
              setValue('category_id', categorias.find((c) => c.kind === nuevo)?.id ?? '');
            }}
          >
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
          </Select>

          <Select
            label="Categoría"
            required
            error={errors.category_id?.message}
            {...register('category_id')}
          >
            <option value="">Elegí una…</option>
            {categoriasDelTipo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <MoneyInput
          label="Importe"
          required
          autoFocus
          error={errors.importe?.message}
          {...register('importe', { valueAsNumber: true })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Caja"
            required
            error={errors.cash_account_id?.message}
            {...register('cash_account_id')}
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="Medio de pago"
            required
            error={errors.payment_method_id?.message}
            {...register('payment_method_id')}
          >
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Fecha"
          type="date"
          required
          error={errors.movement_date?.message}
          {...register('movement_date')}
        />

        <Input
          label="Descripción"
          required
          placeholder={tipoElegido === 'gasto' ? 'Alquiler de mayo' : 'Venta de moldes'}
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Alumno" error={errors.student_id?.message} {...register('student_id')}>
            <option value="">Ninguno</option>
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.last_name}, {a.first_name}
              </option>
            ))}
          </Select>

          <Select label="Taller" error={errors.workshop_id?.message} {...register('workshop_id')}>
            <option value="">Ninguno</option>
            {talleres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Notas"
          rows={2}
          placeholder="Observaciones internas"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}
