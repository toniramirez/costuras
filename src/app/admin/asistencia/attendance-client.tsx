'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/data-list';
import { FilterSelect } from '@/components/ui/filters';
import { EmptyState } from '@/components/ui/states';
import { abrirClase, marcarAsistencia, marcarTodosPresentes } from '@/app/actions/attendance';
import type { FilaAsistencia, GrupoBasico, HojaAsistencia } from '@/lib/services/attendance';
import { ESTADO_ASISTENCIA } from '@/lib/labels';
import { DIAS_SEMANA, formatDate, formatSchedule, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  DialogRegistro,
  FechaUrl,
  SelectorEstado,
  diaSemanaDe,
  sumarDias,
  type EstadoAsistencia,
} from './attendance-ui';

type Marca = { status: EstadoAsistencia; observation: string | null };

/**
 * Asistencia: elegir grupo y fecha, y marcar.
 *
 * Pensada para el celular, parada frente a la clase. El grupo y la fecha viven
 * en la URL; la planilla se monta con `key` = grupo+fecha, así al cambiar de
 * clase las marcas optimistas se descartan solas (sin efectos que sincronicen
 * estado a mano).
 */
export function AttendanceClient({
  grupos,
  hoja,
  fecha,
}: {
  grupos: GrupoBasico[];
  hoja: HojaAsistencia | null;
  fecha: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hoy = todayISO();
  const diaSemana = diaSemanaDe(fecha);

  function irA(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(clave, valor);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function hrefGrupo(id: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('grupo', id);
    params.set('fecha', fecha);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-4">
      <PageHeader
        title="Asistencia"
        description="Elegí el grupo y la fecha. Un toque marca y guarda."
        action={
          <Link
            href="/admin/asistencia/historial"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            <History className="size-4" aria-hidden />
            Historial
          </Link>
        }
      />

      {/* ── Grupo + fecha ──────────────────────────────────────────────────── */}
      <Card className="space-y-2.5 p-3">
        <FilterSelect
          param="grupo"
          label="Grupo"
          allLabel="Elegí un grupo…"
          className="w-full"
          options={grupos.map((g) => ({ value: g.id, label: g.name }))}
        />

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            aria-label="Día anterior"
            className="shrink-0 px-3"
            onClick={() => irA('fecha', sumarDias(fecha, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>

          <FechaUrl
            param="fecha"
            label="Fecha de la clase"
            valor={fecha}
            className="min-w-0 flex-1"
          />

          <Button
            variant="outline"
            aria-label="Día siguiente"
            className="shrink-0 px-3"
            onClick={() => irA('fecha', sumarDias(fecha, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>

          {fecha !== hoy && (
            <Button variant="ghost" className="shrink-0" onClick={() => irA('fecha', hoy)}>
              Hoy
            </Button>
          )}
        </div>

        <p className="flex items-center gap-1.5 px-0.5 text-xs text-muted">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          {DIAS_SEMANA[diaSemana]} {formatDate(fecha)}
          {fecha === hoy && ' · hoy'}
        </p>
      </Card>

      {/* ── Sin grupo elegido: las clases del día ──────────────────────────── */}
      {!hoja &&
        (grupos.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Todavía no hay grupos activos"
            description="Creá un grupo y asignale alumnos para poder tomar asistencia."
          />
        ) : (
          <SelectorGrupo grupos={grupos} diaSemana={diaSemana} hrefGrupo={hrefGrupo} />
        ))}

      {/* La key remonta la planilla al cambiar de clase: las marcas optimistas
          de la clase anterior no tienen por qué sobrevivir. */}
      {hoja && <Planilla key={`${hoja.grupo.id}|${hoja.fecha}`} hoja={hoja} diaSemana={diaSemana} />}
    </div>
  );
}

/**
 * La planilla en sí. Es dueña de las marcas optimistas: el toque se pinta al
 * instante y, si el servidor falla, vuelve atrás y avisa. No hay toast de éxito
 * por cada toque (el botón pintado ES el aviso; quince toasts seguidos serían
 * insoportables), pero sí en las acciones de a muchos y en los diálogos.
 */
function Planilla({ hoja, diaSemana }: { hoja: HojaAsistencia; diaSemana: number }) {
  const router = useRouter();

  const [local, setLocal] = useState<Record<string, Marca>>({});
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});
  const [enDialogo, setEnDialogo] = useState<FilaAsistencia | null>(null);
  const [marcandoTodos, setMarcandoTodos] = useState(false);

  const grupoId = hoja.grupo.id;
  const fecha = hoja.fecha;
  const sesionId = hoja.session_id;

  // Al abrir la planilla, la clase queda creada aunque todavía no se marque a
  // nadie. El unique (grupo, fecha) de la base la hace idempotente.
  useEffect(() => {
    if (sesionId) return;
    void abrirClase({ group_id: grupoId, session_date: fecha });
  }, [grupoId, fecha, sesionId]);

  const estadoDe = (f: FilaAsistencia): EstadoAsistencia | null =>
    local[f.student_id]?.status ?? f.status;
  const observacionDe = (f: FilaAsistencia): string | null =>
    local[f.student_id]?.observation ?? f.observation;

  /** Alumnos del grupo (no las visitas) que todavía no tienen registro. */
  const sinMarcar = useMemo(
    () =>
      hoja.filas
        .filter((f) => !f.es_visita && (local[f.student_id]?.status ?? f.status) === null)
        .map((f) => f.student_id),
    [hoja.filas, local],
  );

  const marcados = useMemo(
    () => hoja.filas.filter((f) => (local[f.student_id]?.status ?? f.status) !== null).length,
    [hoja.filas, local],
  );

  async function marcar(fila: FilaAsistencia, status: EstadoAsistencia) {
    if (guardando[fila.student_id]) return;

    const previo = local[fila.student_id];
    const observacion = previo?.observation ?? fila.observation;

    setLocal((m) => ({ ...m, [fila.student_id]: { status, observation: observacion } }));
    setGuardando((g) => ({ ...g, [fila.student_id]: true }));

    const r = await marcarAsistencia({
      group_id: grupoId,
      session_date: fecha,
      student_id: fila.student_id,
      status,
      observation: observacion ?? undefined,
      // Si viene a recuperar, la server action delega en use_recovery_credit:
      // es la única que puede consumir el crédito (y no deja usarlo dos veces).
      recovery_credit_id: fila.recovery_credit_id,
    });

    setGuardando((g) => ({ ...g, [fila.student_id]: false }));

    if (!r.ok) {
      setLocal((m) => {
        const copia = { ...m };
        if (previo) copia[fila.student_id] = previo;
        else delete copia[fila.student_id];
        return copia;
      });
      toast.error(r.error);
      return;
    }

    router.refresh();
  }

  async function todosPresentes() {
    if (sinMarcar.length === 0) return;
    const ids = sinMarcar;

    setMarcandoTodos(true);
    setLocal((m) => {
      const copia = { ...m };
      for (const id of ids) {
        const fila = hoja.filas.find((f) => f.student_id === id);
        copia[id] = { status: 'presente', observation: fila?.observation ?? null };
      }
      return copia;
    });

    const r = await marcarTodosPresentes({
      group_id: grupoId,
      session_date: fecha,
      student_ids: ids,
    });

    setMarcandoTodos(false);

    if (!r.ok) {
      setLocal((m) => {
        const copia = { ...m };
        for (const id of ids) delete copia[id];
        return copia;
      });
      toast.error(r.error);
      return;
    }

    toast.success(r.message);
    router.refresh();
  }

  async function guardarDesdeDialogo(estado: EstadoAsistencia, observacion: string) {
    const fila = enDialogo;
    if (!fila) return;

    setGuardando((g) => ({ ...g, [fila.student_id]: true }));

    const r = await marcarAsistencia({
      group_id: grupoId,
      session_date: fecha,
      student_id: fila.student_id,
      status: estado,
      observation: observacion,
      recovery_credit_id: fila.recovery_credit_id,
    });

    setGuardando((g) => ({ ...g, [fila.student_id]: false }));

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    setLocal((m) => ({ ...m, [fila.student_id]: { status: estado, observation: observacion } }));
    setEnDialogo(null);
    toast.success(r.message);
    router.refresh();
  }

  const propios = hoja.filas.filter((f) => !f.es_visita);
  const visitas = hoja.filas.filter((f) => f.es_visita);

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">{hoja.grupo.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {formatSchedule(hoja.grupo.weekday, hoja.grupo.start_time, hoja.grupo.end_time)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-medium tabular-nums text-muted">
            {marcados} de {hoja.filas.length} marcados
          </p>
        </div>

        {hoja.grupo.weekday !== diaSemana && (
          <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Ojo: este grupo se dicta los {DIAS_SEMANA[hoja.grupo.weekday].toLowerCase()} y la fecha
            elegida cae {DIAS_SEMANA[diaSemana].toLowerCase()}.
          </p>
        )}

        {sinMarcar.length > 0 && (
          <Button
            fullWidth
            size="lg"
            className="mt-3"
            onClick={todosPresentes}
            loading={marcandoTodos}
          >
            <CheckCheck className="size-5" aria-hidden />
            Marcar todos presentes ({sinMarcar.length})
          </Button>
        )}
      </Card>

      {hoja.filas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="Este grupo no tiene alumnos activos"
          description="Solo aparecen los alumnos activos: los pausados y los dados de baja quedan fuera de la planilla."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {propios.map((f) => (
              <FilaAlumno
                key={f.student_id}
                fila={f}
                estado={estadoDe(f)}
                observacion={observacionDe(f)}
                guardando={!!guardando[f.student_id]}
                onMarcar={(s) => marcar(f, s)}
                onObservacion={() => setEnDialogo(f)}
              />
            ))}
          </ul>

          {visitas.length > 0 && (
            <section className="mt-4 space-y-2">
              <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <RotateCcw className="size-3.5" aria-hidden />
                Vienen a recuperar ({visitas.length})
              </h2>
              <p className="px-1 text-xs text-muted">
                Marcá <strong>Recuperación</strong> para consumir el crédito. Si no vino, marcala
                como ausente: el crédito queda reservado.
              </p>

              <ul className="space-y-2">
                {visitas.map((f) => (
                  <FilaAlumno
                    key={f.student_id}
                    fila={f}
                    estado={estadoDe(f)}
                    observacion={observacionDe(f)}
                    guardando={!!guardando[f.student_id]}
                    onMarcar={(s) => marcar(f, s)}
                    onObservacion={() => setEnDialogo(f)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {enDialogo && (
        <DialogRegistro
          nombre={enDialogo.nombre}
          estado={estadoDe(enDialogo)}
          observacion={observacionDe(enDialogo)}
          onClose={() => setEnDialogo(null)}
          onSave={guardarDesdeDialogo}
        />
      )}
    </>
  );
}

/** Una fila de la planilla: nombre, estado y los cinco botones. */
function FilaAlumno({
  fila,
  estado,
  observacion,
  guardando,
  onMarcar,
  onObservacion,
}: {
  fila: FilaAsistencia;
  estado: EstadoAsistencia | null;
  observacion: string | null;
  guardando: boolean;
  onMarcar: (estado: EstadoAsistencia) => void;
  onObservacion: () => void;
}) {
  return (
    <li
      className={cn(
        'rounded-card border bg-surface p-3 transition-opacity',
        fila.es_visita ? 'border-brand/30' : 'border-line',
        guardando && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{fila.nombre}</p>

          {fila.es_visita && (
            <p className="mt-0.5 truncate text-xs text-brand">
              Recuperación{fila.grupo_origen ? ` · viene de ${fila.grupo_origen}` : ''}
            </p>
          )}

          {observacion && <p className="mt-1 line-clamp-2 text-xs text-muted">{observacion}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {guardando ? (
            <Loader2 className="size-4 animate-spin text-muted" aria-label="Guardando" />
          ) : (
            estado && <StatusBadge value={estado} map={ESTADO_ASISTENCIA} />
          )}

          <button
            type="button"
            onClick={onObservacion}
            aria-label={`Observación de ${fila.nombre}`}
            className="flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-line/40 hover:text-ink"
          >
            <MessageSquare className={cn('size-4', observacion && 'text-brand')} aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-2.5">
        <SelectorEstado valor={estado} onSelect={onMarcar} disabled={guardando} />
      </div>
    </li>
  );
}

/** Sin grupo elegido: primero las clases del día, después el resto. */
function SelectorGrupo({
  grupos,
  diaSemana,
  hrefGrupo,
}: {
  grupos: GrupoBasico[];
  diaSemana: number;
  hrefGrupo: (id: string) => string;
}) {
  const delDia = grupos.filter((g) => g.weekday === diaSemana);
  const otros = grupos.filter((g) => g.weekday !== diaSemana);

  const tarjeta = (g: GrupoBasico, destacada: boolean) => (
    <li key={g.id}>
      <Link
        href={hrefGrupo(g.id)}
        className={cn(
          'flex min-h-16 flex-col justify-center rounded-card border bg-surface px-4 py-3 transition-colors',
          destacada
            ? 'border-brand/40 hover:border-brand hover:bg-brand/5'
            : 'border-line hover:bg-canvas',
        )}
      >
        <span className="truncate text-sm font-semibold text-ink">{g.name}</span>
        <span className="mt-0.5 truncate text-xs text-muted">
          {formatSchedule(g.weekday, g.start_time, g.end_time)}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Clases de este {DIAS_SEMANA[diaSemana].toLowerCase()}
        </h2>

        {delDia.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
            Ningún grupo se dicta este día. Igual podés elegir uno para cargar una recuperación o
            una clase suelta.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">{delDia.map((g) => tarjeta(g, true))}</ul>
        )}
      </section>

      {otros.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Otros grupos
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">{otros.map((g) => tarjeta(g, false))}</ul>
        </section>
      )}
    </div>
  );
}
