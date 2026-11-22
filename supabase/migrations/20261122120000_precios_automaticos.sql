-- SPEC 11: precios automáticos de inversiones.
-- La API trae de Twelve Data el precio de los activos que el proveedor cubre
-- y lo guarda en la caché de precios del usuario (inversion_precios), con su
-- token y bajo RLS: sin service_role ni tabla global (REGLAS §4, SPEC 09).
--
-- Cada activo tiene un modo de cotización: automatica (el proveedor lo cubre
-- en la moneda de la cuenta) o manual. El precio manual solo se registra en
-- activos manuales; esa regla la aplica la API (PRECIO_AUTOMATICO).
--
-- Orígenes de precio: manual (SPEC 10), cierre (precio de cierre del
-- proveedor, fecha = día de la sesión) e intradia (último precio del día,
-- solo cripto; a lo sumo uno por activo y día, se reemplaza en su sitio).
-- Manual y cierre siguen siendo solo INSERT (N-53).
--
-- Clases de activo ('accion', 'etf', 'cripto'): su espejo en el dominio es
-- ClaseActivo (src/domain/inversion/inversion.ts).

-- ---------------------------------------------------------------------------
-- 1. inversion_activos: modo de cotización
--    Los activos existentes quedan manual, con clase, simbolo_fuente y
--    consultado_en nulos.
--    La lista de cotizacion lleva nombre propio: el nombre automático de un
--    check de columna (inversion_activos_cotizacion_check) es el de la regla
--    que ata el modo al símbolo de la fuente.
-- ---------------------------------------------------------------------------
alter table public.inversion_activos
  add column cotizacion text not null default 'manual'
    constraint inversion_activos_cotizacion_valida
      check (cotizacion in ('automatica', 'manual')),
  add column clase text
    constraint inversion_activos_clase_check
      check (clase in ('accion', 'etf', 'cripto')),
  -- Símbolo en el proveedor: 'VOO', 'BTC/USD'.
  add column simbolo_fuente text,
  -- Última consulta del precio actual al proveedor, haya respondido o no.
  add column consultado_en timestamptz,
  -- Un activo automático siempre sabe qué pedir.
  add constraint inversion_activos_cotizacion_check
    check ((cotizacion = 'automatica') = (simbolo_fuente is not null));

-- Cambiar el modo no es un dato financiero y no lleva historial.
create policy inversion_activos_update_propio on public.inversion_activos
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- Símbolo, nombre y cuenta siguen fijos.
revoke update on public.inversion_activos from authenticated;
grant update (cotizacion, clase, simbolo_fuente, consultado_en)
  on public.inversion_activos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. inversion_precios: orígenes cierre e intradia
--    cotizado_en: en cierre e intradia, el instante que informa el proveedor
--    (UTC); en manual sigue siendo now().
-- ---------------------------------------------------------------------------
alter table public.inversion_precios drop constraint inversion_precios_origen_check;
alter table public.inversion_precios
  add constraint inversion_precios_origen_check
    check (origen in ('manual', 'cierre', 'intradia'));

-- Un cierre por activo y sesión; un intradía por activo y día.
create unique index inversion_precios_cierre_unico
  on public.inversion_precios (activo_id, fecha)
  where origen = 'cierre';

create unique index inversion_precios_intradia_unico
  on public.inversion_precios (activo_id, fecha)
  where origen = 'intradia';

-- Solo el intradía se actualiza, y solo su precio y su instante. Manual y
-- cierre siguen sin UPDATE. Sin DELETE, como en SPEC 10.
create policy inversion_precios_update_intradia on public.inversion_precios
  for update to authenticated
  using ((select auth.uid()) = usuario_id and origen = 'intradia')
  with check ((select auth.uid()) = usuario_id and origen = 'intradia');

revoke update on public.inversion_precios from authenticated;
grant update (precio_cent, cotizado_en) on public.inversion_precios to authenticated;

