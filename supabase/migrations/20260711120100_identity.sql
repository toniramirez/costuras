-- =============================================================================
-- Costura AP · Migración 0002 · Identidad (profiles) y enlace con Supabase Auth
-- -----------------------------------------------------------------------------
-- profiles: extiende auth.users con rol y datos básicos. 1 fila por usuario.
-- El alumno (students) se vincula por students.profile_id -> profiles.id.
-- =============================================================================

create table if not exists public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  role                    public.app_role not null default 'alumno',
  full_name               text not null default '',
  email                   citext,
  phone                   text,
  avatar_url              text,
  -- Al crear la cuenta con contraseña temporal se fuerza el cambio en el 1er login.
  must_change_password    boolean not null default true,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada usuario autenticado (admin / profesor / alumno).';

create index if not exists idx_profiles_role on public.profiles (role);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Alta automática de profile cuando se crea un usuario en auth.users.
-- El rol y datos vienen de raw_user_meta_data (los setea la ruta segura del
-- servidor que usa el service_role al crear alumnos, o el bootstrap del admin).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone, must_change_password)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'alumno')::public.app_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantener profiles.email sincronizado si cambia el email en auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
