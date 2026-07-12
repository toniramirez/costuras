-- =============================================================================
-- Costura AP · Migración 0019 · Los movimientos de reverso también son inmutables
-- -----------------------------------------------------------------------------
-- AGUJERO EN LA CONTABILIDAD.
--
-- `guard_financial_movements` impide editar o borrar un movimiento originado en
-- un pago, y lo detecta preguntando `old.payment_id is not null`.
--
-- Pero `void_payment()` inserta el movimiento de REVERSO **sin** payment_id
-- (a propósito: no nace de un pago, lo deshace). O sea que el reverso caía fuera
-- del chequeo y quedaba editable y borrable.
--
-- Consecuencia real: la administradora podía borrar un reverso desde la API y la
-- caja quedaba descuadrada **en silencio**, sin rastro de la anulación. Y la RLS
-- no lo frena: sobre financial_movements tiene política FOR ALL.
--
-- Un reverso es el rastro contable de una anulación. Se agrega, nunca se retoca.
-- =============================================================================
create or replace function public.guard_financial_movements()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then

    -- 1) Movimiento nacido de un pago.
    if old.payment_id is not null then
      raise exception
        'Los movimientos originados en un pago no se modifican ni se eliminan. Generá un movimiento de reverso.';
    end if;

    -- 2) Movimiento de reverso. Es el rastro de una anulación: se conserva.
    if old.is_reversal then
      raise exception
        'Un movimiento de reverso no se modifica ni se elimina: es el rastro contable de una anulación.';
    end if;

  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.guard_financial_movements() is
  'Hace inmutables los movimientos nacidos de un pago Y los reversos. Las correcciones se hacen agregando, nunca borrando.';
