import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  ReceiptText,
  RefreshCcw,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

import type { Tone } from '@/lib/labels';

/**
 * Aspecto de cada tipo de notificación.
 *
 * Las notificaciones las genera SOLA la base (triggers y funciones: comprobante
 * subido, comprobante aprobado/rechazado, cuota generada, pago registrado,
 * recuperación disponible, cupo completo, inscripción a taller…). Acá solo se
 * decide cómo se ven. `type` es texto libre en la base: si mañana aparece uno
 * nuevo, cae en el aspecto por defecto y la campanita lo muestra igual.
 */

type Aspecto = {
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
};

const POR_DEFECTO: Aspecto = { icon: Bell, tone: 'neutral' };

const ASPECTOS: Record<string, Aspecto> = {
  comprobante_subido: { icon: ReceiptText, tone: 'info' },
  comprobante_aprobado: { icon: CheckCircle2, tone: 'success' },
  comprobante_rechazado: { icon: XCircle, tone: 'danger' },
  cuota_generada: { icon: FileText, tone: 'info' },
  cuota_pendiente: { icon: Clock, tone: 'warning' },
  cuota_por_vencer: { icon: Clock, tone: 'warning' },
  cuota_vencida: { icon: AlertTriangle, tone: 'danger' },
  pago_registrado: { icon: Wallet, tone: 'success' },
  recuperacion_aprobada: { icon: RefreshCcw, tone: 'success' },
  recuperacion_por_vencer: { icon: RefreshCcw, tone: 'warning' },
  inscripcion_taller: { icon: UserPlus, tone: 'info' },
  taller_cupo_completo: { icon: Users, tone: 'warning' },
  grupo_cupo_completo: { icon: Users, tone: 'warning' },
};

export function aspectoDe(tipo: string): Aspecto {
  return ASPECTOS[tipo] ?? POR_DEFECTO;
}

/** Fondo y color del ícono, por tono. */
export const CLASES_TONO: Record<Tone, string> = {
  neutral: 'bg-line/60 text-muted',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand/10 text-brand',
};
