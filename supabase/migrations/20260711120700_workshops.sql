-- =============================================================================
-- Costura AP · Migración 0008 · Talleres especiales e inscripciones
--   workshops · workshop_registrations
-- Reglas clave:
--   * El cupo se ocupa DEFINITIVAMENTE solo con inscripción 'confirmada' (pagada).
--   * Al completarse el cupo, las nuevas pasan a 'lista_espera' por orden de llegada.
--   * Pueden inscribirse alumnos actuales o personas externas (carga manual).
-- =============================================================================

create table if not exists public.workshops (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  category            text,
  responsible_name    text,     -- responsable/tallerista (texto libre: puede ser externo)
  event_date          date,
  start_time          time,
  end_time            time,
  capacity            int not null default 0 check (capacity >= 0),
  price_cents         bigint not null default 0 check (price_cents >= 0),
  image_path          text,
  materials_included  text,
  materials_to_bring  text,
  location            text,
  status              public.workshop_status not null default 'borrador',
  cash_account_id     uuid references public.cash_accounts (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint workshop_time_range check (end_time is null or start_time is null or end_time > start_time)
);
comment on table public.workshops is 'Taller de una sola clase (fin de semana). Independiente de las cuotas mensuales.';
create index if not exists idx_workshops_status on public.workshops (status, event_date);
create trigger trg_workshops_updated_at before update on public.workshops
  for each row execute function public.set_updated_at();

create table if not exists public.workshop_registrations (
  id                   uuid primary key default gen_random_uuid(),
  workshop_id          uuid not null references public.workshops (id) on delete cascade,
  -- Inscripción de alumno actual…
  student_id           uuid references public.students (id) on delete set null,
  -- …o de persona externa (la administradora la carga a mano).
  external_first_name  text,
  external_last_name   text,
  external_phone       text,
  external_email       citext,
  notes                text,
  status               public.workshop_reg_status not null default 'pendiente',
  waitlist_position    int,
  amount_cents         bigint not null default 0 check (amount_cents >= 0),
  payment_id           uuid references public.payments (id) on delete set null,
  registered_at        timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Debe ser alumno interno O persona externa con nombre.
  constraint workshop_reg_person_ck check (
    student_id is not null or (external_first_name is not null and external_last_name is not null)
  )
);
comment on table public.workshop_registrations is 'Inscripción a taller. El cupo se ocupa con status=confirmada.';
create index if not exists idx_workshop_regs_workshop on public.workshop_registrations (workshop_id, status);
create index if not exists idx_workshop_regs_student on public.workshop_registrations (student_id);
-- Un alumno no puede inscribirse dos veces al mismo taller (salvo cancelada).
create unique index if not exists uq_workshop_reg_student
  on public.workshop_registrations (workshop_id, student_id)
  where student_id is not null and status <> 'cancelada';

create trigger trg_workshop_registrations_updated_at before update on public.workshop_registrations
  for each row execute function public.set_updated_at();

-- Enlace pendiente desde el libro mayor (declarado en la migración 0004).
alter table public.financial_movements
  drop constraint if exists financial_movements_workshop_fk,
  add constraint financial_movements_workshop_fk
  foreign key (workshop_id) references public.workshops (id) on delete set null;
