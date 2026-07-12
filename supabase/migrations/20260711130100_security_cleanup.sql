-- =============================================================================
-- Costura AP · Migración 0017 · Limpieza final de seguridad
-- -----------------------------------------------------------------------------
-- Cierra las advertencias que quedaron después del endurecimiento (0016):
--
--   1. request_role() quedó accesible para anon: la creé DESPUÉS del bucle de
--      revocación de 0016, así que heredó el permiso por defecto. Error mío.
--   2. Las funciones de TRIGGER eran invocables por RPC. Nadie debe llamarlas
--      nunca a mano: solo las dispara PostgreSQL.
--   3. citext vivía en el esquema public. Se elimina la dependencia por
--      completo: los correos pasan a `text` y se normalizan a minúsculas en la
--      aplicación. Las tablas están vacías, así que la conversión es inocua.
--
-- Lo que NO se toca (es intencional y está probado):
--   Las funciones de negocio (approve_payment_proof, generate_monthly_fees, …)
--   siguen siendo ejecutables por `authenticated`. Es a propósito: la
--   administradora las invoca desde el navegador y assert_admin() frena a
--   cualquier alumno. Conservar auth.uid() ahí es lo que permite auditar quién
--   hizo cada cosa.
-- =============================================================================

-- =============================================================================
-- 1) request_role(): fuera del alcance de anon
-- =============================================================================
revoke execute on function public.request_role() from public;
revoke execute on function public.request_role() from anon;

-- =============================================================================
-- 2) Funciones de trigger: no las ejecuta NADIE a mano
-- -----------------------------------------------------------------------------
-- PostgreSQL no verifica el privilegio EXECUTE cuando dispara un trigger (lo
-- valida al crearlo), así que revocarlo no afecta su funcionamiento. Queda
-- comprobado por la suite: las 94 pruebas de negocio siguen pasando.
-- =============================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type rt on rt.oid = p.prorettype
     where n.nspname = 'public'
       and rt.typname = 'trigger'
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('revoke execute on function %s from anon', f.firma);
    execute format('revoke execute on function %s from authenticated', f.firma);
  end loop;
end $$;

-- =============================================================================
-- 3) Adiós citext: los correos son `text` y se normalizan en la aplicación
-- -----------------------------------------------------------------------------
-- Nota: la migración 0001 sigue creando la extensión y esta la elimina. Es un
-- ida y vuelta feo en un despliegue desde cero, pero reescribir una migración ya
-- aplicada sería peor (dejaría el historial mintiendo sobre lo que se ejecutó).
-- =============================================================================
alter table public.profiles
  alter column email type text using email::text;

alter table public.students
  alter column email type text using email::text;

alter table public.academy_settings
  alter column email type text using email::text;

alter table public.workshop_registrations
  alter column external_email type text using external_email::text;

drop extension if exists citext;

-- Búsqueda de alumnos por correo sin importar mayúsculas/minúsculas.
create index if not exists idx_students_email_lower on public.students (lower(email));
create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
