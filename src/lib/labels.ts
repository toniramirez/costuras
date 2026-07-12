import type { Enums } from '@/lib/supabase/database.types';

/**
 * Traducción y tono visual de cada estado del dominio.
 *
 * Centralizado a propósito: los mismos textos alimentan tablas, filtros,
 * formularios y notificaciones. Si mañana cambia una etiqueta, cambia acá y en
 * ningún otro lado.
 */
export type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'brand';

type Etiqueta = { label: string; tone: Tone };

export const ESTADO_ALUMNO: Record<Enums<'student_status'>, Etiqueta> = {
  pendiente: { label: 'Pendiente de iniciar', tone: 'info' },
  activo: { label: 'Activo', tone: 'success' },
  pausado: { label: 'Pausado', tone: 'warning' },
  baja: { label: 'Dado de baja', tone: 'neutral' },
};

export const ESTADO_CUOTA: Record<Enums<'fee_status'>, Etiqueta> = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  comprobante_pendiente: { label: 'Comprobante a revisar', tone: 'info' },
  pagada: { label: 'Pagada', tone: 'success' },
  vencida: { label: 'Vencida', tone: 'danger' },
  anulada: { label: 'Anulada', tone: 'neutral' },
  bonificada: { label: 'Bonificada', tone: 'brand' },
};

export const ESTADO_COMPROBANTE: Record<Enums<'proof_status'>, Etiqueta> = {
  pendiente: { label: 'A revisar', tone: 'warning' },
  aprobado: { label: 'Aprobado', tone: 'success' },
  rechazado: { label: 'Rechazado', tone: 'danger' },
};

export const ESTADO_ASISTENCIA: Record<Enums<'attendance_status'>, Etiqueta> = {
  presente: { label: 'Presente', tone: 'success' },
  ausente_justificada: { label: 'Ausente justificada', tone: 'warning' },
  ausente_sin_justificar: { label: 'Ausente sin justificar', tone: 'danger' },
  recuperacion: { label: 'Recuperación', tone: 'brand' },
  cancelada_academia: { label: 'Clase cancelada', tone: 'neutral' },
};

export const ESTADO_RECUPERACION: Record<Enums<'recovery_status'>, Etiqueta> = {
  disponible: { label: 'Disponible', tone: 'success' },
  reservada: { label: 'Reservada', tone: 'info' },
  utilizada: { label: 'Utilizada', tone: 'neutral' },
  vencida: { label: 'Vencida', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};

export const ESTADO_PROYECTO: Record<Enums<'project_status'>, Etiqueta> = {
  idea: { label: 'Idea', tone: 'neutral' },
  en_proceso: { label: 'En proceso', tone: 'info' },
  pausado: { label: 'Pausado', tone: 'warning' },
  terminado: { label: 'Terminado', tone: 'success' },
  archivado: { label: 'Archivado', tone: 'neutral' },
};

export const DIFICULTAD_PROYECTO: Record<Enums<'project_difficulty'>, Etiqueta> = {
  inicial: { label: 'Inicial', tone: 'success' },
  intermedio: { label: 'Intermedio', tone: 'info' },
  avanzado: { label: 'Avanzado', tone: 'warning' },
  personalizado: { label: 'Personalizado', tone: 'brand' },
};

export const ESTADO_TALLER: Record<Enums<'workshop_status'>, Etiqueta> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  publicado: { label: 'Publicado', tone: 'info' },
  inscripcion_abierta: { label: 'Inscripción abierta', tone: 'success' },
  cupo_completo: { label: 'Cupo completo', tone: 'warning' },
  finalizado: { label: 'Finalizado', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

export const ESTADO_INSCRIPCION: Record<Enums<'workshop_reg_status'>, Etiqueta> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  pendiente_pago: { label: 'Pendiente de pago', tone: 'warning' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  lista_espera: { label: 'Lista de espera', tone: 'info' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
  asistio: { label: 'Asistió', tone: 'success' },
  no_asistio: { label: 'No asistió', tone: 'danger' },
};

export const MODO_COBRO: Record<Enums<'charge_mode'>, Etiqueta> = {
  mes_completo: { label: 'Cobrar mes completo', tone: 'neutral' },
  proporcional: { label: 'Cobrar importe proporcional', tone: 'neutral' },
  manual: { label: 'Definir importe manual', tone: 'neutral' },
  mes_siguiente: { label: 'Empezar a cobrar el mes siguiente', tone: 'neutral' },
};

export const FRECUENCIA_PLAN: Record<Enums<'plan_frequency'>, Etiqueta> = {
  semanal: { label: 'Semanal', tone: 'neutral' },
  quincenal: { label: 'Quincenal', tone: 'neutral' },
  mensual: { label: 'Mensual', tone: 'neutral' },
  unica: { label: 'Única', tone: 'neutral' },
  personalizada: { label: 'Personalizada', tone: 'neutral' },
};

export const TIPO_CAJA: Record<Enums<'cash_account_type'>, Etiqueta> = {
  efectivo: { label: 'Efectivo', tone: 'neutral' },
  banco: { label: 'Banco', tone: 'neutral' },
  billetera_virtual: { label: 'Billetera virtual', tone: 'neutral' },
  tarjetas: { label: 'Tarjetas', tone: 'neutral' },
  otra: { label: 'Otra', tone: 'neutral' },
};

export const PRIORIDAD: Record<Enums<'priority_level'>, Etiqueta> = {
  baja: { label: 'Baja', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'info' },
  alta: { label: 'Alta', tone: 'warning' },
  urgente: { label: 'Urgente', tone: 'danger' },
};

/** Convierte un mapa de etiquetas en opciones para un <Select>. */
export function opciones<T extends string>(mapa: Record<T, Etiqueta>): Array<{ value: T; label: string }> {
  return (Object.keys(mapa) as T[]).map((value) => ({ value, label: mapa[value].label }));
}
