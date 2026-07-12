-- =============================================================================
-- Costura AP · Migración 0004 · Núcleo financiero
--   payment_methods · cash_accounts · financial_categories · payments ·
--   payment_receipts · monthly_fees · registration_fees · payment_proofs ·
--   financial_movements
-- Reglas clave:
--   * Dinero en bigint centavos.
--   * Sin pagos parciales: una cuota no tiene "monto abonado"; está pagada o no.
--   * Los movimientos ligados a pagos son inmutables (se corrigen con reversos).
-- =============================================================================

-- Medios de pago -------------------------------------------------------------
create table if not exists public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text not null unique,   -- efectivo, transferencia, mercadopago, debito, credito, otro
  is_active      boolean not null default true,
  requires_proof boolean not null default false,  -- transferencia => comprobante
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_payment_methods_updated_at before update on public.payment_methods
  for each row execute function public.set_updated_at();

-- Cajas ----------------------------------------------------------------------
create table if not exists public.cash_accounts (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  description            text,
  type                   public.cash_account_type not null default 'otra',
  initial_balance_cents  bigint not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.cash_accounts is 'Cajas. El saldo se calcula: initial + Σ movimientos (nunca se edita a mano).';
create trigger trg_cash_accounts_updated_at before update on public.cash_accounts
  for each row execute function public.set_updated_at();

-- Categorías de ingresos/gastos ---------------------------------------------
create table if not exists public.financial_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        public.category_kind not null,
  is_system   boolean not null default false,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, kind)
);
create trigger trg_financial_categories_updated_at before update on public.financial_categories
  for each row execute function public.set_updated_at();

-- Pagos (dinero recibido) ----------------------------------------------------
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid references public.students (id) on delete set null,
  amount_cents       bigint not null check (amount_cents > 0),
  method_id          uuid references public.payment_methods (id) on delete set null,
  cash_account_id    uuid references public.cash_accounts (id) on delete set null,
  status             public.payment_status not null default 'confirmado',
  paid_at            timestamptz not null default now(),
  external_reference text,
  -- Mercado Pago (nunca guardamos el access token; solo IDs/estado/importes).
  mp_payment_id      text unique,
  mp_status          text,
  mp_fee_cents       bigint,
  net_amount_cents   bigint,
  receipt_id         uuid,  -- FK agregada tras crear payment_receipts
  notes              text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_payments_student on public.payments (student_id);
create index if not exists idx_payments_mp on public.payments (mp_payment_id);
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Recibos internos (numeración correlativa) ----------------------------------
create table if not exists public.payment_receipts (
  id                 uuid primary key default gen_random_uuid(),
  receipt_number     bigint not null unique,
  payment_id         uuid references public.payments (id) on delete set null,
  student_id         uuid references public.students (id) on delete set null,
  concept            text not null,
  period_label       text,
  amount_cents       bigint not null,
  method_name        text,
  external_reference text,
  issued_at          timestamptz not null default now(),
  pdf_path           text,
  academy_snapshot   jsonb,   -- datos de la academia al momento de emitir
  created_at         timestamptz not null default now()
);
comment on table public.payment_receipts is 'Recibo interno NO fiscal, numeración correlativa única.';
create index if not exists idx_receipts_student on public.payment_receipts (student_id);

alter table public.payments
  drop constraint if exists payments_receipt_fk,
  add constraint payments_receipt_fk
  foreign key (receipt_id) references public.payment_receipts (id) on delete set null;

-- Cuotas mensuales -----------------------------------------------------------
create table if not exists public.monthly_fees (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references public.students (id) on delete cascade,
  period_year             int not null,
  period_month            int not null check (period_month between 1 and 12),
  rate_id                 uuid references public.rates (id) on delete set null,
  base_amount_cents       bigint not null check (base_amount_cents >= 0),
  manual_adjustment_cents bigint not null default 0,
  final_amount_cents      bigint not null check (final_amount_cents >= 0),
  issued_date             date not null default current_date,
  due_date                date,
  status                  public.fee_status not null default 'pendiente',
  paid_date               date,
  payment_method_id       uuid references public.payment_methods (id) on delete set null,
  cash_account_id         uuid references public.cash_accounts (id) on delete set null,
  payment_id              uuid references public.payments (id) on delete set null,
  receipt_id              uuid references public.payment_receipts (id) on delete set null,
  receipt_number          bigint,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Anti-duplicado: una sola cuota por alumno/año/mes.
  constraint uq_monthly_fee unique (student_id, period_year, period_month),
  -- El importe final es coherente con base + ajuste (sin pagos parciales).
  constraint monthly_fee_final_ck check (final_amount_cents = base_amount_cents + manual_adjustment_cents)
);
comment on table public.monthly_fees is 'Cuota mensual completa. Único por (alumno, año, mes). Nunca parcial.';
create index if not exists idx_monthly_fees_period on public.monthly_fees (period_year, period_month);
create index if not exists idx_monthly_fees_status on public.monthly_fees (status);
create index if not exists idx_monthly_fees_student on public.monthly_fees (student_id);
create trigger trg_monthly_fees_updated_at before update on public.monthly_fees
  for each row execute function public.set_updated_at();

