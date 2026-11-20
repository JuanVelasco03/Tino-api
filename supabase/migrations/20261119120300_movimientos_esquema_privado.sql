-- SPEC 04, paso 2: aviso de get_advisors (security,
-- authenticated_security_definer_function_executable) sobre las funciones de
-- escritura de movimientos.
--
-- Las funciones security definer pasan al esquema `privado`, que PostgREST no
-- expone. En `public` quedan envolturas security invoker con el mismo nombre y
-- firma: el contrato con la API (rpc) no cambia. La garantía sigue siendo la
-- misma: solo las definer escriben en movimientos, forzando auth.uid().

create schema privado;

-- Solo authenticated puede resolver nombres en privado (para que las
-- envolturas llamen a las definer). anon no tiene acceso.
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- Conservan cuerpo, security definer, search_path y permisos
-- (revocadas a public y anon, ejecutables por authenticated).
alter function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  set schema privado;
alter function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  set schema privado;
alter function public.eliminar_movimiento(uuid)
  set schema privado;

create function public.registrar_movimiento(
  p_tipo text,
  p_monto numeric,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_movimiento(
    p_tipo, p_monto, p_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id, p_partes);
$$;

revoke all on function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

create function public.reemplazar_movimiento(
  p_id uuid,
  p_tipo text,
  p_monto numeric,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.reemplazar_movimiento(
    p_id, p_tipo, p_monto, p_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id, p_partes);
$$;

revoke all on function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

create function public.eliminar_movimiento(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select privado.eliminar_movimiento(p_id);
$$;

revoke all on function public.eliminar_movimiento(uuid) from public, anon;
grant execute on function public.eliminar_movimiento(uuid) to authenticated;
