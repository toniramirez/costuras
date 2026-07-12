'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Pencil, Plus, Power, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { esquemaGrupo, type DatosGrupo } from '@/lib/validations/groups';
import { alternarGrupo, eliminarGrupo, guardarGrupo } from '@/app/actions/groups';
import type { GrupoConOcupacion } from '@/lib/services/groups';
import { DIAS_SEMANA, formatSchedule } from '@/lib/format';

type Plan = { id: string; name: string; price_cents: number };

const OPCIONES_DIA = DIAS_SEMANA.map((label, value) => ({ value: String(value), label }));

export function GroupsClient({ grupos, planes }: { grupos: GrupoConOcupacion[]; planes: Plan[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<GrupoConOcupacion | null | undefined>(undefined); // undefined = cerrado
  const [aEliminar, setAEliminar] = useState<GrupoConOcupacion | null>(null);

  const columnas: ReadonlyArray<Column<GrupoConOcupacion>> = [
    {
      header: 'Grupo',
      primary: true,
      render: (g) => (
        <div>
          <span>{g.name}</span>
          {g.plans && <p className="text-xs font-normal text-muted">{g.plans.name}</p>}
        </div>
      ),
    },
    {
      header: 'Horario',
      render: (g) => formatSchedule(g.weekday, g.start_time, g.end_time),
    },
    {
      header: 'Ocupación',
      render: (g) => <Ocupacion grupo={g} />,
    },
    {
      header: 'Estado',
      trailing: true,
      render: (g) =>
        g.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>,
    },
  ];

  async function cambiarEstado(grupo: GrupoConOcupacion) {
    const r = await alternarGrupo(grupo.id, !grupo.is_active);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarGrupo(aEliminar.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Grupos"
        description="Cada grupo es un día y un horario fijo. El cupo ocupado se calcula solo: cuenta alumnos activos y pendientes."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nuevo grupo
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar grupo…" />
        <FilterSelect param="dia" label="Día" allLabel="Todos los días" options={OPCIONES_DIA} />
        <FilterSelect
          param="activo"
          label="Estado"
          allLabel="Todos"
          options={[
            { value: 'si', label: 'Activos' },
            { value: 'no', label: 'Inactivos' },
          ]}
        />
      </FiltersBar>

      {grupos.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-5" />}
          title="Todavía no hay grupos"
          description="Creá el primero (por ejemplo, «Martes tarde») para poder asignarle alumnos."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo grupo
            </Button>
          }
        />
      ) : (
        <DataList
          items={grupos}
          columns={columnas}
          keyOf={(g) => g.id}
          actions={(g) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditando(g)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cambiarEstado(g)}>
                <Power className="size-3.5" aria-hidden />
                {g.is_active ? 'Desactivar' : 'Activar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAEliminar(g)} aria-label="Eliminar grupo">
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </>
          )}
        />
      )}

      {editando !== undefined && (
        <GroupForm grupo={editando} planes={planes} onClose={() => setEditando(undefined)} />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar grupo"
        description={`Vas a eliminar «${aEliminar?.name}». Si tiene alumnos, historial o clases registradas, el sistema no lo va a borrar: te va a sugerir desactivarlo.`}
      />
    </div>
  );
}

/** Cupo ocupado sobre el total. Sale de la vista `group_occupancy`, no se guarda. */
function Ocupacion({ grupo }: { grupo: GrupoConOcupacion }) {
  const { current_students: actuales, capacity: cupo, is_full: completo } = grupo.ocupacion;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Users className="size-3.5 text-muted" aria-hidden />
        {actuales}
        {cupo > 0 && <span className="text-muted">/{cupo}</span>}
      </span>
      {completo && <Badge tone="warning">Completo</Badge>}
      {cupo === 0 && <span className="text-xs text-muted">sin cupo definido</span>}
    </span>
  );
}

function GroupForm({
  grupo,
  planes,
  onClose,
}: {
  grupo: GrupoConOcupacion | null;
  planes: Plan[];
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosGrupo>({
    resolver: zodResolver(esquemaGrupo),
    defaultValues: grupo
      ? {
          name: grupo.name,
          weekday: grupo.weekday,
          // La base devuelve "15:00:00"; el <input type="time"> trabaja con "15:00".
          start_time: grupo.start_time.slice(0, 5),
          end_time: grupo.end_time.slice(0, 5),
          capacity: grupo.capacity,
          plan_id: grupo.plan_id ?? '',
          is_active: grupo.is_active,
          notes: grupo.notes ?? '',
        }
      : {
          name: '',
          weekday: 1,
          start_time: '15:00',
          end_time: '17:00',
          capacity: 8,
          plan_id: '',
          is_active: true,
          notes: '',
        },
  });

  async function onSubmit(datos: DatosGrupo) {
    const r = await guardarGrupo(grupo?.id ?? null, datos);
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
      title={grupo ? 'Editar grupo' : 'Nuevo grupo'}
      description="Un grupo es una franja semanal fija. Si el mismo grupo cursa dos días, creá dos grupos."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="grupo-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="grupo-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Martes tarde"
          required
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />

        <Select
          label="Día de la semana"
          required
          error={errors.weekday?.message}
          // valueAsNumber: RHF entrega un número, no un string. Es lo que hace
          // que z.number() encaje sin necesidad de z.coerce.
          {...register('weekday', { valueAsNumber: true })}
        >
          {OPCIONES_DIA.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Hora de inicio"
            type="time"
            required
            error={errors.start_time?.message}
            {...register('start_time')}
          />
          <Input
            label="Hora de fin"
            type="time"
            required
            error={errors.end_time?.message}
            {...register('end_time')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cupo"
            type="number"
            min={0}
            required
            hint="0 = sin límite"
            error={errors.capacity?.message}
            {...register('capacity', { valueAsNumber: true })}
          />
          <Select label="Modalidad" error={errors.plan_id?.message} {...register('plan_id')}>
            <option value="">Sin modalidad</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Observaciones"
          rows={2}
          placeholder="Grupo de principiantes"
          error={errors.notes?.message}
          {...register('notes')}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
            {...register('is_active')}
          />
          Grupo activo
        </label>
      </form>
    </Dialog>
  );
}
