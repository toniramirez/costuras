-- =============================================================================
-- Costura AP · Migración 0016 · Endurecimiento de seguridad
-- -----------------------------------------------------------------------------
-- Corrige hallazgos del analizador de seguridad de Supabase.
--
-- EL GRAVE ────────────────────────────────────────────────────────────────────
-- PostgreSQL concede EXECUTE a PUBLIC por defecto en toda función nueva, y el
-- rol `anon` es miembro de PUBLIC. Es decir: un usuario SIN SESIÓN podía invocar
-- /rest/v1/rpc/approve_payment_proof, settle_monthly_fee, void_payment,
-- generate_monthly_fees, etc.
--
-- Y el guardia no lo frenaba: assert_admin() daba por buena la llamada cuando
-- auth.uid() era NULL (pensado para el servidor con service_role)… pero para
-- `anon` auth.uid() TAMBIÉN es NULL.
--
-- Se corrige por partida doble:
--   1. Se revoca EXECUTE a PUBLIC y anon sobre TODAS las funciones propias.
--   2. assert_admin() ahora distingue explícitamente el rol de la petición.
-- Cualquiera de las dos alcanzaría; tener las dos es defensa en profundidad.
-- =============================================================================

-- =============================================================================
-- 1) Nadie ejecuta funciones de public por defecto
-- -----------------------------------------------------------------------------
-- Se revoca UNA POR UNA y solo sobre las funciones PROPIAS: un
-- `revoke ... on all functions` alcanzaría también a las que instala citext y
-- rompería las comparaciones de columnas citext para los usuarios normales.
-- =============================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- Excluye lo que pertenece a una extensión (citext y compañía).
       and not exists (
         select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
       )
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('revoke execute on function %s from anon', f.firma);
  end loop;
end $$;

-- Las funciones que se creen en el futuro tampoco quedan abiertas por defecto.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- =============================================================================
-- 2) Rol de la petición: anon / authenticated / service_role
-- -----------------------------------------------------------------------------
-- PostgREST deja el rol en un GUC de sesión, legible incluso dentro de una
-- función SECURITY DEFINER (donde current_user ya es el dueño, no quien llama).
-- Devuelve NULL en una conexión directa a la base (no hay PostgREST de por medio).
-- =============================================================================
create or replace function public.request_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

comment on function public.request_role() is
  'Rol de la petición (anon/authenticated/service_role). NULL si es conexión directa.';

-- =============================================================================
-- 3) assert_admin(), ahora sí a prueba de anónimos
-- =============================================================================
create or replace function public.assert_admin(p_action text default 'realizar esta acción')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Administradora autenticada: adelante.
  if public.is_admin() then
    return;
  end if;

  -- Anónimo: bloqueado SIEMPRE. (Además ya no tiene EXECUTE, pero no nos
  -- apoyamos en una sola barrera.)
  if public.request_role() = 'anon' then
    raise exception 'Solo la administradora puede %', p_action;
  end if;

  -- Autenticado que no es admin (un alumno): bloqueado.
  if (select auth.uid()) is not null then
    raise exception 'Solo la administradora puede %', p_action;
  end if;

  -- No hay usuario final y no es anon => servidor de confianza:
  -- service_role (cron de cuotas, webhook de Mercado Pago) o conexión directa.
  return;
end;
$$;

-- =============================================================================
-- 4) Permisos explícitos. Solo authenticated y service_role.
-- =============================================================================

-- Helpers de RLS: authenticated DEBE poder ejecutarlos, porque las políticas se
-- evalúan con sus permisos. Sin esto, toda consulta suya fallaría.
grant execute on function public.is_admin()               to authenticated, service_role;
grant execute on function public.is_staff()               to authenticated, service_role;
grant execute on function public.current_student_id()     to authenticated, service_role;
grant execute on function public.current_app_role()       to authenticated, service_role;
grant execute on function public.request_role()           to authenticated, service_role;
grant execute on function public.assert_admin(text)       to authenticated, service_role;

-- Operaciones de administración (el guardia interno decide si pasan).
grant execute on function public.generate_monthly_fees(int, int)        to authenticated, service_role;
grant execute on function public.mark_overdue_fees()                    to authenticated, service_role;
grant execute on function public.student_monthly_amount_cents(uuid)     to authenticated, service_role;
grant execute on function public.fee_amount_for_period(uuid, int, int)  to authenticated, service_role;
grant execute on function public.settle_monthly_fee(uuid, uuid, uuid, timestamptz, text, text, text, text, bigint, bigint, uuid) to authenticated, service_role;
grant execute on function public.settle_registration_fee(uuid, uuid, uuid, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.approve_payment_proof(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.reject_payment_proof(uuid, text)        to authenticated, service_role;
grant execute on function public.void_payment(uuid, text)                to authenticated, service_role;

grant execute on function public.issue_recovery_credit(uuid, text, boolean)  to authenticated, service_role;
grant execute on function public.reserve_recovery_credit(uuid, uuid, date)   to authenticated, service_role;
grant execute on function public.use_recovery_credit(uuid, uuid, date)       to authenticated, service_role;
grant execute on function public.cancel_recovery_credit(uuid, text)          to authenticated, service_role;
grant execute on function public.expire_recovery_credits()                   to authenticated, service_role;
grant execute on function public.notify_upcoming_expirations(int)            to authenticated, service_role;
grant execute on function public.workshop_confirmed_count(uuid)              to authenticated, service_role;
grant execute on function public.register_to_workshop(uuid, uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.confirm_workshop_registration(uuid, uuid, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.promote_from_waitlist(uuid)                 to authenticated, service_role;

-- SOLO el servidor. Jamás desde el navegador, ni siquiera autenticado.
grant execute on function public.record_payment_with_receipt(uuid, bigint, uuid, uuid, text, text, text, timestamptz, text, text, text, bigint, bigint, text, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.confirm_mercadopago_payment(uuid, text, text, bigint, bigint, bigint) to service_role;
grant execute on function public.next_receipt_number() to service_role;

-- =============================================================================
-- 5) search_path fijo en las funciones de trigger que faltaban
-- =============================================================================
alter function public.set_updated_at() set search_path = '';
alter function public.guard_financial_movements() set search_path = '';

-- =============================================================================
-- 6) El bucket público no necesita política de listado
-- -----------------------------------------------------------------------------
-- Un bucket público sirve los archivos por URL directa, sin pasar por RLS. La
-- política de SELECT solo servía para permitir LISTAR todo el contenido del
-- bucket, que es más de lo que queremos exponer. La administradora sigue
-- pudiendo listarlo con la política branding_admin_write (FOR ALL).
-- =============================================================================
drop policy if exists "branding_public_read" on storage.objects;
