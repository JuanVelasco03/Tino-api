-- SPEC 10: cuentas de inversión.
-- Una inversión es una cuenta de tipo inversion (activo) con moneda COP o USD
-- fija. Su efectivo es el saldo de la cuenta (RN-01). Las posiciones no se
-- guardan: se derivan de activos, operaciones (inicial, compra, venta) y
-- precios en src/domain/inversion/ (RN-01, RN-13). Comprar y vender no son
-- movimientos (RN-06): lo único que entra y sale de la cuenta son
-- transferencias. El fondeo entre monedas es una transferencia con dos montos
-- (monto_destino) y la tasa implícita congelada (RN-04).
-- Montos y cantidades: text cifrado por la API (SPEC 05). El precio por
-- unidad no se cifra: es un dato de mercado, como la TRM.
-- RLS desde la primera migración (REGLAS §4).
--
-- Tipo de cuenta 'inversion': su espejo en el dominio es TIPO_INVERSION
-- (src/domain/inversion/inversion.ts). Monedas ('COP', 'USD'): MONEDAS.

-- ---------------------------------------------------------------------------
-- 1. Cuentas: tipo inversion y moneda
-- ---------------------------------------------------------------------------

-- Espejo SQL de naturalezaDe (src/domain/cuenta/naturaleza.ts).
create or replace function public.naturaleza_de(tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case tipo
    when 'efectivo' then 'activo'
    when 'banco' then 'activo'
    when 'tarjeta_credito' then 'pasivo'
    when 'prestamo_otorgado' then 'activo'
    when 'deuda_contraida' then 'pasivo'
    when 'inversion' then 'activo'
  end;
$$;

alter table public.cuentas drop constraint cuentas_tipo_check;
alter table public.cuentas
  add constraint cuentas_tipo_check check (
    tipo in ('efectivo', 'banco', 'tarjeta_credito', 'prestamo_otorgado',
             'deuda_contraida', 'inversion'));

-- Las cuentas existentes quedan en COP. Solo una inversión puede estar en USD.
-- La restricción de la lista lleva nombre propio: el nombre automático de un
-- check de columna (cuentas_moneda_check) es el de la segunda.
alter table public.cuentas
  add column moneda text not null default 'COP'
    constraint cuentas_moneda_valida check (moneda in ('COP', 'USD')),
  add constraint cuentas_moneda_check check (moneda = 'COP' or tipo = 'inversion');

-- Una inversión solo nace en crear_inversion; un préstamo, en crear_prestamo.
drop policy cuentas_insert_propia on public.cuentas;
create policy cuentas_insert_propia on public.cuentas
  for insert to authenticated
  with check (
    (select auth.uid()) = usuario_id
    and tipo not in ('prestamo_otorgado', 'deuda_contraida', 'inversion'));

-- El tipo de un préstamo y el de una inversión son fijos; una cuenta propia
-- no pasa a préstamo ni a inversión.
create or replace function public.impedir_cambio_naturaleza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tipo <> new.tipo
     and (old.tipo in ('prestamo_otorgado', 'deuda_contraida')
          or new.tipo in ('prestamo_otorgado', 'deuda_contraida')) then
    raise exception 'TIPO_DE_PRESTAMO_FIJO';
  end if;
  if old.tipo <> new.tipo
     and (old.tipo = 'inversion' or new.tipo = 'inversion') then
    raise exception 'TIPO_DE_INVERSION_FIJO';
  end if;
  if public.naturaleza_de(old.tipo) <> public.naturaleza_de(new.tipo) then
    raise exception 'CAMBIO_DE_NATURALEZA';
  end if;
  return new;
end;
$$;

-- La moneda de una cuenta no cambia: reescribiría el sentido de sus montos.
create function public.impedir_cambio_moneda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.moneda is distinct from new.moneda then
    raise exception 'MONEDA_FIJA';
  end if;
  return new;
end;
$$;

create trigger cuentas_impedir_cambio_moneda
  before update of moneda on public.cuentas
  for each row execute function public.impedir_cambio_moneda();

-- ---------------------------------------------------------------------------
-- 2. Movimientos: moneda USD y monto_destino
--    moneda es la de la cuenta de origen, o la del destino en un ingreso. La
--    fija la función, no el cliente. monto_destino va solo en una
--    transferencia entre monedas distintas, en la moneda del destino
--    (AAD movimientos|monto_destino|<id>). tasa es la implícita, en COP por
--    US$ 1, calculada por el dominio; con la misma moneda es 1.
-- ---------------------------------------------------------------------------
alter table public.movimientos drop constraint movimientos_moneda_check;
alter table public.movimientos
  add constraint movimientos_moneda_check check (moneda in ('COP', 'USD'));

alter table public.movimientos
  add column monto_destino text,
  add constraint movimientos_monto_destino_cifrado check (
    monto_destino ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  add constraint movimientos_monto_destino_check check (
    monto_destino is null or tipo = 'transferencia');

-- Auxiliar interna de registrar_movimiento y reemplazar_movimiento: valida
-- el uso de cuentas de inversión y de monto_destino, y devuelve la moneda del
-- movimiento. Una cuenta que no es del usuario no se ve: la rechaza la FK.
create function public.moneda_de_movimiento(
  p_usuario uuid,
  p_tipo text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_monto_destino text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo_origen text;
  v_moneda_origen text;
  v_tipo_destino text;
  v_moneda_destino text;
begin
  select c.tipo, c.moneda into v_tipo_origen, v_moneda_origen
    from public.cuentas c
   where c.id = p_cuenta_origen_id and c.usuario_id = p_usuario;

  select c.tipo, c.moneda into v_tipo_destino, v_moneda_destino
    from public.cuentas c
   where c.id = p_cuenta_destino_id and c.usuario_id = p_usuario;

  if p_tipo = 'gasto' and v_tipo_origen = 'inversion' then
    raise exception 'CUENTA_DE_INVERSION:cuentaOrigenId';
  end if;
  if p_tipo = 'ingreso' and v_tipo_destino = 'inversion' then
    raise exception 'CUENTA_DE_INVERSION:cuentaDestinoId';
  end if;

  if p_tipo = 'transferencia'
     and v_moneda_origen is not null and v_moneda_destino is not null
     and v_moneda_origen <> v_moneda_destino then
    if p_monto_destino is null then
      raise exception 'MONTO_DESTINO_REQUERIDO:montoDestino';
    end if;
  elsif p_monto_destino is not null then
    raise exception 'MONTO_DESTINO_NO_PERMITIDO:montoDestino';
  end if;

  return coalesce(
    case when p_tipo = 'ingreso' then v_moneda_destino else v_moneda_origen end,
    'COP');
end;
$$;

revoke all on function public.moneda_de_movimiento(uuid, text, uuid, uuid, text)
  from public, anon, authenticated;

-- Se recrean con dos parámetros finales con defecto. Las llamadas de
-- recurrentes (confirmar_ocurrencia) y préstamos (crear_prestamo,
-- registrar_abono), con diez argumentos, siguen resolviendo a estas.
drop function public.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb);
drop function public.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb);
drop function privado.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb);
drop function privado.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb);