-- Matrículas -----------------------------------------------------------------
create table if not exists public.registration_fees (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete cascade,
  enrollment_id      uuid references public.enrollments (id) on delete set null,
  amount_cents       bigint not null check (amount_cents >= 0),
  issued_date        date not null default current_date,
  due_date           date,
  status             public.fee_status not null default 'pendiente',
  paid_date          date,
  payment_method_id  uuid references public.payment_methods (id) on delete set null,
  cash_account_id    uuid references public.cash_accounts (id) on delete set null,
  payment_id         uuid references public.payments (id) on delete set null,
  receipt_id         uuid references public.payment_receipts (id) on delete set null,
  receipt_number     bigint,
  is_exempt          boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.registration_fees is 'Matrícula (concepto separado de la cuota). Sin pagos parciales.';
create index if not exists idx_registration_fees_student on public.registration_fees (student_id);
create trigger trg_registration_fees_updated_at before update on public.registration_fees
  for each row execute function public.set_updated_at();

-- Comprobantes de transferencia ---------------------------------------------
create table if not exists public.payment_proofs (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students (id) on delete cascade,
  monthly_fee_id       uuid references public.monthly_fees (id) on delete cascade,
  registration_fee_id  uuid references public.registration_fees (id) on delete cascade,
  file_path            text not null,
  uploaded_at          timestamptz not null default now(),
  informed_amount_cents bigint check (informed_amount_cents is null or informed_amount_cents >= 0),
  reference            text,
  note                 text,
  status               public.proof_status not null default 'pendiente',
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Un comprobante corresponde exactamente a una cuota O una matrícula.
  constraint proof_one_target check (
    (monthly_fee_id is not null)::int + (registration_fee_id is not null)::int = 1
  )
);
create index if not exists idx_proofs_status on public.payment_proofs (status);
create index if not exists idx_proofs_student on public.payment_proofs (student_id);
create index if not exists idx_proofs_fee on public.payment_proofs (monthly_fee_id);
create trigger trg_payment_proofs_updated_at before update on public.payment_proofs
  for each row execute function public.set_updated_at();

-- Movimientos de caja (libro mayor administrativo) ---------------------------
create table if not exists public.financial_movements (
  id                   uuid primary key default gen_random_uuid(),
  type                 public.movement_type not null,
  movement_date        date not null default current_date,
  category_id          uuid references public.financial_categories (id) on delete set null,
  description          text,
  amount_cents         bigint not null,
  cash_account_id      uuid not null references public.cash_accounts (id) on delete restrict,
  payment_method_id    uuid references public.payment_methods (id) on delete set null,
  student_id           uuid references public.students (id) on delete set null,
  monthly_fee_id       uuid references public.monthly_fees (id) on delete set null,
  registration_fee_id  uuid references public.registration_fees (id) on delete set null,
  payment_id           uuid references public.payments (id) on delete set null,
  workshop_id          uuid,  -- FK agregada en la migración de talleres
  proof_path           text,
  notes                text,
  is_reversal          boolean not null default false,
  reverses_movement_id uuid references public.financial_movements (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  -- ingreso/gasto: importe positivo. ajuste: distinto de cero (puede ser negativo).
  constraint movement_amount_ck check (
    (type in ('ingreso', 'gasto') and amount_cents > 0)
    or (type = 'ajuste' and amount_cents <> 0)
  )
);
comment on table public.financial_movements is 'Libro mayor por caja. ingreso(+) / gasto(-) / ajuste(±). Base del saldo.';
create index if not exists idx_movements_account on public.financial_movements (cash_account_id);
create index if not exists idx_movements_date on public.financial_movements (movement_date);
create index if not exists idx_movements_category on public.financial_movements (category_id);
create index if not exists idx_movements_payment on public.financial_movements (payment_id);
