-- =============================================================================
-- Costura AP · Migración 0021 · Los meses, en español
-- -----------------------------------------------------------------------------
-- `to_char(fecha, 'TMMonth')` traduce el mes usando el LOCALE de la base
-- (lc_time). El de Supabase es inglés, así que devolvía "June", "July"…
--
-- Eso se veía en dos lugares:
--   · Las notificaciones: «Se emitió tu cuota de July 2026».
--   · **Los RECIBOS en PDF**: el concepto y el período salían como
--     «Cuota June 2026». Un comprobante impreso, en una academia argentina,
--     con el mes en inglés.
--
-- No se arregla cambiando el locale de la base (no lo controlamos y afectaría a
-- todo lo demás): se arma el nombre a mano. Un mes tiene doce valores posibles.
-- =============================================================================

create or replace function public.nombre_mes(p_month int)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array[
    'Enero', 'Febrero', 'Marzo',     'Abril',   'Mayo',      'Junio',
    'Julio', 'Agosto',  'Septiembre','Octubre', 'Noviembre', 'Diciembre'
  ])[p_month];
$$;

comment on function public.nombre_mes(int) is
  'Nombre del mes en español. No usar to_char(TMMonth): depende del locale de la base, que está en inglés.';

grant execute on function public.nombre_mes(int) to authenticated, service_role;

-- ── Notificación de cuota emitida ───────────────────────────────────────────
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

      insert into public.notifications (profile_id, audience, type, title, body, link)
      select s.profile_id, 'alumno', 'cuota_generada',
             'Nueva cuota emitida',
             'Se emitió tu cuota de ' || public.nombre_mes(p_month) || ' ' || p_year || '.',
             '/alumno/pagos'
        from public.students s
       where s.id = r.id and s.profile_id is not null;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return query select v_created, v_skipped;
end;
$$;

-- ── Concepto y período del RECIBO ───────────────────────────────────────────
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

  -- El período va al recibo: tiene que decir "Junio 2026", no "June 2026".
  v_label := public.nombre_mes(v_fee.period_month) || ' ' || v_fee.period_year;

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

grant execute on function public.settle_monthly_fee(uuid, uuid, uuid, timestamptz, text, text, text, text, bigint, bigint, uuid) to authenticated, service_role;
grant execute on function public.generate_monthly_fees(int, int) to authenticated, service_role;