create function privado.registrar_movimiento(
  p_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb,
  p_monto_destino text default null,
  p_tasa numeric default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_fecha date;
  v_moneda text;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  if p_id is null then
    raise exception 'ENTRADA_INVALIDA:id';
  end if;

  -- Sin fecha: hoy en la zona del perfil.
  v_fecha := coalesce(
    p_fecha,
    (now() at time zone coalesce(
      (select p.zona_horaria from public.perfiles p where p.id = v_usuario),
      'America/Bogota'))::date);

  perform public.validar_escritura_movimiento(
    v_usuario, p_tipo, p_cuenta_origen_id, p_cuenta_destino_id,
    p_categoria_id, p_partes);

  v_moneda := public.moneda_de_movimiento(
    v_usuario, p_tipo, p_cuenta_origen_id, p_cuenta_destino_id, p_monto_destino);

  insert into public.movimientos (
    id, usuario_id, tipo, monto, moneda, tasa, monto_destino, fecha,
    descripcion, nota, cuenta_origen_id, cuenta_destino_id, categoria_id)
  values (
    p_id, v_usuario, p_tipo, p_monto, v_moneda, coalesce(p_tasa, 1), p_monto_destino, v_fecha,
    p_descripcion, p_nota, p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id);

  insert into public.movimiento_partes (movimiento_id, usuario_id, categoria_id, monto)
  select p_id, v_usuario, (e ->> 'categoria_id')::uuid, e ->> 'monto'
    from jsonb_array_elements(public.partes_o_vacio(p_partes)) as e;

  return p_id;
end;
$$;

revoke all on function privado.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  from public, anon;
grant execute on function privado.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  to authenticated;

-- Reemplazo completo (PUT). Sin p_fecha conserva la fecha actual. El historial
-- compara las fotos antes y después (foto_movimiento incluye monto_destino).
create function privado.reemplazar_movimiento(
  p_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb,
  p_monto_destino text default null,
  p_tasa numeric default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_actual public.movimientos;
  v_antes jsonb;
  v_despues jsonb;
  v_moneda text;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select * into v_actual
    from public.movimientos m
   where m.id = p_id and m.usuario_id = v_usuario
     for update;
  if not found then
    raise exception 'MOVIMIENTO_NO_ENCONTRADO';
  end if;

  perform public.comprobar_cuentas_actuales(v_actual);
  perform public.validar_escritura_movimiento(
    v_usuario, p_tipo, p_cuenta_origen_id, p_cuenta_destino_id,
    p_categoria_id, p_partes);

  v_moneda := public.moneda_de_movimiento(
    v_usuario, p_tipo, p_cuenta_origen_id, p_cuenta_destino_id, p_monto_destino);

  v_antes := public.foto_movimiento(p_id);

  update public.movimientos
     set tipo = p_tipo,
         monto = p_monto,
         moneda = v_moneda,
         tasa = coalesce(p_tasa, 1),
         monto_destino = p_monto_destino,
         fecha = coalesce(p_fecha, v_actual.fecha),
         descripcion = p_descripcion,
         nota = p_nota,
         cuenta_origen_id = p_cuenta_origen_id,
         cuenta_destino_id = p_cuenta_destino_id,
         categoria_id = p_categoria_id
   where id = p_id;

  delete from public.movimiento_partes where movimiento_id = p_id;
  insert into public.movimiento_partes (movimiento_id, usuario_id, categoria_id, monto)
  select p_id, v_usuario, (e ->> 'categoria_id')::uuid, e ->> 'monto'
    from jsonb_array_elements(public.partes_o_vacio(p_partes)) as e;

  v_despues := public.foto_movimiento(p_id);

  if (v_antes - 'actualizado_en') is distinct from (v_despues - 'actualizado_en') then
    insert into public.movimientos_cambios (movimiento_id, usuario_id, operacion, antes, despues)
    values (p_id, v_usuario, 'edicion', v_antes, v_despues);
  end if;

  return p_id;
end;
$$;

revoke all on function privado.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  from public, anon;
grant execute on function privado.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  to authenticated;

create function public.registrar_movimiento(
  p_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb,
  p_monto_destino text default null,
  p_tasa numeric default 1
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_movimiento(
    p_id, p_tipo, p_monto, p_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id, p_partes,
    p_monto_destino, p_tasa);
$$;

revoke all on function public.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  to authenticated;

create function public.reemplazar_movimiento(
  p_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_descripcion text,
  p_nota text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb,
  p_monto_destino text default null,
  p_tasa numeric default 1
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.reemplazar_movimiento(
    p_id, p_tipo, p_monto, p_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id, p_partes,
    p_monto_destino, p_tasa);
$$;

revoke all on function public.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  from public, anon;
grant execute on function public.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb, text, numeric)
  to authenticated;

-- movimientos_detalle se recrea: m.* se expandió al crearla y no ve
-- monto_destino. Misma definición que en SPEC 05.
drop view public.movimientos_detalle;

create view public.movimientos_detalle
with (security_invoker = true)
as
select
  m.*,
  co.nombre as cuenta_origen_nombre,
  cd.nombre as cuenta_destino_nombre,
  k.nombre as categoria_nombre,
  coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'categoria_id', p.categoria_id,
                'categoria_nombre', kp.nombre,
                'monto', p.monto)
              order by kp.posicion)
       from public.movimiento_partes p
       join public.categorias kp on kp.id = p.categoria_id
      where p.movimiento_id = m.id),
    '[]'::jsonb) as partes
