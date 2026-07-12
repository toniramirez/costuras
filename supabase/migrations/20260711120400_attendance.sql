-- =============================================================================
-- Costura AP · Migración 0005 · Asistencia y recuperaciones
--   class_sessions · attendance · recovery_credits
-- Reglas clave:
--   * Una clase por grupo y fecha (unique).
--   * Una asistencia por alumno y clase (unique).
--   * Un crédito de recuperación no puede usarse dos veces (unique + estados).
-- =============================================================================

do $$ begin
  create type public.class_session_status as enum ('programada', 'realizada', 'cancelada');
exception when duplicate_object then null; end $$;

-- Clases dictadas / programadas ---------------------------------------------
create table if not exists public.class_sessions (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  session_date    date not null,
  start_time      time,
  end_time        time,
  status          public.class_session_status not null default 'programada',
  canceled_reason text,
  notes           text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_class_session unique (group_id, session_date)
);
comment on table public.class_sessions is 'Clase concreta de un grupo en una fecha. Se crea al tomar asistencia.';
create index if not exists idx_class_sessions_date on public.class_sessions (session_date);
create trigger trg_class_sessions_updated_at before update on public.class_sessions
  for each row execute function public.set_updated_at();

-- Asistencia -----------------------------------------------------------------
create table if not exists public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  class_session_id   uuid not null references public.class_sessions (id) on delete cascade,
  student_id         uuid not null references public.students (id) on delete cascade,
  group_id           uuid references public.groups (id) on delete set null,  -- denormalizado
  status             public.attendance_status not null,
  recorded_at        timestamptz not null default now(),
  observation        text,
  recorded_by        uuid references public.profiles (id) on delete set null,
  is_recovery        boolean not null default false,
  recovery_credit_id uuid,   -- FK agregada tras crear recovery_credits
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_attendance unique (class_session_id, student_id)
);
create index if not exists idx_attendance_student on public.attendance (student_id);
create index if not exists idx_attendance_session on public.attendance (class_session_id);
create index if not exists idx_attendance_status on public.attendance (status);
create trigger trg_attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();

-- Créditos de recuperación ---------------------------------------------------
create table if not exists public.recovery_credits (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students (id) on delete cascade,
  origin_attendance_id uuid references public.attendance (id) on delete set null,
  origin_session_id   uuid references public.class_sessions (id) on delete set null,
  reason              text,
  status              public.recovery_status not null default 'disponible',
  issued_at           timestamptz not null default now(),
  expires_at          date not null,
  reserved_group_id   uuid references public.groups (id) on delete set null,
  reserved_date       date,
  used_attendance_id  uuid references public.attendance (id) on delete set null,
  used_at             timestamptz,
  canceled_at         timestamptz,
  cancel_reason       text,
  notes               text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Si está reservada, debe tener grupo y fecha de recuperación.
  constraint recovery_reserved_ck check (
    status <> 'reservada' or (reserved_group_id is not null and reserved_date is not null)
  ),
  -- Si está utilizada, debe apuntar a la asistencia donde se usó.
  constraint recovery_used_ck check (
    status <> 'utilizada' or used_attendance_id is not null
  )
);
comment on table public.recovery_credits is 'Crédito de recuperación por ausencia justificada. Vence según configuración.';
create index if not exists idx_recovery_student on public.recovery_credits (student_id);
create index if not exists idx_recovery_status on public.recovery_credits (status);
create index if not exists idx_recovery_expires on public.recovery_credits (expires_at);

-- Anti doble uso: una asistencia solo puede consumir un crédito.
create unique index if not exists uq_recovery_used_attendance
  on public.recovery_credits (used_attendance_id) where used_attendance_id is not null;

create trigger trg_recovery_credits_updated_at before update on public.recovery_credits
  for each row execute function public.set_updated_at();

alter table public.attendance
  drop constraint if exists attendance_recovery_credit_fk,
  add constraint attendance_recovery_credit_fk
  foreign key (recovery_credit_id) references public.recovery_credits (id) on delete set null;
