-- =============================================================================
-- Costura AP · Migración 0003 · Estructura académica
--   plans (modalidades) · rates (tarifas) · groups · students · historiales ·
--   enrollments (inscripción con modo de cobro del 1er mes)
-- =============================================================================

-- Modalidades / planes -------------------------------------------------------
-- Administrables desde el panel (NO hardcodeadas). Definen el servicio y un
-- precio base; el importe efectivo a cobrar sale de la tarifa (rates) vigente.
create table if not exists public.plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  classes_included  int not null default 1 check (classes_included >= 0),
  frequency         public.plan_frequency not null default 'semanal',
  price_cents       bigint not null default 0 check (price_cents >= 0),
  is_active         boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.plans is 'Modalidades/planes de cursada (1 clase semanal, 2 clases, packs, etc.).';

create trigger trg_plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Tarifas --------------------------------------------------------------------
-- Precios por período de inscripción (ej: mar-jun, jul-dic) con vigencia
-- configurable. El importe se congela en la cuota al emitirla.
create table if not exists public.rates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plan_id       uuid references public.plans (id) on delete set null,
  valid_from    date,
  valid_until   date,
  amount_cents  bigint not null check (amount_cents >= 0),
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rates_valid_range check (valid_until is null or valid_until >= valid_from)
);
comment on table public.rates is 'Tarifas configurables por período de vigencia y modalidad.';

create index if not exists idx_rates_plan on public.rates (plan_id);
create trigger trg_rates_updated_at before update on public.rates
  for each row execute function public.set_updated_at();

-- Grupos (día + horario fijo) ------------------------------------------------
-- Cada grupo es una franja semanal fija (weekday + start/end). Los grupos con
-- varias franjas se modelan como grupos separados (decisión documentada).
create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  weekday       int not null check (weekday between 0 and 6),  -- 0=domingo … 6=sábado
  start_time    time not null,
  end_time      time not null,
  capacity      int not null default 0 check (capacity >= 0),
  plan_id       uuid references public.plans (id) on delete set null,
  professor_id  uuid references public.profiles (id) on delete set null,  -- rol futuro
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint groups_time_range check (end_time > start_time)
);
comment on table public.groups is 'Grupos de cursada con día y horario fijo. capacity = cupo máximo.';
comment on column public.groups.professor_id is 'Preparado para el rol profesor (asignación de grupos). Sin uso en la UI aún.';

create index if not exists idx_groups_weekday on public.groups (weekday);
create trigger trg_groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

-- Alumnos --------------------------------------------------------------------
create table if not exists public.students (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid unique references public.profiles (id) on delete set null,
  first_name               text not null,
  last_name                text not null,
  dni                      text,
  email                    citext,
  phone                    text,
  birth_date               date,
  address                  text,
  emergency_contact        text,
  emergency_phone          text,
  enrollment_date          date not null default current_date,
  start_date               date,
  fixed_weekday            int check (fixed_weekday between 0 and 6),
  fixed_time               time,
  group_id                 uuid references public.groups (id) on delete set null,
  plan_id                  uuid references public.plans (id) on delete set null,
  rate_id                  uuid references public.rates (id) on delete set null,
  status                   public.student_status not null default 'pendiente',
  registration_fee_exempt  boolean not null default false,
  admin_notes              text,
  avatar_url               text,
  archived_at              timestamptz,               -- baja lógica
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
comment on table public.students is 'Ficha del alumno. profile_id enlaza con su usuario de Auth.';

create index if not exists idx_students_status on public.students (status);
create index if not exists idx_students_group on public.students (group_id);
create index if not exists idx_students_profile on public.students (profile_id);
create index if not exists idx_students_name on public.students (last_name, first_name);

create trigger trg_students_updated_at before update on public.students
  for each row execute function public.set_updated_at();

-- Protección a nivel de columna: el alumno solo puede editar datos de contacto.
-- Todo lo administrativo (tarifa, grupo, modalidad, estado, etc.) queda bloqueado
-- aunque la RLS le permita UPDATE de su propia fila.
create or replace function public.students_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo restringe a las sesiones de ALUMNO.
  --   · auth.uid() NULL  -> la llamada viene del servidor (service_role): se permite.
  --   · staff (admin)    -> se permite.
  --   · alumno           -> se bloquean las columnas administrativas.
  -- Un anónimo no llega hasta acá: la RLS de students no le da ninguna política.
  if (select auth.uid()) is not null and not public.is_staff() then
    if row(new.first_name, new.last_name, new.dni, new.status, new.group_id,
            new.plan_id, new.rate_id, new.enrollment_date, new.start_date,
            new.fixed_weekday, new.fixed_time, new.registration_fee_exempt,
            new.admin_notes, new.profile_id, new.archived_at)
       is distinct from
       row(old.first_name, old.last_name, old.dni, old.status, old.group_id,
            old.plan_id, old.rate_id, old.enrollment_date, old.start_date,
            old.fixed_weekday, old.fixed_time, old.registration_fee_exempt,
            old.admin_notes, old.profile_id, old.archived_at)
    then
      raise exception 'No tenés permiso para modificar estos campos del alumno';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_students_guard
  before update on public.students
  for each row execute function public.students_guard_protected_columns();

-- Historial de grupos (cambios sin perder trazabilidad) ----------------------
create table if not exists public.student_groups (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  from_date   date not null default current_date,
  to_date     date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_student_groups_student on public.student_groups (student_id);
create index if not exists idx_student_groups_group on public.student_groups (group_id);
-- Un alumno no puede tener dos asignaciones "abiertas" en el mismo grupo.
create unique index if not exists uq_student_groups_open
  on public.student_groups (student_id, group_id) where to_date is null;

-- Historial de tarifas -------------------------------------------------------
create table if not exists public.student_rates (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  rate_id       uuid references public.rates (id) on delete set null,
  amount_cents  bigint not null check (amount_cents >= 0),  -- snapshot
  from_date     date not null default current_date,
  to_date       date,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_student_rates_student on public.student_rates (student_id);

-- Inscripciones (define cómo arranca la facturación) -------------------------
create table if not exists public.enrollments (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students (id) on delete cascade,
  enrolled_at            date not null default current_date,
  start_date             date,
  plan_id                uuid references public.plans (id) on delete set null,
  rate_id                uuid references public.rates (id) on delete set null,
  charge_mode            public.charge_mode not null default 'mes_completo',
  first_period_year      int,
  first_period_month     int check (first_period_month between 1 and 12),
  prorated_amount_cents  bigint check (prorated_amount_cents is null or prorated_amount_cents >= 0),
  manual_amount_cents    bigint check (manual_amount_cents is null or manual_amount_cents >= 0),
  notes                  text,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now()
);
comment on table public.enrollments is 'Evento de inscripción y política de cobro del primer mes (ingreso a mitad de mes).';
create index if not exists idx_enrollments_student on public.enrollments (student_id);
