-- =============================================================================
-- Costura AP · Migración 0010 · Lógica de negocio financiera
--   Vistas de saldo/cupo · numeración de recibos · generación de cuotas ·
--   liquidación de cuotas (efectivo / comprobante / Mercado Pago) · reversos.
--
-- Seguridad de funciones:
--   * Funciones de administración -> public.assert_admin(): exige admin cuando
--     hay un usuario final autenticado, y permite la llamada del servidor con
--     service_role (cron de cuotas, webhooks). Un alumno queda bloqueado.
--   * public.confirm_mercadopago_payment -> la invoca solo el webhook del
--     servidor. Se le revoca EXECUTE a anon y authenticated.
-- =============================================================================

-- =============================================================================
-- Vistas calculadas (nunca guardamos saldos ni contadores denormalizados)
-- =============================================================================

-- Saldo de cada caja = saldo inicial + Σ movimientos.
create or replace view public.cash_account_balances
with (security_invoker = on) as
select
  ca.id                      as cash_account_id,
  ca.name,
  ca.type,
  ca.is_active,
  ca.initial_balance_cents,
  ca.initial_balance_cents + coalesce(sum(
    case fm.type
      when 'ingreso' then fm.amount_cents
      when 'gasto'   then -fm.amount_cents
      when 'ajuste'  then fm.amount_cents   -- el ajuste ya viene con signo
    end
  ), 0)::bigint              as balance_cents
from public.cash_accounts ca
left join public.financial_movements fm on fm.cash_account_id = ca.id
group by ca.id, ca.name, ca.type, ca.is_active, ca.initial_balance_cents;

comment on view public.cash_account_balances is 'Saldo por caja calculado desde el libro mayor. Nunca se edita a mano.';

-- Ocupación de cada grupo. Un alumno pausado libera el cupo (decisión documentada).
create or replace view public.group_occupancy
with (security_invoker = on) as
select
  g.id                                   as group_id,
  g.name,
  g.capacity,
  count(s.id)::int                       as current_students,
  greatest(g.capacity - count(s.id), 0)::int as available_slots,
  (g.capacity > 0 and count(s.id) >= g.capacity) as is_full
from public.groups g
left join public.students s
  on s.group_id = g.id
 and s.archived_at is null
 and s.status in ('activo', 'pendiente')
group by g.id, g.name, g.capacity;

comment on view public.group_occupancy is 'Cupo y ocupación por grupo. Cuentan alumnos activos y pendientes.';

-- =============================================================================
-- Numeración correlativa de recibos (atómica, sin duplicados)
-- =============================================================================
create or replace function public.next_receipt_number()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number bigint;
begin
  -- El UPDATE ... RETURNING toma un lock de fila: dos pagos simultáneos nunca
  -- obtienen el mismo número.
  update public.academy_settings
     set receipt_next_number = receipt_next_number + 1
   where id = 1
  returning receipt_next_number - 1 into v_number;

  if v_number is null then
    raise exception 'No existe la configuración de la academia (academy_settings id=1)';
  end if;
  return v_number;
end;
$$;

-- =============================================================================
-- Importe de la cuota de un alumno
-- =============================================================================

-- Importe mensual vigente del alumno: tarifa asignada, si no el precio del plan.
create or replace function public.student_monthly_amount_cents(p_student_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.amount_cents
       from public.students s
       join public.rates r on r.id = s.rate_id
      where s.id = p_student_id),
    (select p.price_cents
       from public.students s
       join public.plans p on p.id = s.plan_id
      where s.id = p_student_id),
    0
  );
$$;

-- Importe a facturar a un alumno en un período dado.
-- Devuelve NULL cuando NO corresponde emitir cuota (aún no inició, receso, o la
-- inscripción indicó "empezar a cobrar el mes siguiente").
create or replace function public.fee_amount_for_period(p_student_id uuid, p_year int, p_month int)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student   public.students;
  v_enroll    public.enrollments;
  v_period    date := make_date(p_year, p_month, 1);
  v_amount    bigint;