from public.movimientos m
left join public.cuentas co on co.id = m.cuenta_origen_id
left join public.cuentas cd on cd.id = m.cuenta_destino_id
left join public.categorias k on k.id = m.categoria_id;

-- ---------------------------------------------------------------------------
-- 3. Tabla inversion_activos: un activo por símbolo dentro de una cuenta.
--    Nace en crear_inversion o registrar_operacion; no se edita ni se borra.
-- ---------------------------------------------------------------------------
create table public.inversion_activos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  cuenta_id uuid not null,
  simbolo text not null
    check (simbolo ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$'),
  nombre text not null
    check (char_length(btrim(nombre)) between 1 and 80),
  creado_en timestamptz not null default now(),
  constraint inversion_activos_usuario_cuenta_id_key unique (usuario_id, cuenta_id, id),
  constraint inversion_activos_usuario_id_key unique (usuario_id, id),
  constraint inversion_activos_simbolo_unico unique (cuenta_id, simbolo),
  constraint inversion_activos_cuenta_fkey
    foreign key (usuario_id, cuenta_id)
    references public.cuentas (usuario_id, id)
    on delete cascade
);

create index inversion_activos_usuario_idx on public.inversion_activos (usuario_id);

alter table public.inversion_activos enable row level security;

create policy inversion_activos_select_propio on public.inversion_activos
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- 4. Tabla inversion_operaciones. El id lo genera la API, para atar el
--    cifrado (AAD inversion_operaciones|cantidad|<id> y ...|monto|<id>).
--    monto: total de la operación en la moneda de la cuenta, comisión
--    incluida. Cantidad en 10⁻⁸ unidades.
-- ---------------------------------------------------------------------------
create table public.inversion_operaciones (
  id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  cuenta_id uuid not null,
  activo_id uuid not null,
  clase text not null
    check (clase in ('inicial', 'compra', 'venta')),
  cantidad text not null
    constraint inversion_operaciones_cantidad_cifrada check (
      cantidad ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  monto text not null
    constraint inversion_operaciones_monto_cifrado check (
      monto ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  fecha date not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- El activo es del usuario y de esa cuenta.
  constraint inversion_operaciones_activo_fkey
    foreign key (usuario_id, cuenta_id, activo_id)
    references public.inversion_activos (usuario_id, cuenta_id, id)
    on delete restrict,
  -- Una cuenta con operaciones no se elimina (CUENTA_CON_MOVIMIENTOS).
  constraint inversion_operaciones_cuenta_fkey
    foreign key (usuario_id, cuenta_id)
    references public.cuentas (usuario_id, id)
    on delete restrict
);

create index inversion_operaciones_usuario_idx on public.inversion_operaciones (usuario_id);
create index inversion_operaciones_cuenta_idx
  on public.inversion_operaciones (cuenta_id, fecha desc, creado_en desc);
create index inversion_operaciones_activo_idx
  on public.inversion_operaciones (usuario_id, cuenta_id, activo_id);

alter table public.inversion_operaciones enable row level security;

-- Sin INSERT: nacen en crear_inversion y registrar_operacion.
create policy inversion_operaciones_select_propia on public.inversion_operaciones
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy inversion_operaciones_update_propia on public.inversion_operaciones
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy inversion_operaciones_delete_propia on public.inversion_operaciones
  for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- La clase y el activo quedan fijos: solo cantidad, monto y fecha.
revoke update on public.inversion_operaciones from authenticated;
grant update (cantidad, monto, fecha) on public.inversion_operaciones to authenticated;

create trigger inversion_operaciones_marcar_actualizado
  before update on public.inversion_operaciones
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- 5. Tabla inversion_operaciones_cambios (RN-13), con la forma de
--    movimientos_cambios. Sin FK a la operación: sobrevive a la eliminación.
--    La escribe solo el trigger.
-- ---------------------------------------------------------------------------
create table public.inversion_operaciones_cambios (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  operacion text not null
    check (operacion in ('edicion', 'eliminacion')),
  antes jsonb not null,
  despues jsonb,
  cambiado_en timestamptz not null default now()
);

create index inversion_operaciones_cambios_usuario_idx
  on public.inversion_operaciones_cambios (usuario_id);
create index inversion_operaciones_cambios_operacion_idx
  on public.inversion_operaciones_cambios (operacion_id);

alter table public.inversion_operaciones_cambios enable row level security;

-- El historial no se edita.
create policy inversion_operaciones_cambios_select_propio on public.inversion_operaciones_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- security definer: el usuario no tiene política de INSERT en el historial.
-- En UPDATE compara las fotos sin actualizado_en: la API reutiliza el texto
-- cifrado que no cambió, así que una diferencia es un cambio real.
-- En DELETE, si el usuario ya no existe (cascada de auth.users), no hay
-- historial que guardar: la fila violaría su FK.
create function public.registrar_cambio_operacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'actualizado_en') is not distinct from (to_jsonb(new) - 'actualizado_en') then
      return null;
    end if;

    insert into public.inversion_operaciones_cambios (operacion_id, usuario_id, operacion, antes, despues)
    values (new.id, new.usuario_id, 'edicion', to_jsonb(old), to_jsonb(new));
  else
    if not exists (select 1 from auth.users u where u.id = old.usuario_id) then
      return null;
    end if;

    insert into public.inversion_operaciones_cambios (operacion_id, usuario_id, operacion, antes, despues)
    values (old.id, old.usuario_id, 'eliminacion', to_jsonb(old), null);
  end if;

  return null;
end;
$$;

revoke all on function public.registrar_cambio_operacion() from public, anon, authenticated;

create trigger inversion_operaciones_registrar_cambio
  after update or delete on public.inversion_operaciones
  for each row execute function public.registrar_cambio_operacion();

-- ---------------------------------------------------------------------------
-- 6. Tabla inversion_precios: historial de precios por unidad, en unidades
--    menores de la moneda de la cuenta. Solo INSERT: cambiar un precio no
--    borra el anterior (N-53). fecha: día de la cotización en la zona del
--    usuario.
-- ---------------------------------------------------------------------------
create table public.inversion_precios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  activo_id uuid not null,
  precio_cent bigint not null
    check (precio_cent > 0),
  fecha date not null,
  -- SPEC 11 amplía la lista.
  origen text not null default 'manual'
    check (origen in ('manual')),
  cotizado_en timestamptz not null default now(),
  constraint inversion_precios_activo_fkey
    foreign key (usuario_id, activo_id)
    references public.inversion_activos (usuario_id, id)
    on delete cascade
);

