-- =============================================================================
-- Costura AP · Migración 0009 · Configuración de la academia y auditoría
--   academy_settings (singleton) · audit_logs · datos iniciales requeridos
-- Nada de valores rígidos en el código: todo lo configurable vive acá.
-- =============================================================================

create table if not exists public.academy_settings (
  id                          int primary key default 1 check (id = 1),  -- singleton

  -- Identidad visual y datos de la academia -----------------------------------
  academy_name                text not null default 'Costura AP',
  logo_path                   text,
  isotype_path                text,
  primary_color               text not null default '#8C6A5D',   -- terracota suave
  secondary_color             text not null default '#3F3A36',   -- gris cálido oscuro
  accent_color                text not null default '#C9A227',   -- dorado tenue
  phone                       text,
  email                       citext,
  address                     text,

  -- Recibos -------------------------------------------------------------------
  receipt_prefix              text not null default 'R',
  receipt_next_number         bigint not null default 1 check (receipt_next_number >= 1),
  receipt_footer              text,
  receipt_legal               text not null default 'Comprobante interno. No válido como factura.',

  -- Matrícula -----------------------------------------------------------------
  registration_fee_cents      bigint not null default 0 check (registration_fee_cents >= 0),
  registration_mode           public.registration_mode not null default 'unica',
  registration_due_days       int not null default 10 check (registration_due_days >= 0),

  -- Cuotas --------------------------------------------------------------------
  fee_due_day                 int not null default 10 check (fee_due_day between 1 and 28),
  default_charge_mode         public.charge_mode not null default 'mes_completo',
  -- Enero/febrero: en Argentina suele ser receso. Configurable.
  bill_january                boolean not null default false,
  bill_february               boolean not null default false,
  jan_feb_charge_mode         public.charge_mode not null default 'mes_siguiente',

  -- Recuperaciones ------------------------------------------------------------
  recovery_min_notice_hours   int not null default 24 check (recovery_min_notice_hours >= 0),
  recovery_validity_days      int not null default 30 check (recovery_validity_days > 0),

  -- Límites de archivos (MB) --------------------------------------------------
  max_image_mb                int not null default 10 check (max_image_mb > 0),
  max_document_mb             int not null default 20 check (max_document_mb > 0),
  max_video_mb                int not null default 50 check (max_video_mb > 0),

  -- Mercado Pago --------------------------------------------------------------
  -- El ACCESS TOKEN nunca se guarda acá: vive en variables de entorno del servidor.
  mp_enabled                  boolean not null default false,
  mp_public_key               text,

  -- Regionalización -----------------------------------------------------------
  timezone                    text not null default 'America/Argentina/Cordoba',
  currency                    text not null default 'ARS',
  locale                      text not null default 'es-AR',

  updated_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
comment on table public.academy_settings is 'Configuración única de la academia. Todo lo parametrizable vive acá.';
comment on column public.academy_settings.mp_public_key is 'Public key de Mercado Pago (es pública por diseño). El access token va en env del servidor.';

create trigger trg_academy_settings_updated_at before update on public.academy_settings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Auditoría
-- =============================================================================
create table if not exists public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_email      text,
  actor_role       public.app_role,
  action           text not null,        -- create, update, delete, approve, reject, pause, ...
  entity_type      text not null,        -- students, monthly_fees, payments, ...
  entity_id        text,
  old_values       jsonb,
  new_values       jsonb,
  created_at       timestamptz not null default now()
);
comment on table public.audit_logs is 'Registro de acciones importantes. Solo lectura para admin; escritura vía triggers/servicios.';
create index if not exists idx_audit_entity on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_actor on public.audit_logs (actor_profile_id, created_at desc);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- =============================================================================
-- Datos iniciales REQUERIDOS (no son datos demo: la app los necesita para operar)
-- =============================================================================

insert into public.academy_settings (id) values (1) on conflict (id) do nothing;

insert into public.payment_methods (name, code, requires_proof, sort_order) values
  ('Efectivo',      'efectivo',      false, 1),
  ('Transferencia', 'transferencia', true,  2),
  ('Mercado Pago',  'mercadopago',   false, 3),
  ('Débito',        'debito',        false, 4),
  ('Crédito',       'credito',       false, 5),
  ('Otro',          'otro',          false, 6)
on conflict (code) do nothing;

insert into public.cash_accounts (name, description, type) values
  ('Efectivo',     'Caja física de la academia',   'efectivo'),
  ('Mercado Pago', 'Billetera de Mercado Pago',    'billetera_virtual'),
  ('Banco',        'Cuenta bancaria',              'banco')
on conflict do nothing;

insert into public.financial_categories (name, kind, is_system, sort_order) values
  ('Cuotas',        'ingreso', true, 1),
  ('Matrículas',    'ingreso', true, 2),
  ('Talleres',      'ingreso', true, 3),
  ('Otros ingresos','ingreso', true, 4),
  ('Alquiler',      'gasto',   true, 1),
  ('Servicios',     'gasto',   true, 2),
  ('Materiales',    'gasto',   true, 3),
  ('Publicidad',    'gasto',   true, 4),
  ('Mantenimiento', 'gasto',   true, 5),
  ('Otros gastos',  'gasto',   true, 6)
on conflict (name, kind) do nothing;