begin
  select * into v_student from public.students where id = p_student_id;
  if not found or v_student.archived_at is not null or v_student.status <> 'activo' then
    return null;
  end if;

  -- No facturar meses anteriores al inicio del alumno.
  if v_student.start_date is not null
     and v_period < date_trunc('month', v_student.start_date)::date then
    return null;
  end if;

  v_amount := public.student_monthly_amount_cents(p_student_id);

  -- Última inscripción: define el 1er período y cómo se cobra.
  select * into v_enroll
    from public.enrollments
   where student_id = p_student_id
   order by enrolled_at desc, created_at desc
   limit 1;

  if found and v_enroll.first_period_year is not null and v_enroll.first_period_month is not null then
    -- Antes del primer período facturable => no corresponde.
    if v_period < make_date(v_enroll.first_period_year, v_enroll.first_period_month, 1) then
      return null;
    end if;

    -- Exactamente el primer período => aplica el modo de cobro elegido al inscribir.
    if v_period = make_date(v_enroll.first_period_year, v_enroll.first_period_month, 1) then
      case v_enroll.charge_mode
        when 'mes_siguiente'  then return null;  -- se empieza a cobrar después
        when 'proporcional'   then return coalesce(v_enroll.prorated_amount_cents, v_amount);
        when 'manual'         then return coalesce(v_enroll.manual_amount_cents, v_amount);
        else                       return v_amount;  -- mes_completo
      end case;
    end if;
  end if;

  return v_amount;
end;
$$;

