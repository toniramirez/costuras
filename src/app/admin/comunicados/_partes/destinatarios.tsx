'use client';

import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';

import { Field, Select } from '@/components/ui/field';
import { Callout } from '@/components/ui/states';
import { formatSchedule, formatDate } from '@/lib/format';
import type { Enums } from '@/lib/supabase/database.types';
import type { OpcionesDestinatarios } from '@/lib/services/comms';
import { ALCANCE, OPCIONES_ALCANCE } from './comunes';

/**
 * Selector de destinatarios, común a novedades y comunicados.
 *
 * Muestra a CUÁNTOS alumnos les va a llegar, con el mismo criterio que después
 * aplica el servidor al expandir (el servicio manda las listas de ids, no solo un
 * número: así el cartel nunca miente).
 */

export type ValorDestino = {
  scope: Enums<'recipient_scope'>;
  group_id?: string;
  workshop_id?: string;
  student_ids?: string[];
};

export type ErroresDestino = {
  scope?: string;
  group_id?: string;
  workshop_id?: string;
  student_ids?: string;
};

/** Los alumnos que hoy quedarían alcanzados por este alcance. */
export function destinatariosAlcanzados(
  opciones: OpcionesDestinatarios,
  valor: ValorDestino,
): string[] {
  switch (valor.scope) {
    case 'todos':
      return opciones.alumnos.map((a) => a.id);
    case 'grupo':
      return valor.group_id
        ? opciones.alumnos.filter((a) => a.group_id === valor.group_id).map((a) => a.id)
        : [];
    case 'alumno':
      return valor.student_ids ?? [];
    case 'cuota_pendiente':
      return opciones.conCuotaPendiente;
    case 'taller':
      return valor.workshop_id ? (opciones.inscriptosPorTaller[valor.workshop_id] ?? []) : [];
  }
}

export function DestinatariosField({
  opciones,
  valor,
  onChange,
  errores,
  /** Alcance guardado en un borrador: hay que volver a elegir el destino concreto. */
  avisoBorrador,
}: {
  opciones: OpcionesDestinatarios;
  valor: ValorDestino;
  onChange: (valor: ValorDestino) => void;
  errores?: ErroresDestino;
  avisoBorrador?: string | null;
}) {
  const alcanzados = destinatariosAlcanzados(opciones, valor);
  const necesitaElegir =
    (valor.scope === 'grupo' && !valor.group_id) ||
    (valor.scope === 'taller' && !valor.workshop_id) ||
    (valor.scope === 'alumno' && (valor.student_ids?.length ?? 0) === 0);

  return (
    <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-3">
      <Select
        label="Destinatarios"
        required
        error={errores?.scope}
        hint={ALCANCE[valor.scope].hint}
        value={valor.scope}
        onChange={(e) =>
          onChange({
            scope: e.target.value as Enums<'recipient_scope'>,
            group_id: undefined,
            workshop_id: undefined,
            student_ids: [],
          })
        }
      >
        {OPCIONES_ALCANCE.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      {avisoBorrador && (
        <Callout tone="info">
          Este borrador estaba dirigido a <strong>{avisoBorrador}</strong>. Volvé a elegir el destino
          para guardarlo o enviarlo.
        </Callout>
      )}

      {valor.scope === 'grupo' && (
        <Select
          label="Grupo"
          required
          error={errores?.group_id}
          value={valor.group_id ?? ''}
          onChange={(e) => onChange({ ...valor, group_id: e.target.value || undefined })}
        >
          <option value="">Elegí un grupo…</option>
          {opciones.grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {formatSchedule(g.weekday, g.start_time, g.end_time)}
            </option>
          ))}
        </Select>
      )}

      {valor.scope === 'taller' && (
        <Select
          label="Taller"
          required
          error={errores?.workshop_id}
          value={valor.workshop_id ?? ''}
          onChange={(e) => onChange({ ...valor, workshop_id: e.target.value || undefined })}
        >
          <option value="">Elegí un taller…</option>
          {opciones.talleres.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.event_date ? ` · ${formatDate(t.event_date)}` : ''}
            </option>
          ))}
        </Select>
      )}

      {valor.scope === 'alumno' && (
        <SelectorAlumnos
          alumnos={opciones.alumnos}
          seleccionados={valor.student_ids ?? []}
          onChange={(student_ids) => onChange({ ...valor, student_ids })}
          error={errores?.student_ids}
        />
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Users className="size-3.5 shrink-0" aria-hidden />
        {necesitaElegir ? (
          'Elegí el destino para ver a cuántos alumnos le llega.'
        ) : alcanzados.length === 0 ? (
          <span className="font-medium text-danger">
            Hoy no hay ningún alumno que cumpla con este alcance.
          </span>
        ) : (
          <span>
            Le va a llegar a <strong className="text-ink">{alcanzados.length}</strong>{' '}
            {alcanzados.length === 1 ? 'alumno' : 'alumnos'}.
          </span>
        )}
      </p>
    </div>
  );
}

function SelectorAlumnos({
  alumnos,
  seleccionados,
  onChange,
  error,
}: {
  alumnos: OpcionesDestinatarios['alumnos'];
  seleccionados: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return alumnos;
    return alumnos.filter((a) =>
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q),
    );
  }, [alumnos, busqueda]);

  const elegidos = new Set(seleccionados);

  function alternar(id: string) {
    const nuevo = new Set(elegidos);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    onChange(Array.from(nuevo));
  }

  return (
    <Field
      label="Alumnos"
      required
      error={error}
      hint={seleccionados.length > 0 ? `${seleccionados.length} seleccionado(s)` : undefined}
    >
      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface">
        <div className="relative border-b border-line">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar alumno…"
            aria-label="Buscar alumno"
            className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />
        </div>

        <ul className="max-h-48 overflow-y-auto">
          {filtrados.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted">No hay alumnos.</li>
          ) : (
            filtrados.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={elegidos.has(a.id)}
                    onChange={() => alternar(a.id)}
                    className="size-4 rounded border-line-strong text-brand focus:ring-brand/20"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {a.last_name}, {a.first_name}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
    </Field>
  );
}
