-- =============================================================================
-- Costura AP · Migración 0014 · Permisos a nivel tabla (defensa en profundidad)
-- -----------------------------------------------------------------------------
-- La RLS filtra FILAS, pero los GRANT controlan si el rol puede tocar la tabla.
-- Ser explícitos acá evita depender de los "default privileges" del proyecto y
-- deja el esquema portable.
--
--   anon          -> SIN acceso a datos. El login pasa por la API de Auth.
--   authenticated -> acceso a nivel tabla; la RLS decide qué filas ve.
--   service_role  -> lo usa solo el servidor (rutas seguras); saltea RLS.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Usuarios autenticados: la RLS es la que realmente filtra.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Servidor (rutas seguras con service_role).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- anon no lee NADA del esquema public.
revoke all on all tables in schema public from anon;

-- La auditoría es inmutable: ni siquiera un error en una política puede
-- permitir que se altere. Solo entran filas vía triggers SECURITY DEFINER.
revoke insert, update, delete on public.audit_logs from authenticated;

-- Los recibos no se editan ni se borran desde el cliente: los emite el servidor.
revoke delete on public.payment_receipts from authenticated;

-- Tablas futuras: mismos permisos por defecto.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