-- =============================================================================
-- Generación mensual de cuotas (idempotente: nunca duplica)
-- =============================================================================
create or replace function public.generate_monthly_fees(p_year int, p_month int)
returns table (created_count int, skipped_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.academy_settings;
  v_due      date;
  v_created  int := 0;
  v_skipped  int := 0;
  v_amount   bigint;
  r          record;
begin
  perform public.assert_admin('generar cuotas');
  if p_month < 1 or p_month > 12 then
    raise exception 'Mes inválido: %', p_month;
  end if;

  select * into v_settings from public.academy_settings where id = 1;

  -- Receso configurable (en Argentina enero/febrero suelen no facturarse).
  if (p_month = 1 and not v_settings.bill_january)
     or (p_month = 2 and not v_settings.bill_february) then
    return query select 0, 0;
    return;
  end if;

  v_due := make_date(p_year, p_month, least(v_settings.fee_due_day, 28));

  for r in
    select s.id, s.rate_id
      from public.students s
     where s.status = 'activo'
       and s.archived_at is null
  loop
    v_amount := public.fee_amount_for_period(r.id, p_year, p_month);

    if v_amount is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.monthly_fees (
      student_id, period_year, period_month, rate_id,
      base_amount_cents, manual_adjustment_cents, final_amount_cents,
      issued_date, due_date, status
    ) values (
      r.id, p_year, p_month, r.rate_id,
      v_amount, 0, v_amount,
      current_date, v_due, 'pendiente'
    )
    on conflict (student_id, period_year, period_month) do nothing;

    if found then
      v_created := v_created + 1;
      -- Notificar al alumno que se emitió su cuota.
      insert into public.notifications (profile_id, audience, type, title, body, link)
      select s.profile_id, 'alumno', 'cuota_generada',
             'Nueva cuota emitida',
             'Se emitió tu cuota de ' || to_char(make_date(p_year, p_month, 1), 'TMMonth YYYY') || '.',
             '/alumno/pagos'
        from public.students s
       where s.id = r.id and s.profile_id is not null;
    else
      v_skipped := v_skipped + 1;  -- ya existía
    end if;
  end loop;

  return query select v_created, v_skipped;
end;
$$;

-- Marca como vencidas las cuotas/matrículas impagas cuyo vencimiento pasó.
create or replace function public.mark_overdue_fees()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_n     int;
begin
  update public.monthly_fees
     set status = 'vencida'
   where status = 'pendiente'
     and due_date is not null
     and due_date < current_date;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  update public.registration_fees
     set status = 'vencida'
   where status = 'pendiente'
     and due_date is not null
     and due_date < current_date;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

-- =============================================================================
-- Registro de un pago + recibo + movimiento de caja (núcleo del dinero)
-- =============================================================================
create or replace function public.record_payment_with_receipt(
  p_student_id           uuid,
  p_amount_cents         bigint,
  p_method_id            uuid,
  p_cash_account_id      uuid,
  p_concept              text,
  p_period_label         text,
  p_category_name        text,               -- 'Cuotas' | 'Matrículas' | 'Talleres'
  p_paid_at              timestamptz default now(),
  p_external_reference   text default null,
  p_mp_payment_id        text default null,
  p_mp_status            text default null,
  p_mp_fee_cents         bigint default null,
  p_net_amount_cents     bigint default null,
  p_notes                text default null,
  p_monthly_fee_id       uuid default null,
  p_registration_fee_id  uuid default null,
  p_workshop_id          uuid default null,
  p_created_by           uuid default null
)
returns table (payment_id uuid, receipt_id uuid, receipt_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id   uuid;
  v_receipt_id   uuid;
  v_number       bigint;
  v_method_name  text;
  v_category_id  uuid;
  v_settings     public.academy_settings;
begin
  if p_amount_cents <= 0 then
    raise exception 'El importe del pago debe ser mayor a cero';
  end if;
  if p_cash_account_id is null then
    raise exception 'Debe indicarse una caja de destino';
  end if;

  select * into v_settings from public.academy_settings where id = 1;
  select name into v_method_name from public.payment_methods where id = p_method_id;
  select id into v_category_id
    from public.financial_categories
   where kind = 'ingreso' and name = p_category_name
   limit 1;

  -- 1) Pago
  insert into public.payments (
    student_id, amount_cents, method_id, cash_account_id, status, paid_at,
    external_reference, mp_payment_id, mp_status, mp_fee_cents, net_amount_cents,
    notes, created_by
  ) values (
    p_student_id, p_amount_cents, p_method_id, p_cash_account_id, 'confirmado', p_paid_at,
    p_external_reference, p_mp_payment_id, p_mp_status, p_mp_fee_cents, p_net_amount_cents,
    p_notes, p_created_by
  )
  returning id into v_payment_id;

  -- 2) Recibo correlativo
  v_number := public.next_receipt_number();

  insert into public.payment_receipts (
    receipt_number, payment_id, student_id, concept, period_label,
    amount_cents, method_name, external_reference, issued_at, academy_snapshot
  ) values (
    v_number, v_payment_id, p_student_id, p_concept, p_period_label,
    p_amount_cents, v_method_name, p_external_reference, p_paid_at,
    jsonb_build_object(
      'academy_name', v_settings.academy_name,
      'phone',        v_settings.phone,
      'email',        v_settings.email,
      'address',      v_settings.address,
      'logo_path',    v_settings.logo_path,
      'prefix',       v_settings.receipt_prefix,
      'footer',       v_settings.receipt_footer,
      'legal',        v_settings.receipt_legal
    )
  )
  returning id into v_receipt_id;

  update public.payments set receipt_id = v_receipt_id where id = v_payment_id;

  -- 3) Movimiento de caja (ingreso)
  insert into public.financial_movements (
    type, movement_date, category_id, description, amount_cents,
    cash_account_id, payment_method_id, student_id,
    monthly_fee_id, registration_fee_id, payment_id, workshop_id, created_by
  ) values (
    'ingreso', p_paid_at::date, v_category_id, p_concept, p_amount_cents,
    p_cash_account_id, p_method_id, p_student_id,
    p_monthly_fee_id, p_registration_fee_id, v_payment_id, p_workshop_id, p_created_by
  );

  return query select v_payment_id, v_receipt_id, v_number;
