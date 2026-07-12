-- =============================================================================
-- Costura AP · Migración 0003b · Funciones helper de autorización
-- -----------------------------------------------------------------------------
-- Son el corazón de la RLS. Van DESPUÉS de profiles y students porque son
-- funciones `language sql`: PostgreSQL valida su cuerpo al crearlas y necesita
-- que esas tablas ya existan.
--
-- SECURITY DEFINER + search_path='' cumple dos propósitos:
--   1) Evita la recursión infinita de RLS: una política sobre profiles que llame
--      a is_admin() no vuelve a disparar la RLS de profiles (la función corre con
--      los permisos del owner y la saltea).
--   2) Impide el secuestro de search_path (todo va calificado por esquema).
--
-- Se declaran STABLE para que el planner las evalúe una sola vez por consulta.
-- =============================================================================

-- Rol del usuario autenticado (o null si no hay sesión / no tiene perfil).
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
   limit 1;
$$;

-- ¿El usuario autenticado es la administradora?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- ¿Es parte del staff (admin o profesor)? Preparado para el rol futuro.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('admin', 'profesor') from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- students.id del alumno asociado al usuario autenticado, o null.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from public.students s
   where s.profile_id = (select auth.uid())
   limit 1;
$$;

-- Guardia de administración para las funciones de negocio (SECURITY DEFINER).
--
-- IMPORTANTE — por qué no alcanza con "if not is_admin() then raise":
--   Cuando el servidor llama con service_role (rutas seguras, webhook de Mercado
--   Pago, cron de generación de cuotas) NO hay usuario final: auth.uid() es NULL
--   y is_admin() devuelve false. Un chequeo ingenuo bloquearía al propio servidor.
--
-- Regla: si hay un usuario final autenticado, debe ser admin. Si no lo hay, la
-- llamada viene del servidor de confianza (que ya validó permisos antes).
-- Un alumno queda bloqueado porque su auth.uid() SÍ está seteado y no es admin.
-- Un anónimo ni siquiera llega: no tiene GRANT de EXECUTE ni políticas RLS.
--
-- NO usar esta función dentro de políticas RLS (ahí auth.uid() NULL = anónimo).
create or replace function public.assert_admin(p_action text default 'realizar esta acción')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo la administradora puede %', p_action;
  end if;
end;
$$;

comment on function public.is_admin() is 'True si el usuario autenticado tiene rol admin. Usada por RLS.';
comment on function public.current_student_id() is 'students.id del usuario autenticado (o null). Usada por la RLS del portal del alumno.';
comment on function public.assert_admin(text) is 'Guardia para funciones de negocio: exige admin cuando hay usuario final; permite al servidor (service_role).';

grant execute on function public.current_app_role()  to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.is_staff()          to authenticated;
grant execute on function public.current_student_id() to authenticated;
