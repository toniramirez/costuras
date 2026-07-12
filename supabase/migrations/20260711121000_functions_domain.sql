-- =============================================================================
-- Costura AP · Migración 0011 · Lógica de dominio
--   Recuperaciones (sin doble uso) · Talleres (cupo + lista de espera) ·
--   Notificaciones internas · Auditoría automática
-- =============================================================================

-- =============================================================================
-- RECUPERACIONES
-- =============================================================================

-- Genera un crédito de recuperación a partir de una ausencia justificada.
create or replace function public.issue_recovery_credit(
  p_attendance_id uuid,
  p_reason        text default null,
  p_force         boolean default false   -- excepción manual de la administradora
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att      public.attendance;
  v_session  public.class_sessions;
  v_settings public.academy_settings;
  v_id       uuid;
begin
  perform public.assert_admin('generar créditos de recuperación');

  select * into v_att from public.attendance where id = p_attendance_id;
  if not found then
    raise exception 'No existe el registro de asistencia';
  end if;

  if v_att.status <> 'ausente_justificada' and not p_force then
    raise exception 'Solo las ausencias justificadas generan recuperación (usá la excepción manual si corresponde)';
  end if;

  -- Un mismo registro de asistencia no puede generar dos créditos vigentes.
  if exists (
    select 1 from public.recovery_credits
     where origin_attendance_id = p_attendance_id
       and status in ('disponible', 'reservada', 'utilizada')
  ) then
    raise exception 'Esa ausencia ya tiene un crédito de recuperación';
  end if;

  select * into v_settings from public.academy_settings where id = 1;
  select * into v_session from public.class_sessions where id = v_att.class_session_id;

  insert into public.recovery_credits (
    student_id, origin_attendance_id, origin_session_id, reason,
    status, expires_at, created_by
  ) values (
    v_att.student_id, p_attendance_id, v_att.class_session_id, p_reason,
    'disponible',
    coalesce(v_session.session_date, current_date) + v_settings.recovery_validity_days,
    (select auth.uid())
  )
  returning id into v_id;

  insert into public.notifications (profile_id, audience, type, title, body, link)
  select s.profile_id, 'alumno', 'recuperacion_aprobada',
         'Recuperación disponible',
         'Tenés un crédito de recuperación disponible. Coordiná tu clase antes del vencimiento.',
         '/alumno/recuperaciones'
    from public.students s
   where s.id = v_att.student_id and s.profile_id is not null;

  return v_id;
end;
$$;

-- Reserva el crédito en otro grupo/fecha. Exige cupo disponible.
create or replace function public.reserve_recovery_credit(
  p_credit_id uuid,
  p_group_id  uuid,
  p_date      date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit    public.recovery_credits;
  v_occupancy record;
begin
  perform public.assert_admin('reservar recuperaciones');

  select * into v_credit from public.recovery_credits where id = p_credit_id for update;
  if not found then
    raise exception 'El crédito de recuperación no existe';
  end if;
  if v_credit.status <> 'disponible' then
    raise exception 'El crédito está % y no puede reservarse', v_credit.status;
  end if;
  if v_credit.expires_at < p_date then
    raise exception 'El crédito vence el % y la fecha elegida es posterior', v_credit.expires_at;
  end if;

  -- No se puede reservar en un grupo sin cupo.
  select * into v_occupancy from public.group_occupancy where group_id = p_group_id;
  if not found then
    raise exception 'El grupo no existe';
  end if;
  if v_occupancy.is_full then
    raise exception 'El grupo "%" no tiene cupo disponible', v_occupancy.name;
  end if;

  update public.recovery_credits
     set status = 'reservada', reserved_group_id = p_group_id, reserved_date = p_date
   where id = p_credit_id;
end;
$$;

-- Consume el crédito: crea/actualiza la asistencia como 'recuperacion'.
-- Un crédito NUNCA puede usarse dos veces (estado + índice único).
create or replace function public.use_recovery_credit(
  p_credit_id uuid,
  p_group_id  uuid,
  p_date      date
)
returns uuid   -- attendance id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit  public.recovery_credits;
  v_session uuid;
  v_att     uuid;
  v_actor   uuid := (select auth.uid());
begin
  perform public.assert_admin('registrar el uso de una recuperación');

  select * into v_credit from public.recovery_credits where id = p_credit_id for update;
  if not found then
    raise exception 'El crédito de recuperación no existe';
  end if;
  if v_credit.status not in ('disponible', 'reservada') then
    raise exception 'El crédito está % y no puede utilizarse', v_credit.status;
  end if;

  -- Clase destino (se crea si no existía).
  insert into public.class_sessions (group_id, session_date, start_time, end_time, created_by)
  select g.id, p_date, g.start_time, g.end_time, v_actor
    from public.groups g where g.id = p_group_id
  on conflict (group_id, session_date) do nothing;

  select id into v_session from public.class_sessions
   where group_id = p_group_id and session_date = p_date;

  -- Asistencia como recuperación.
  insert into public.attendance (
    class_session_id, student_id, group_id, status, observation,
    recorded_by, is_recovery, recovery_credit_id
  ) values (
    v_session, v_credit.student_id, p_group_id, 'recuperacion',
    'Clase de recuperación', v_actor, true, p_credit_id
  )
  on conflict (class_session_id, student_id) do update
     set status = 'recuperacion', is_recovery = true, recovery_credit_id = p_credit_id
  returning id into v_att;

  update public.recovery_credits
     set status = 'utilizada', used_attendance_id = v_att, used_at = now()
   where id = p_credit_id;

  return v_att;
end;
$$;

create or replace function public.cancel_recovery_credit(p_credit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin('cancelar recuperaciones');

  update public.recovery_credits
     set status = 'cancelada', canceled_at = now(), cancel_reason = p_reason
   where id = p_credit_id
     and status in ('disponible', 'reservada');

  if not found then
    raise exception 'El crédito no existe o no puede cancelarse en su estado actual';
  end if;
end;
$$;

-- Vence créditos pasados de fecha (llamar por cron).
create or replace function public.expire_recovery_credits()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  update public.recovery_credits
     set status = 'vencida'
   where status in ('disponible', 'reservada')
     and expires_at < current_date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Avisos de vencimiento próximo (cuotas y recuperaciones). Para cron diario.
create or replace function public.notify_upcoming_expirations(p_days_ahead int default 5)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int := 0; v_c int;
begin
  -- Recuperaciones próximas a vencer -> alumno + admin
  insert into public.notifications (profile_id, audience, type, title, body, link, entity_type, entity_id)
  select s.profile_id, 'alumno', 'recuperacion_por_vencer',
         'Tu recuperación está por vencer',
         'Tenés una recuperación que vence el ' || to_char(rc.expires_at, 'DD/MM/YYYY') || '.',
         '/alumno/recuperaciones', 'recovery_credits', rc.id
    from public.recovery_credits rc
    join public.students s on s.id = rc.student_id
   where rc.status in ('disponible', 'reservada')
     and rc.expires_at between current_date and current_date + p_days_ahead
     and s.profile_id is not null
     and not exists (
       select 1 from public.notifications n
        where n.entity_type = 'recovery_credits' and n.entity_id = rc.id
          and n.type = 'recuperacion_por_vencer'
     );
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- Cuotas próximas a vencer -> alumno
  insert into public.notifications (profile_id, audience, type, title, body, link, entity_type, entity_id)
  select s.profile_id, 'alumno', 'cuota_por_vencer',
         'Tu cuota está por vencer',
         'La cuota vence el ' || to_char(mf.due_date, 'DD/MM/YYYY') || '.',
         '/alumno/pagos', 'monthly_fees', mf.id
    from public.monthly_fees mf
    join public.students s on s.id = mf.student_id
   where mf.status = 'pendiente'
     and mf.due_date between current_date and current_date + p_days_ahead
     and s.profile_id is not null
     and not exists (
       select 1 from public.notifications n
        where n.entity_type = 'monthly_fees' and n.entity_id = mf.id
          and n.type = 'cuota_por_vencer'
     );
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- Cuotas vencidas -> admin
  insert into public.notifications (audience, type, title, body, link, entity_type, entity_id)
  select 'admin', 'cuota_vencida',
         'Cuota vencida',
         s.first_name || ' ' || s.last_name || ' tiene una cuota vencida.',
         '/admin/cuotas', 'monthly_fees', mf.id
    from public.monthly_fees mf
    join public.students s on s.id = mf.student_id
   where mf.status = 'vencida'
     and not exists (
       select 1 from public.notifications n
        where n.entity_type = 'monthly_fees' and n.entity_id = mf.id
          and n.type = 'cuota_vencida'
     );
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return v_n;
end;
$$;

-- =============================================================================
-- TALLERES: cupo y lista de espera
-- =============================================================================

-- El cupo se ocupa solo con inscripciones confirmadas (pagadas) o asistidas.
create or replace function public.workshop_confirmed_count(p_workshop_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.workshop_registrations
   where workshop_id = p_workshop_id
     and status in ('confirmada', 'asistio');
$$;

-- Inscribe a un alumno o a una persona externa. Si no hay cupo -> lista de espera.
create or replace function public.register_to_workshop(
  p_workshop_id uuid,
  p_student_id  uuid default null,
  p_first_name  text default null,
  p_last_name   text default null,
  p_phone       text default null,
  p_email       text default null,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws      public.workshops;
  v_taken   int;
  v_status  public.workshop_reg_status;
  v_pos     int;
  v_id      uuid;
begin
  perform public.assert_admin('inscribir personas a un taller');

  select * into v_ws from public.workshops where id = p_workshop_id for update;
  if not found then
    raise exception 'El taller no existe';
  end if;
  if v_ws.status in ('cancelado', 'finalizado') then
    raise exception 'El taller está % y no admite inscripciones', v_ws.status;
  end if;

  v_taken := public.workshop_confirmed_count(p_workshop_id);

  if v_ws.capacity > 0 and v_taken >= v_ws.capacity then
    -- Cupo completo -> lista de espera respetando el orden de llegada.
    v_status := 'lista_espera';
    select coalesce(max(waitlist_position), 0) + 1 into v_pos
      from public.workshop_registrations
     where workshop_id = p_workshop_id and status = 'lista_espera';
  elsif v_ws.price_cents = 0 then
    v_status := 'confirmada';   -- taller gratuito: se confirma directo
    v_pos := null;
  else
    v_status := 'pendiente_pago';
    v_pos := null;
  end if;

  insert into public.workshop_registrations (
    workshop_id, student_id, external_first_name, external_last_name,
    external_phone, external_email, notes, status, waitlist_position,
    amount_cents, created_by
  ) values (
    p_workshop_id, p_student_id, p_first_name, p_last_name,
    p_phone, p_email, p_notes, v_status, v_pos,
    v_ws.price_cents, (select auth.uid())
  )
  returning id into v_id;

  insert into public.notifications (audience, type, title, body, link, entity_type, entity_id)
  values ('admin', 'inscripcion_taller', 'Nueva inscripción a taller',
          'Se cargó una inscripción en "' || v_ws.name || '".',
          '/admin/talleres/' || p_workshop_id, 'workshop_registrations', v_id);

  return v_id;
end;
$$;

-- Confirma la inscripción registrando el pago. Recién ahí ocupa el cupo.
create or replace function public.confirm_workshop_registration(
  p_registration_id uuid,
  p_method_id       uuid,
  p_cash_account_id uuid,
  p_paid_at         timestamptz default now(),
  p_reference       text default null
)
returns uuid   -- receipt id (null si el taller es gratuito)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg     public.workshop_registrations;
  v_ws      public.workshops;
  v_taken   int;
  v_res     record;
  v_actor   uuid := (select auth.uid());
begin
  perform public.assert_admin('confirmar inscripciones');

  select * into v_reg from public.workshop_registrations where id = p_registration_id for update;
  if not found then
    raise exception 'La inscripción no existe';
  end if;
  if v_reg.status = 'confirmada' then
    raise exception 'La inscripción ya está confirmada';
  end if;
  if v_reg.status = 'cancelada' then
    raise exception 'La inscripción está cancelada';
  end if;

  select * into v_ws from public.workshops where id = v_reg.workshop_id for update;

  v_taken := public.workshop_confirmed_count(v_reg.workshop_id);
  if v_ws.capacity > 0 and v_taken >= v_ws.capacity then
    raise exception 'El taller "%" ya tiene el cupo completo', v_ws.name;
  end if;

  if v_reg.amount_cents > 0 then
    select * into v_res from public.record_payment_with_receipt(
      p_student_id      => v_reg.student_id,
      p_amount_cents    => v_reg.amount_cents,
      p_method_id       => p_method_id,
      p_cash_account_id => coalesce(p_cash_account_id, v_ws.cash_account_id),
      p_concept         => 'Taller: ' || v_ws.name,
      p_period_label    => to_char(coalesce(v_ws.event_date, current_date), 'DD/MM/YYYY'),
      p_category_name   => 'Talleres',
      p_paid_at         => p_paid_at,
      p_external_reference => p_reference,
      p_workshop_id     => v_reg.workshop_id,
      p_created_by      => v_actor
    );

    update public.workshop_registrations
       set status = 'confirmada', waitlist_position = null, payment_id = v_res.payment_id
     where id = p_registration_id;
  else
    update public.workshop_registrations
       set status = 'confirmada', waitlist_position = null
     where id = p_registration_id;
  end if;

  -- ¿Se completó el cupo con esta confirmación?
  if v_ws.capacity > 0 and public.workshop_confirmed_count(v_reg.workshop_id) >= v_ws.capacity then
    update public.workshops set status = 'cupo_completo'
     where id = v_reg.workshop_id and status <> 'cupo_completo';

    insert into public.notifications (audience, type, title, body, link, entity_type, entity_id)
    values ('admin', 'taller_cupo_completo', 'Taller con cupo completo',
            'El taller "' || v_ws.name || '" alcanzó su cupo máximo.',
            '/admin/talleres/' || v_ws.id, 'workshops', v_ws.id);
  end if;

  if v_reg.amount_cents > 0 then
    return v_res.receipt_id;
  end if;
  return null;
end;
$$;

-- Promueve al primero de la lista de espera. No confirma: pasa a pendiente de pago.
create or replace function public.promote_from_waitlist(p_workshop_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.workshop_registrations;
  v_ws  public.workshops;
begin
  perform public.assert_admin('promover desde la lista de espera');

  select * into v_ws from public.workshops where id = p_workshop_id;

  if v_ws.capacity > 0
     and public.workshop_confirmed_count(p_workshop_id) >= v_ws.capacity then
    raise exception 'No hay lugar disponible para promover: el cupo sigue completo';
  end if;

  select * into v_reg
    from public.workshop_registrations
   where workshop_id = p_workshop_id and status = 'lista_espera'
   order by waitlist_position nulls last, registered_at
   limit 1
   for update;

  if not found then
    raise exception 'No hay nadie en la lista de espera';
  end if;

  update public.workshop_registrations
     set status = case when amount_cents = 0 then 'confirmada'::public.workshop_reg_status else 'pendiente_pago' end,
         waitlist_position = null
   where id = v_reg.id;

  -- El taller vuelve a admitir inscripciones.
  update public.workshops set status = 'inscripcion_abierta'
   where id = p_workshop_id and status = 'cupo_completo';

  return v_reg.id;
end;
$$;

-- =============================================================================
-- NOTIFICACIÓN: grupo que alcanza su cupo
-- =============================================================================
create or replace function public.on_student_group_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_occ record;
begin
  if new.group_id is null or new.group_id is not distinct from old.group_id then
    return new;
  end if;

  select * into v_occ from public.group_occupancy where group_id = new.group_id;

  if v_occ.is_full then
    insert into public.notifications (audience, type, title, body, link, entity_type, entity_id)
    values ('admin', 'grupo_cupo_completo', 'Grupo con cupo completo',
            'El grupo "' || v_occ.name || '" alcanzó su cupo máximo (' || v_occ.capacity || ').',
            '/admin/grupos', 'groups', new.group_id);
  end if;

  return new;
end;
$$;

create trigger trg_student_group_assigned
  after insert or update of group_id on public.students
  for each row execute function public.on_student_group_assigned();

-- =============================================================================
-- AUDITORÍA AUTOMÁTICA
-- =============================================================================
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_role  public.app_role;
  v_old   jsonb;
  v_new   jsonb;
  v_id    text;
begin
  select p.email, p.role into v_email, v_role from public.profiles p where p.id = v_actor;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id  := (to_jsonb(old) ->> 'id');
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_id  := (to_jsonb(new) ->> 'id');
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id  := (to_jsonb(new) ->> 'id');
    if v_old = v_new then
      return new;   -- nada cambió realmente
    end if;
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_email, actor_role, action,
    entity_type, entity_id, old_values, new_values
  ) values (
    v_actor, v_email, v_role, lower(tg_op),
    tg_table_name, v_id, v_old, v_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Tablas auditadas (acciones importantes según especificación).
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.audit_trigger();

create trigger trg_audit_monthly_fees
  after insert or update or delete on public.monthly_fees
  for each row execute function public.audit_trigger();

create trigger trg_audit_registration_fees
  after insert or update or delete on public.registration_fees
  for each row execute function public.audit_trigger();

create trigger trg_audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.audit_trigger();

create trigger trg_audit_payment_proofs
  after insert or update or delete on public.payment_proofs
  for each row execute function public.audit_trigger();

create trigger trg_audit_cash_accounts
  after insert or update or delete on public.cash_accounts
  for each row execute function public.audit_trigger();

create trigger trg_audit_recovery_credits
  after insert or update or delete on public.recovery_credits
  for each row execute function public.audit_trigger();

create trigger trg_audit_rates
  after insert or update or delete on public.rates
  for each row execute function public.audit_trigger();

create trigger trg_audit_plans
  after insert or update or delete on public.plans
  for each row execute function public.audit_trigger();

create trigger trg_audit_groups
  after insert or update or delete on public.groups
  for each row execute function public.audit_trigger();

-- =============================================================================
-- Permisos de ejecución
-- =============================================================================
grant execute on function public.issue_recovery_credit(uuid, text, boolean) to authenticated;
grant execute on function public.reserve_recovery_credit(uuid, uuid, date) to authenticated;
grant execute on function public.use_recovery_credit(uuid, uuid, date) to authenticated;
grant execute on function public.cancel_recovery_credit(uuid, text) to authenticated;
grant execute on function public.expire_recovery_credits() to authenticated;
grant execute on function public.notify_upcoming_expirations(int) to authenticated;
grant execute on function public.workshop_confirmed_count(uuid) to authenticated;
grant execute on function public.register_to_workshop(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.confirm_workshop_registration(uuid, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.promote_from_waitlist(uuid) to authenticated;