end;
$$;

-- =============================================================================
-- Liquidación de una CUOTA MENSUAL (pago total; nunca parcial)
-- =============================================================================
create or replace function public.settle_monthly_fee(
  p_fee_id             uuid,
  p_method_id          uuid,
  p_cash_account_id    uuid,
  p_paid_at            timestamptz default now(),
  p_external_reference text default null,
  p_notes              text default null,
  p_mp_payment_id      text default null,
  p_mp_status          text default null,
  p_mp_fee_cents       bigint default null,
  p_net_amount_cents   bigint default null,
  p_actor              uuid default null
)
returns uuid   -- payment_receipts.id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee     public.monthly_fees;
  v_student public.students;
  v_res     record;
  v_label   text;
begin
  -- Lock de la cuota: evita doble pago concurrente.
  select * into v_fee from public.monthly_fees where id = p_fee_id for update;
  if not found then
    raise exception 'La cuota no existe';
  end if;
  if v_fee.status = 'pagada' then
    raise exception 'La cuota ya está pagada';
  end if;
  if v_fee.status in ('anulada', 'bonificada') then
    raise exception 'La cuota está % y no admite pago', v_fee.status;
  end if;

  select * into v_student from public.students where id = v_fee.student_id;
  v_label := to_char(make_date(v_fee.period_year, v_fee.period_month, 1), 'TMMonth YYYY');

  select * into v_res from public.record_payment_with_receipt(
    p_student_id          => v_fee.student_id,
    p_amount_cents        => v_fee.final_amount_cents,   -- SIEMPRE el total
    p_method_id           => p_method_id,
    p_cash_account_id     => p_cash_account_id,
    p_concept             => 'Cuota ' || v_label,
    p_period_label        => v_label,
    p_category_name       => 'Cuotas',
    p_paid_at             => p_paid_at,
    p_external_reference  => p_external_reference,
    p_mp_payment_id       => p_mp_payment_id,
    p_mp_status           => p_mp_status,
    p_mp_fee_cents        => p_mp_fee_cents,
    p_net_amount_cents    => p_net_amount_cents,
    p_notes               => p_notes,
    p_monthly_fee_id      => p_fee_id,
    p_created_by          => p_actor
  );

  update public.monthly_fees
     set status            = 'pagada',
         paid_date         = p_paid_at::date,
         payment_method_id = p_method_id,
         cash_account_id   = p_cash_account_id,
         payment_id        = v_res.payment_id,
         receipt_id        = v_res.receipt_id,
         receipt_number    = v_res.receipt_number
   where id = p_fee_id;

  -- Notificar al alumno (pago registrado + recibo disponible).
  if v_student.profile_id is not null then
    insert into public.notifications (profile_id, audience, type, title, body, link)
    values (v_student.profile_id, 'alumno', 'pago_registrado',
            'Pago registrado',
            'Registramos el pago de tu cuota de ' || v_label || '. Ya podés descargar el recibo.',
            '/alumno/pagos');
  end if;

  return v_res.receipt_id;
end;
$$;

