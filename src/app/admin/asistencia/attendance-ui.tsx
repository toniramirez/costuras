'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Ban, Check, RotateCcw, ShieldCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Enums } from '@/lib/supabase/database.types';

export type EstadoAsistencia = Enums<'attendance_status'>;

/**
 * Los cinco estados, con etiqueta corta: esto se usa en el celular, parada
 * frente a la clase, y tienen que entrar cinco botones en el ancho del pulgar.
 * La etiqueta larga vive en `ESTADO_ASISTENCIA` (lib/labels) y se usa en las
 * insignias y en los filtros.
 */
export const OPCIONES_ASISTENCIA: ReadonlyArray<{
  value: EstadoAsistencia;
  corto: string;
  icon: React.ComponentType<{ className?: string }>;
  activo: string;
}> = [
  { value: 'presente', corto: 'Presente', icon: Check, activo: 'border-success bg-success text-white' },
  { value: 'ausente_justificada', corto: 'Justif.', icon: ShieldCheck, activo: 'border-warning bg-warning text-white' },
  { value: 'ausente_sin_justificar', corto: 'Falta', icon: X, activo: 'border-danger bg-danger text-white' },
  { value: 'recuperacion', corto: 'Recup.', icon: RotateCcw, activo: 'border-brand bg-brand text-white' },
  { value: 'cancelada_academia', corto: 'Sin clase', icon: Ban, activo: 'border-secondary bg-secondary text-white' },
];

/**
 * Los cinco botones. Un toque = marcado (el guardado es inmediato).
 * Alto mínimo 56px: es el objetivo táctil más usado de todo el sistema.
 */
export function SelectorEstado({
  valor,
  onSelect,
  disabled,
}: {
  valor: EstadoAsistencia | null;
  onSelect: (estado: EstadoAsistencia) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {OPCIONES_ASISTENCIA.map((o) => {
        const Icono = o.icon;
        const activo = valor === o.value;

        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            disabled={disabled}
            aria-pressed={activo}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2',
              'text-[10px] font-medium leading-none transition-colors',
              'disabled:pointer-events-none disabled:opacity-50',
              activo
                ? o.activo
                : 'border-line-strong bg-surface text-muted hover:bg-canvas active:bg-line/40',
            )}
          >
            <Icono className="size-5 shrink-0" />
            <span className="w-full truncate text-center">{o.corto}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Estado + observación de un alumno. Se usa para agregar la observación desde la
 * planilla y para editar un registro ya hecho desde el historial.
 */
export function DialogRegistro({
  nombre,
  estado,
  observacion,
  onClose,
  onSave,
}: {
  nombre: string;
  estado: EstadoAsistencia | null;
  observacion: string | null;
  onClose: () => void;
  onSave: (estado: EstadoAsistencia, observacion: string) => Promise<void>;
}) {
  const [elegido, setElegido] = useState<EstadoAsistencia | null>(estado);
  const [texto, setTexto] = useState(observacion ?? '');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!elegido) return;
    setGuardando(true);
    try {
      await onSave(elegido, texto.trim());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={nombre}
      description="Estado de la clase y observación."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando} disabled={!elegido}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorEstado valor={elegido} onSelect={setElegido} disabled={guardando} />

        <Textarea
          label="Observación"
          rows={3}
          autoFocus
          placeholder="Avisó que no venía por trabajo."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
        />
      </div>
    </Dialog>
  );
}

/**
 * Campo de fecha que escribe en la URL (patrón del sistema: los filtros viven en
 * los searchParams, no en estado local). No toca el resto de los parámetros.
 *
 * El valor que se muestra es el de la URL, pero pasar por el servidor tarda un
 * instante: con `useOptimistic` el campo muestra la fecha nueva apenas se elige
 * y vuelve sola al valor real cuando la navegación termina. Sin efectos que
 * sincronicen estado: si la URL cambia por fuera (botón atrás, "Hoy"), el valor
 * base cambia y el campo lo sigue.
 */
export function FechaUrl({
  param,
  label,
  valor,
  className,
}: {
  param: string;
  label: string;
  valor?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enUrl = valor ?? searchParams.get(param) ?? '';

  const [, startTransition] = useTransition();
  const [fecha, verFecha] = useOptimistic(enUrl);

  function aplicar(nueva: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nueva) params.set(param, nueva);
    else params.delete(param);
    params.delete('pagina');

    startTransition(() => {
      verFecha(nueva);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <input
      type="date"
      value={fecha}
      onChange={(e) => aplicar(e.target.value)}
      aria-label={label}
      className={cn(
        'h-11 rounded-xl border bg-surface px-3 text-sm text-ink',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
        fecha ? 'border-brand bg-brand/5 font-medium' : 'border-line-strong',
        className,
      )}
    />
  );
}

/** Día de la semana de una fecha "YYYY-MM-DD" (0 = domingo, igual que la base). */
export function diaSemanaDe(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  // Construido a mano: `new Date("2026-05-10")` se lee como medianoche UTC y en
  // Argentina caería el día anterior.
  return new Date(anio, mes - 1, dia).getDay();
}

/** Corre una fecha "YYYY-MM-DD" N días. */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
