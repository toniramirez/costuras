-- =============================================================================
-- Costura AP · Migración 0001 · Extensiones, tipos (enums) y funciones helper
-- -----------------------------------------------------------------------------
-- Base para una academia de costura de un solo establecimiento (single-tenant).
-- Convenciones del proyecto:
--   * IDs: uuid (gen_random_uuid()).
--   * Dinero: SIEMPRE bigint en centavos de ARS (nunca float/numeric con decimales
--     de punto flotante). Sufijo _cents en las columnas.
--   * Timestamps: timestamptz. created_at / updated_at en todas las tablas.
--   * Borrado lógico (archived_at) donde hay historial que preservar.
--   * Zona horaria de negocio: America/Argentina/Cordoba (se maneja en la app;
--     en la base guardamos timestamptz en UTC y fechas 'date' para períodos).
-- =============================================================================

-- Extensiones ----------------------------------------------------------------
-- gen_random_uuid() es parte del núcleo desde PostgreSQL 13: no hace falta pgcrypto.
create extension if not exists citext;     -- emails case-insensitive

-- =============================================================================
-- Tipos enumerados
-- =============================================================================

-- Roles de la aplicación. 'profesor' queda preparado para el futuro.
do $$ begin
  create type public.app_role as enum ('admin', 'profesor', 'alumno');
exception when duplicate_object then null; end $$;

-- Estado del alumno.
do $$ begin
  create type public.student_status as enum ('pendiente', 'activo', 'pausado', 'baja');
exception when duplicate_object then null; end $$;

-- Frecuencia de una modalidad/plan.
do $$ begin
  create type public.plan_frequency as enum ('semanal', 'quincenal', 'mensual', 'unica', 'personalizada');
exception when duplicate_object then null; end $$;

-- Estado de una cuota mensual (y reutilizado para matrículas donde aplica).
do $$ begin
  create type public.fee_status as enum (
    'pendiente',              -- emitida, sin pagar
    'comprobante_pendiente',  -- el alumno subió comprobante, falta aprobar
    'pagada',
    'vencida',
    'anulada',
    'bonificada'
  );
exception when duplicate_object then null; end $$;

-- Estado de un comprobante de transferencia.
do $$ begin
  create type public.proof_status as enum ('pendiente', 'aprobado', 'rechazado');
exception when duplicate_object then null; end $$;

-- Estado de un pago (money received).
do $$ begin
  create type public.payment_status as enum ('pendiente', 'confirmado', 'anulado', 'rechazado');
exception when duplicate_object then null; end $$;

-- Modo de cobro del primer mes al inscribir (ingreso a mitad de mes).
do $$ begin
  create type public.charge_mode as enum ('mes_completo', 'proporcional', 'manual', 'mes_siguiente');
exception when duplicate_object then null; end $$;

-- Tipo de caja.
do $$ begin
  create type public.cash_account_type as enum ('efectivo', 'banco', 'billetera_virtual', 'tarjetas', 'otra');
exception when duplicate_object then null; end $$;

-- Tipo de categoría financiera.
do $$ begin
  create type public.category_kind as enum ('ingreso', 'gasto');
exception when duplicate_object then null; end $$;

-- Tipo de movimiento de caja.
do $$ begin
  create type public.movement_type as enum ('ingreso', 'gasto', 'ajuste');
exception when duplicate_object then null; end $$;

-- Estado de asistencia.
do $$ begin
  create type public.attendance_status as enum (
    'presente',
    'ausente_justificada',
    'ausente_sin_justificar',
    'recuperacion',
    'cancelada_academia'
  );
exception when duplicate_object then null; end $$;

-- Estado de un crédito de recuperación.
do $$ begin
  create type public.recovery_status as enum ('disponible', 'reservada', 'utilizada', 'vencida', 'cancelada');
exception when duplicate_object then null; end $$;

-- Estado de un proyecto del alumno.
do $$ begin
  create type public.project_status as enum ('idea', 'en_proceso', 'pausado', 'terminado', 'archivado');
exception when duplicate_object then null; end $$;

-- Dificultad de un proyecto.
do $$ begin
  create type public.project_difficulty as enum ('inicial', 'intermedio', 'avanzado', 'personalizado');
exception when duplicate_object then null; end $$;

-- Tipo de archivo de proyecto.
do $$ begin
  create type public.project_file_kind as enum ('imagen', 'video', 'documento', 'molde', 'otro');
exception when duplicate_object then null; end $$;

-- Estado de un taller.
do $$ begin
  create type public.workshop_status as enum (
    'borrador', 'publicado', 'inscripcion_abierta', 'cupo_completo', 'finalizado', 'cancelado'
  );
exception when duplicate_object then null; end $$;

-- Estado de una inscripción a taller.
do $$ begin
  create type public.workshop_reg_status as enum (
    'pendiente', 'pendiente_pago', 'confirmada', 'lista_espera', 'cancelada', 'asistio', 'no_asistio'
  );
exception when duplicate_object then null; end $$;

-- Prioridad de comunicados / novedades.
do $$ begin
  create type public.priority_level as enum ('baja', 'normal', 'alta', 'urgente');
exception when duplicate_object then null; end $$;

-- Alcance de destinatarios (novedades / comunicados).
do $$ begin
  create type public.recipient_scope as enum ('todos', 'grupo', 'alumno', 'cuota_pendiente', 'taller');
exception when duplicate_object then null; end $$;

-- Estado de publicación (novedades / comunicados).
do $$ begin
  create type public.publish_status as enum ('borrador', 'publicada', 'archivada');
exception when duplicate_object then null; end $$;

-- Audiencia de una notificación interna.
do $$ begin
  create type public.notification_audience as enum ('admin', 'alumno');
exception when duplicate_object then null; end $$;

-- Modo de cobro de la matrícula.
do $$ begin
  create type public.registration_mode as enum ('unica', 'anual');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Funciones utilitarias genéricas
-- =============================================================================

-- Mantiene updated_at al día en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Nota: las funciones helper de autorización (is_admin, current_student_id, …)
-- viven en la migración 0003b (auth_helpers), porque son funciones `language sql`
-- y PostgreSQL valida su cuerpo al crearlas: necesitan que profiles y students
-- ya existan.