-- =============================================================================
-- Liquidación de una MATRÍCULA (pago único total, sin parciales)
-- =============================================================================
create or replace function public.settle_registration_fee(
  p_fee_id             uuid,
  p_method_id          uuid,
  p_cash_account_id    uuid,
  p_paid_at            timestamptz default now(),
  p_external_reference text default null,
  p_notes              text default null,
  p_actor              uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee public.registration_fees;
  v_res record;
begin
  select * into v_fee from public.registration_fees where id = p_fee_id for update;
  if not found then
    raise exception 'La matrícula no existe';
  end if;
  if v_fee.status = 'pagada' then
    raise exception 'La matrícula ya está pagada';
  end if;
  if v_fee.status in ('anulada', 'bonificada') then
    raise exception 'La matrícula está % y no admite pago', v_fee.status;
  end if;

  select * into v_res from public.record_payment_with_receipt(
    p_student_id         => v_fee.student_id,
    p_amount_cents       => v_fee.amount_cents,
    p_method_id          => p_method_id,
    p_cash_account_id    => p_cash_account_id,
    p_concept            => 'Matrícula',
    p_period_label       => to_char(v_fee.issued_date, 'YYYY'),
    p_category_name      => 'Matrículas',
    p_paid_at            => p_paid_at,
    p_external_reference => p_external_reference,
    p_notes              => p_notes,
    p_registration_fee_id=> p_fee_id,
    p_created_by         => p_actor
  );

  update public.registration_fees
     set status            = 'pagada',
         paid_date         = p_paid_at::date,
         payment_method_id = p_method_id,
         cash_account_id   = p_cash_account_id,
         payment_id        = v_res.payment_id,
         receipt_id        = v_res.receipt_id,
         receipt_number    = v_res.receipt_number
   where id = p_fee_id;

  return v_res.receipt_id;
end;
$$;

-- =============================================================================
-- Comprobantes de transferencia: aprobar / rechazar
-- =============================================================================
create or replace function public.approve_payment_proof(
  p_proof_id        uuid,
  p_cash_account_id uuid,
  p_method_id       uuid default null
)
returns uuid   -- receipt id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof    public.payment_proofs;
  v_method   uuid;
  v_receipt  uuid;
  v_actor    uuid := (select auth.uid());
begin
  perform public.assert_admin('aprobar comprobantes');

  select * into v_proof from public.payment_proofs where id = p_proof_id for update;
  if not found then
    raise exception 'El comprobante no existe';
  end if;
  if v_proof.status <> 'pendiente' then
    raise exception 'El comprobante ya fue %', v_proof.status;
  end if;

  v_method := coalesce(
    p_method_id,
    (select id from public.payment_methods where code = 'transferencia' limit 1)
  );

  if v_proof.monthly_fee_id is not null then
    v_receipt := public.settle_monthly_fee(
      p_fee_id             => v_proof.monthly_fee_id,
      p_method_id          => v_method,
      p_cash_account_id    => p_cash_account_id,
      p_paid_at            => now(),
      p_external_reference => v_proof.reference,
      p_notes              => 'Aprobado desde comprobante de transferencia',
      p_actor              => v_actor
    );
  else
    v_receipt := public.settle_registration_fee(
      p_fee_id             => v_proof.registration_fee_id,
      p_method_id          => v_method,
      p_cash_account_id    => p_cash_account_id,
      p_paid_at            => now(),
      p_external_reference => v_proof.reference,
      p_notes              => 'Aprobado desde comprobante de transferencia',
      p_actor              => v_actor
    );
  end if;

  update public.payment_proofs
     set status = 'aprobado', reviewed_by = v_actor, reviewed_at = now(), rejection_reason = null
   where id = p_proof_id;

  -- Aviso al alumno.
  insert into public.notifications (profile_id, audience, type, title, body, link)
  select s.profile_id, 'alumno', 'comprobante_aprobado',
         'Comprobante aprobado',
         'Tu comprobante fue aprobado y la cuota quedó registrada como pagada.',
         '/alumno/pagos'
    from public.students s
   where s.id = v_proof.student_id and s.profile_id is not null;

  return v_receipt;
end;
$$;

create or replace function public.reject_payment_proof(p_proof_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.payment_proofs;
  v_actor uuid := (select auth.uid());
begin
  perform public.assert_admin('rechazar comprobantes');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Debe indicarse el motivo del rechazo';
  end if;

  select * into v_proof from public.payment_proofs where id = p_proof_id for update;
  if not found then
    raise exception 'El comprobante no existe';
  end if;
  if v_proof.status <> 'pendiente' then
    raise exception 'El comprobante ya fue %', v_proof.status;
  end if;

  update public.payment_proofs
     set status = 'rechazado', rejection_reason = p_reason,
         reviewed_by = v_actor, reviewed_at = now()
   where id = p_proof_id;

  -- La cuota vuelve a pendiente (o vencida si ya pasó el vencimiento).
  if v_proof.monthly_fee_id is not null then
    update public.monthly_fees
       set status = case
                      when due_date is not null and due_date < current_date then 'vencida'::public.fee_status
                      else 'pendiente'
                    end
     where id = v_proof.monthly_fee_id
       and status = 'comprobante_pendiente';
  else
    update public.registration_fees
       set status = case
                      when due_date is not null and due_date < current_date then 'vencida'::public.fee_status
                      else 'pendiente'
                    end
     where id = v_proof.registration_fee_id
       and status = 'comprobante_pendiente';
  end if;

  insert into public.notifications (profile_id, audience, type, title, body, link)
  select s.profile_id, 'alumno', 'comprobante_rechazado',
         'Comprobante rechazado',
         'Tu comprobante fue rechazado. Motivo: ' || p_reason,
         '/alumno/pagos'
    from public.students s
   where s.id = v_proof.student_id and s.profile_id is not null;
end;
$$;

-- Al subir un comprobante, la cuota pasa a 'comprobante_pendiente' y se avisa
-- a la administradora. Todavía NO se registra ingreso alguno.
create or replace function public.on_payment_proof_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.monthly_fee_id is not null then
    update public.monthly_fees
       set status = 'comprobante_pendiente'
     where id = new.monthly_fee_id
       and status in ('pendiente', 'vencida');
  else
    update public.registration_fees
       set status = 'comprobante_pendiente'
     where id = new.registration_fee_id
       and status in ('pendiente', 'vencida');
  end if;

  insert into public.notifications (audience, type, title, body, link, entity_type, entity_id)
  select 'admin', 'comprobante_subido',
         'Nuevo comprobante para revisar',
         coalesce(s.first_name || ' ' || s.last_name, 'Un alumno') || ' subió un comprobante.',
         '/admin/comprobantes', 'payment_proofs', new.id
    from public.students s
   where s.id = new.student_id;

  return new;
end;
$$;

create trigger trg_payment_proof_created
  after insert on public.payment_proofs
  for each row execute function public.on_payment_proof_created();

-- =============================================================================
-- Inmutabilidad de los movimientos ligados a pagos + reversos
-- =============================================================================
create or replace function public.guard_financial_movements()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and old.payment_id is not null)
     or (tg_op = 'DELETE' and old.payment_id is not null) then
    raise exception
      'Los movimientos originados en un pago no se modifican ni eliminan. Generá un movimiento de reverso.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_guard_financial_movements
  before update or delete on public.financial_movements
  for each row execute function public.guard_financial_movements();

-- Anula un pago: revierte el movimiento y devuelve la cuota a pendiente.
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_mov     public.financial_movements;
  v_actor   uuid := (select auth.uid());
begin
  perform public.assert_admin('anular pagos');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Debe indicarse el motivo de la anulación';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'El pago no existe';
  end if;
  if v_payment.status = 'anulado' then
    raise exception 'El pago ya fue anulado';
  end if;

  -- Movimiento de reverso por cada movimiento original del pago.
  for v_mov in
    select * from public.financial_movements where payment_id = p_payment_id and not is_reversal
  loop
    insert into public.financial_movements (
      type, movement_date, category_id, description, amount_cents,
      cash_account_id, payment_method_id, student_id,
      monthly_fee_id, registration_fee_id, workshop_id,
      is_reversal, reverses_movement_id, notes, created_by
    ) values (
      'gasto', current_date, v_mov.category_id,
      'Reverso: ' || coalesce(v_mov.description, 'pago anulado'), v_mov.amount_cents,
      v_mov.cash_account_id, v_mov.payment_method_id, v_mov.student_id,
      v_mov.monthly_fee_id, v_mov.registration_fee_id, v_mov.workshop_id,
      true, v_mov.id, p_reason, v_actor
    );
  end loop;

  update public.payments set status = 'anulado', notes = coalesce(notes || ' | ', '') || 'Anulado: ' || p_reason
   where id = p_payment_id;

  -- La cuota vuelve a estar impaga.
  update public.monthly_fees
     set status = case when due_date is not null and due_date < current_date then 'vencida'::public.fee_status else 'pendiente' end,
         paid_date = null, payment_id = null, receipt_id = null, receipt_number = null
   where payment_id = p_payment_id;

  update public.registration_fees
     set status = case when due_date is not null and due_date < current_date then 'vencida'::public.fee_status else 'pendiente' end,
         paid_date = null, payment_id = null, receipt_id = null, receipt_number = null
   where payment_id = p_payment_id;
end;
$$;

-- =============================================================================
-- Mercado Pago: confirmación desde el webhook (service_role)
-- Idempotente: si el mp_payment_id ya fue registrado, no vuelve a acreditar.
-- =============================================================================
create or replace function public.confirm_mercadopago_payment(
  p_fee_id           uuid,
  p_mp_payment_id    text,
  p_mp_status        text,
  p_amount_cents     bigint,
  p_mp_fee_cents     bigint default null,
  p_net_amount_cents bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_method   uuid;
  v_account  uuid;
  v_fee      public.monthly_fees;
begin
  -- Idempotencia: el mismo pago de MP nunca se acredita dos veces.
  select id into v_existing from public.payments where mp_payment_id = p_mp_payment_id;
  if v_existing is not null then
    return null;
  end if;

  select * into v_fee from public.monthly_fees where id = p_fee_id for update;
  if not found then
    raise exception 'La cuota % no existe', p_fee_id;
  end if;
  if v_fee.status = 'pagada' then
    return null;  -- ya estaba paga por otra vía
  end if;

  select id into v_method from public.payment_methods where code = 'mercadopago' limit 1;
  select id into v_account from public.cash_accounts
   where type = 'billetera_virtual' and is_active order by created_at limit 1;
  if v_account is null then
    select id into v_account from public.cash_accounts where is_active order by created_at limit 1;
  end if;

  return public.settle_monthly_fee(
    p_fee_id           => p_fee_id,
    p_method_id        => v_method,
    p_cash_account_id  => v_account,
    p_paid_at          => now(),
    p_external_reference => p_mp_payment_id,
    p_notes            => 'Pago acreditado por Mercado Pago',
    p_mp_payment_id    => p_mp_payment_id,
    p_mp_status        => p_mp_status,
    p_mp_fee_cents     => p_mp_fee_cents,
    p_net_amount_cents => p_net_amount_cents
  );
end;
$$;

-- =============================================================================
-- Permisos de ejecución
-- =============================================================================
revoke all on function public.record_payment_with_receipt(uuid, bigint, uuid, uuid, text, text, text, timestamptz, text, text, text, bigint, bigint, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_mercadopago_payment(uuid, text, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.next_receipt_number() from public, anon;

grant execute on function public.generate_monthly_fees(int, int) to authenticated;
grant execute on function public.mark_overdue_fees() to authenticated;
grant execute on function public.settle_monthly_fee(uuid, uuid, uuid, timestamptz, text, text, text, text, bigint, bigint, uuid) to authenticated;
grant execute on function public.settle_registration_fee(uuid, uuid, uuid, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.approve_payment_proof(uuid, uuid, uuid) to authenticated;
grant execute on function public.reject_payment_proof(uuid, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.student_monthly_amount_cents(uuid) to authenticated;
grant execute on function public.fee_amount_for_period(uuid, int, int) to authenticated;
