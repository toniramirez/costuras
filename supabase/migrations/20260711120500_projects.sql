-- =============================================================================
-- Costura AP · Migración 0006 · Cuaderno virtual: proyectos, avances y archivos
--   projects · project_entries · project_files
-- Privacidad: un proyecto SOLO lo ve su alumno propietario y la administradora.
-- Sin comentarios ni chat (por especificación).
-- =============================================================================

create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  title             text not null,
  description       text,
  garment_type      text,        -- tipo de prenda
  fabric_type       text,        -- tipo de tela
  measurements      text,        -- medidas
  materials         text,        -- materiales
  difficulty        public.project_difficulty not null default 'inicial',
  start_date        date,
  end_date          date,
  status            public.project_status not null default 'idea',
  cover_image_path  text,
  notes             text,
  is_featured       boolean not null default false,  -- destacado (uso interno)
  archived_at       timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.projects is 'Proyecto de costura del alumno. Privado: propietario + admin.';
create index if not exists idx_projects_student on public.projects (student_id);
create index if not exists idx_projects_status on public.projects (status);
create index if not exists idx_projects_difficulty on public.projects (difficulty);
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Entradas de avance (línea de tiempo del cuaderno) --------------------------
create table if not exists public.project_entries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  title           text,
  body            text,           -- texto libre
  step_notes      text,           -- anotaciones paso a paso
  entry_date      date not null default current_date,
  materials_used  text,
  measurements    text,
  sort_order      int not null default 0,
  is_draft        boolean not null default false,  -- guardado automático de borradores
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_project_entries_project on public.project_entries (project_id, entry_date desc);
create trigger trg_project_entries_updated_at before update on public.project_entries
  for each row execute function public.set_updated_at();

-- Archivos (fotos, videos cortos, documentos, moldes) + enlaces externos ------
create table if not exists public.project_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  entry_id      uuid references public.project_entries (id) on delete cascade,
  kind          public.project_file_kind not null default 'imagen',
  storage_path  text,          -- objeto en Supabase Storage (bucket privado)
  external_url  text,          -- video largo alojado afuera (YouTube/Drive/...)
  file_name     text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  created_at    timestamptz not null default now(),
  -- Debe tener archivo propio o enlace externo (al menos uno).
  constraint project_file_source_ck check (storage_path is not null or external_url is not null)
);
create index if not exists idx_project_files_project on public.project_files (project_id);
create index if not exists idx_project_files_entry on public.project_files (entry_id);