-- ---------------------------------------------------------------------------
-- 3. guardar_precios_automaticos: guarda lo que trajo el proveedor y marca
--    los activos consultados, en una sola transacción.
--    security invoker: corre como el usuario y la RLS aplica. Existe porque
--    PostgREST no expresa el on conflict sobre los índices parciales.
--    p_precios: [{ activo_id, precio_cent, fecha, origen, cotizado_en }], con
--    origen cierre o intradia. Un activo ajeno lo rechaza la FK compuesta.
--    p_consultados: activos del lote, también los que fallaron. La RLS limita
--    el UPDATE a los propios.
-- ---------------------------------------------------------------------------
create function public.guardar_precios_automaticos(
  p_precios jsonb,
  p_consultados uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_precio jsonb;
  v_origen text;
begin
  if p_precios is not null and jsonb_typeof(p_precios) not in ('array', 'null') then
    raise exception 'ENTRADA_INVALIDA:precios';
  end if;

  -- Sin partes_o_vacio: es interna y authenticated no puede ejecutarla.
  for v_precio in
    select e from jsonb_array_elements(
      case when jsonb_typeof(p_precios) = 'array' then p_precios else '[]'::jsonb end) as e
  loop
    v_origen := v_precio ->> 'origen';

    if v_origen = 'cierre' then
      -- Un cierre no cambia.
      insert into public.inversion_precios (
        usuario_id, activo_id, precio_cent, fecha, origen, cotizado_en)
      values (
        (select auth.uid()), (v_precio ->> 'activo_id')::uuid,
        (v_precio ->> 'precio_cent')::bigint, (v_precio ->> 'fecha')::date,
        'cierre', (v_precio ->> 'cotizado_en')::timestamptz)
      on conflict (activo_id, fecha) where origen = 'cierre' do nothing;
    elsif v_origen = 'intradia' then
      -- El intradía del día se reemplaza solo por uno posterior.
      insert into public.inversion_precios (
        usuario_id, activo_id, precio_cent, fecha, origen, cotizado_en)
      values (
        (select auth.uid()), (v_precio ->> 'activo_id')::uuid,
        (v_precio ->> 'precio_cent')::bigint, (v_precio ->> 'fecha')::date,
        'intradia', (v_precio ->> 'cotizado_en')::timestamptz)
      on conflict (activo_id, fecha) where origen = 'intradia' do update
        set precio_cent = excluded.precio_cent,
            cotizado_en = excluded.cotizado_en
        where public.inversion_precios.cotizado_en < excluded.cotizado_en;
    else
      raise exception 'ENTRADA_INVALIDA:origen';
    end if;
  end loop;

  if p_consultados is not null and cardinality(p_consultados) > 0 then
    update public.inversion_activos
       set consultado_en = now()
     where id = any(p_consultados);
  end if;
end;
$$;

revoke all on function public.guardar_precios_automaticos(jsonb, uuid[])
  from public, anon;
grant execute on function public.guardar_precios_automaticos(jsonb, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. crear_inversion: cada posición acepta cotizacion, clase y
--    simbolo_fuente (por defecto manual, nulo y nulo). Misma firma: la
--    envoltura public no cambia. El primer precio sigue siendo el costo
--    unitario, con origen manual (SPEC 10).
-- ---------------------------------------------------------------------------
create or replace function privado.crear_inversion(
  p_cuenta_id uuid,
  p_nombre text,
  p_moneda text,
  p_saldo_inicial text,
  p_posiciones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_posicion jsonb;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  if p_moneda is null or p_moneda not in ('COP', 'USD') then
    raise exception 'MONEDA_INVALIDA:moneda';
  end if;

  if p_posiciones is not null and jsonb_typeof(p_posiciones) not in ('array', 'null') then
    raise exception 'ENTRADA_INVALIDA:posiciones';
  end if;

  insert into public.cuentas (id, usuario_id, tipo, nombre, saldo_inicial, moneda)
  values (p_cuenta_id, v_usuario, 'inversion', btrim(p_nombre), p_saldo_inicial, p_moneda);

  for v_posicion in
    select e from jsonb_array_elements(public.partes_o_vacio(p_posiciones)) as e
  loop
    insert into public.inversion_activos (
      id, usuario_id, cuenta_id, simbolo, nombre, cotizacion, clase, simbolo_fuente)
    values (
      (v_posicion ->> 'activo_id')::uuid, v_usuario, p_cuenta_id,
      v_posicion ->> 'simbolo', btrim(v_posicion ->> 'nombre'),
      coalesce(v_posicion ->> 'cotizacion', 'manual'),
      v_posicion ->> 'clase', v_posicion ->> 'simbolo_fuente');

    insert into public.inversion_operaciones (
      id, usuario_id, cuenta_id, activo_id, clase, cantidad, monto, fecha)
    values (
      (v_posicion ->> 'operacion_id')::uuid, v_usuario, p_cuenta_id,
      (v_posicion ->> 'activo_id')::uuid, 'inicial',
      v_posicion ->> 'cantidad', v_posicion ->> 'monto',
      (v_posicion ->> 'fecha')::date);

    insert into public.inversion_precios (usuario_id, activo_id, precio_cent, fecha, origen)
    values (
      v_usuario, (v_posicion ->> 'activo_id')::uuid,
      (v_posicion ->> 'precio_cent')::bigint, (v_posicion ->> 'fecha')::date, 'manual');
  end loop;

  return p_cuenta_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. registrar_operacion: tres parámetros finales con defecto, que solo se
--    usan al crear el activo. p_clase ya es la clase de la operación
--    (inicial, compra, venta), así que la del activo es p_clase_activo.
--    Una llamada con diez argumentos sigue resolviendo a esta.
-- ---------------------------------------------------------------------------
drop function public.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint);
drop function privado.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint);

create function privado.registrar_operacion(
  p_operacion_id uuid,
  p_cuenta_id uuid,
  p_activo_id uuid,
  p_simbolo text,
  p_nombre text,
  p_clase text,
  p_cantidad text,
  p_monto text,
  p_fecha date,
  p_precio_cent bigint,
  p_cotizacion text default 'manual',
  p_clase_activo text default null,
  p_simbolo_fuente text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_archivada timestamptz;
  v_activo uuid;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select c.archivada_en into v_archivada
    from public.cuentas c
   where c.id = p_cuenta_id and c.usuario_id = v_usuario and c.tipo = 'inversion';
  if not found then
    raise exception 'INVERSION_NO_ENCONTRADA';
  end if;
  if v_archivada is not null then
    raise exception 'CUENTA_ARCHIVADA';
  end if;

  select a.id into v_activo
    from public.inversion_activos a
   where a.cuenta_id = p_cuenta_id and a.simbolo = p_simbolo;

  if v_activo is null then
    if p_clase = 'venta' then
      raise exception 'ACTIVO_NO_ENCONTRADO:simbolo';
    end if;
    if p_nombre is null or btrim(p_nombre) = '' then
      raise exception 'NOMBRE_REQUERIDO:nombre';
    end if;

    v_activo := p_activo_id;

    insert into public.inversion_activos (
      id, usuario_id, cuenta_id, simbolo, nombre, cotizacion, clase, simbolo_fuente)
    values (
      v_activo, v_usuario, p_cuenta_id, p_simbolo, btrim(p_nombre),
      coalesce(p_cotizacion, 'manual'), p_clase_activo, p_simbolo_fuente);

    insert into public.inversion_precios (usuario_id, activo_id, precio_cent, fecha, origen)
    values (v_usuario, v_activo, p_precio_cent, p_fecha, 'manual');
  end if;

  insert into public.inversion_operaciones (
    id, usuario_id, cuenta_id, activo_id, clase, cantidad, monto, fecha)
  values (
    p_operacion_id, v_usuario, p_cuenta_id, v_activo, p_clase,
    p_cantidad, p_monto, p_fecha);

  return v_activo;
end;
$$;

revoke all on function privado.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint, text, text, text)
  from public, anon;
grant execute on function privado.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint, text, text, text)
  to authenticated;

create function public.registrar_operacion(
  p_operacion_id uuid,
  p_cuenta_id uuid,
  p_activo_id uuid,
  p_simbolo text,
  p_nombre text,
  p_clase text,
  p_cantidad text,
  p_monto text,
  p_fecha date,
  p_precio_cent bigint,
  p_cotizacion text default 'manual',
  p_clase_activo text default null,
  p_simbolo_fuente text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_operacion(
    p_operacion_id, p_cuenta_id, p_activo_id, p_simbolo, p_nombre, p_clase,
    p_cantidad, p_monto, p_fecha, p_precio_cent,
    p_cotizacion, p_clase_activo, p_simbolo_fuente);
$$;

revoke all on function public.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint, text, text, text)
  from public, anon;
grant execute on function public.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint, text, text, text)
  to authenticated;