create index inversion_precios_usuario_idx on public.inversion_precios (usuario_id);
create index inversion_precios_activo_idx
  on public.inversion_precios (activo_id, fecha desc, cotizado_en desc);

alter table public.inversion_precios enable row level security;

-- Sin UPDATE ni DELETE. La FK compuesta impide el activo ajeno.
create policy inversion_precios_select_propio on public.inversion_precios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy inversion_precios_insert_propio on public.inversion_precios
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- 7. crear_inversion: cuenta, activos, operaciones iniciales y primeros
--    precios en una sola transacción. security definer en privado (como
--    crear_prestamo), envoltura security invoker en public con la misma firma.
--    p_saldo_inicial: efectivo inicial cifrado con la AAD de la cuenta.
--    p_posiciones: [{ operacion_id, activo_id, simbolo, nombre, cantidad,
--    monto, fecha, precio_cent }], con cantidad y monto cifrados.
--    Un 23505 sobre cuentas_nombre_unico o inversion_activos_simbolo_unico
--    revierte todo.
-- ---------------------------------------------------------------------------
create function privado.crear_inversion(
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
    insert into public.inversion_activos (id, usuario_id, cuenta_id, simbolo, nombre)
    values (
      (v_posicion ->> 'activo_id')::uuid, v_usuario, p_cuenta_id,
      v_posicion ->> 'simbolo', btrim(v_posicion ->> 'nombre'));

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

revoke all on function privado.crear_inversion(uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function privado.crear_inversion(uuid, text, text, text, jsonb)
  to authenticated;

create function public.crear_inversion(
  p_cuenta_id uuid,
  p_nombre text,
  p_moneda text,
  p_saldo_inicial text,
  p_posiciones jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.crear_inversion(
    p_cuenta_id, p_nombre, p_moneda, p_saldo_inicial, p_posiciones);
$$;

revoke all on function public.crear_inversion(uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function public.crear_inversion(uuid, text, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. registrar_operacion: la operación y, si el activo es nuevo, el activo y
--    su primer precio, en una sola transacción. p_simbolo llega recortado y
--    en mayúsculas; p_cantidad y p_monto, cifrados. Devuelve el id del activo.
--    Las ediciones y eliminaciones van por UPDATE y DELETE directos con RLS.
-- ---------------------------------------------------------------------------
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
  p_precio_cent bigint
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

    insert into public.inversion_activos (id, usuario_id, cuenta_id, simbolo, nombre)
    values (v_activo, v_usuario, p_cuenta_id, p_simbolo, btrim(p_nombre));

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

revoke all on function privado.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint)
  from public, anon;
grant execute on function privado.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint)
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
  p_precio_cent bigint
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_operacion(
    p_operacion_id, p_cuenta_id, p_activo_id, p_simbolo, p_nombre, p_clase,
    p_cantidad, p_monto, p_fecha, p_precio_cent);
$$;

revoke all on function public.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint)
  from public, anon;
grant execute on function public.registrar_operacion(uuid, uuid, uuid, text, text, text, text, text, date, bigint)
  to authenticated;
