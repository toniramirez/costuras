-- =============================================================================
-- Costura AP · Migración 0007 · Novedades, comunicados y notificaciones
--   announcements (+recipients) · communications (+recipients) · notifications
-- Modelo de destinatarios: al publicar/enviar se EXPANDEN los destinatarios a
-- una fila por alumno. Eso hace trivial el "quién leyó / quién no" y la RLS.
-- =============================================================================

-- Novedades (aparecen en el inicio del alumno) -------------------------------
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  content       text not null,
  image_path    text,
  attachments   jsonb not null default '[]'::jsonb,  -- [{path,name,size,mime}]
  published_at  timestamptz,
  expires_at    timestamptz,
  priority      public.priority_level not null default 'normal',
  is_pinned     boolean not null default false,
  status        public.publish_status not null default 'borrador',
  scope         public.recipient_scope not null default 'todos',
  scope_label   text,        -- ej: "Grupo Martes 15:00"
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.announcements is 'Novedades. Las vencidas dejan de ser principales pero quedan en historial.';
create index if not exists idx_announcements_status on public.announcements (status, published_at desc);
create trigger trg_announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table if not exists public.announcement_recipients (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint uq_announcement_recipient unique (announcement_id, student_id)
);
create index if not exists idx_ann_recipients_student on public.announcement_recipients (student_id);

-- Comunicados (bandeja de entrada, sin respuesta) ----------------------------
create table if not exists public.communications (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null,
  body         text not null,
  attachments  jsonb not null default '[]'::jsonb,
  priority     public.priority_level not null default 'normal',
  status       public.publish_status not null default 'borrador',
  sent_at      timestamptz,
  expires_at   timestamptz,
  scope        public.recipient_scope not null default 'todos',
  scope_label  text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.communications is 'Comunicado interno. El alumno lee y marca como leído; no puede responder.';
create index if not exists idx_communications_sent on public.communications (status, sent_at desc);
create trigger trg_communications_updated_at before update on public.communications
  for each row execute function public.set_updated_at();

create table if not exists public.communication_recipients (
  id               uuid primary key default gen_random_uuid(),
  communication_id uuid not null references public.communications (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint uq_communication_recipient unique (communication_id, student_id)
);
create index if not exists idx_comm_recipients_student on public.communication_recipients (student_id, read_at);

-- Notificaciones internas ----------------------------------------------------
-- audience='admin'  -> la ven todas las administradoras (profile_id null)
-- audience='alumno' -> dirigida a un profile_id concreto
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles (id) on delete cascade,
  audience     public.notification_audience not null,
  type         text not null,          -- comprobante_subido, cuota_vencida, cupo_completo, ...
  title        text not null,
  body         text,
  link         text,                   -- ruta interna a la que navega
  entity_type  text,
  entity_id    uuid,
  is_read      boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint notification_target_ck check (
    (audience = 'alumno' and profile_id is not null) or audience = 'admin'
  )
);
create index if not exists idx_notifications_profile on public.notifications (profile_id, is_read, created_at desc);
create index if not exists idx_notifications_audience on public.notifications (audience, is_read, created_at desc);
