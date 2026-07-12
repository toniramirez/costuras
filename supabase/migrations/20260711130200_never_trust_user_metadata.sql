-- =============================================================================
-- Costura AP · Migración 0018 · El rol NUNCA sale de los metadatos del usuario
-- -----------------------------------------------------------------------------
-- ESCALADA DE PRIVILEGIOS.
--
-- handle_new_user() tomaba el rol de raw_user_meta_data. Esos metadatos los
-- controla QUIEN SE REGISTRA, no el servidor. Con el registro público activado
-- (que es el valor por defecto de Supabase), cualquiera podía hacer:
--
--   supabase.auth.signUp({
--     email, password,
--     options: { data: { role: 'admin' } }     <-- se lo cree el trigger
--   })
--
-- …y quedaba como administradora, con acceso total a la academia.
--
-- Ahora TODO usuario nace como 'alumno'. Ascender a administradora es una
-- operación privilegiada aparte (service_role o SQL Editor): jamás algo que el
-- propio usuario pueda pedir para sí mismo.
--
-- Se complementa con el registro público DESHABILITADO en la configuración de
-- Auth (npm run auth:harden). Dos barreras independientes.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone, must_change_password)
  values (
    new.id,
    'alumno',   -- SIEMPRE. Nunca se lee de raw_user_meta_data.
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea el profile de cada usuario nuevo. SIEMPRE con rol alumno: el rol jamás se toma de los metadatos, que controla el propio usuario.';
