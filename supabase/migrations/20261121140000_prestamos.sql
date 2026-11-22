-- SPEC 08: deudas y préstamos con personas.
-- Un préstamo es una cuenta de tipo prestamo_otorgado (activo) o
-- deuda_contraida (pasivo) más una fila 1:1 en prestamos con la tasa y la
-- fecha acordada (RN-08). El capital pendiente es el saldo de la cuenta
-- (RN-01, RN-02). Los intereses causados no se guardan: los deriva el dominio.
-- Solo se guarda el interés cobrado o pagado, como movimiento enlazado en
-- prestamos_intereses. RLS desde la primera migración (REGLAS §4).
--
-- Tipos de préstamo: ('prestamo_otorgado', 'deuda_contraida'). La lista se
-- repite en cada sitio; su espejo en el dominio es TIPOS_PRESTAMO
-- (src/domain/prestamo/prestamo.ts).

-- ---------------------------------------------------------------------------
-- 1. Cambios en tablas y funciones existentes
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
  end;
$$;

alter table public.cuentas drop constraint cuentas_tipo_check;
alter table public.cuentas
  add constraint cuentas_tipo_check check (
    tipo in ('efectivo', 'banco', 'tarjeta_credito', 'prestamo_otorgado', 'deuda_contraida'));

-- Nombre único: las cuentas propias como antes; los préstamos por tipo
-- («Mamá» puede tener un otorgado y una contraída). Un préstamo puede
-- llamarse igual que una cuenta propia.
drop index public.cuentas_nombre_unico;

create unique index cuentas_nombre_unico on public.cuentas (usuario_id, lower(nombre))
  where archivada_en is null
    and tipo not in ('prestamo_otorgado', 'deuda_contraida');

create unique index cuentas_prestamo_nombre_unico
  on public.cuentas (usuario_id, tipo, lower(btrim(nombre)))
  where tipo in ('prestamo_otorgado', 'deuda_contraida');

-- Una cuenta de préstamo solo nace en crear_prestamo.
drop policy cuentas_insert_propia on public.cuentas;
create policy cuentas_insert_propia on public.cuentas
  for insert to authenticated
  with check (
    (select auth.uid()) = usuario_id
    and tipo not in ('prestamo_otorgado', 'deuda_contraida'));

-- Además de la naturaleza, el tipo de un préstamo es fijo, y una cuenta
-- propia no pasa a préstamo.
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
  if public.naturaleza_de(old.tipo) <> public.naturaleza_de(new.tipo) then
    raise exception 'CAMBIO_DE_NATURALEZA';
  end if;
  return new;
end;
$$;

-- La posición de las cuentas visibles no cuenta los préstamos.
create or replace function public.asignar_posicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (old.archivada_en is not null and new.archivada_en is null) then
    select coalesce(max(c.posicion) + 1, 0)
      into new.posicion
      from public.cuentas c
     where c.usuario_id = new.usuario_id
       and c.archivada_en is null
       and c.id <> new.id
       and c.tipo not in ('prestamo_otorgado', 'deuda_contraida')
       and public.naturaleza_de(c.tipo) = public.naturaleza_de(new.tipo);
  end if;
  return new;
end;
$$;

-- p_ids debe ser exactamente el conjunto de cuentas visibles (no archivadas,
-- no préstamos) del usuario con esa naturaleza.
create or replace function public.reordenar_cuentas(p_naturaleza text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ids is null
     or array_position(p_ids, null) is not null
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'ORDEN_INVALIDO';
  end if;

  if exists (
       select c.id
         from public.cuentas c
        where c.usuario_id = (select auth.uid())
          and c.archivada_en is null
          and c.tipo not in ('prestamo_otorgado', 'deuda_contraida')
          and public.naturaleza_de(c.tipo) = p_naturaleza
       except
       select unnest(p_ids)
     )
     or exists (
       select unnest(p_ids)
       except
       select c.id
         from public.cuentas c
        where c.usuario_id = (select auth.uid())
          and c.archivada_en is null
          and c.tipo not in ('prestamo_otorgado', 'deuda_contraida')
          and public.naturaleza_de(c.tipo) = p_naturaleza
     ) then
    raise exception 'ORDEN_INVALIDO';
  end if;

  update public.cuentas c
     set posicion = o.ordinal - 1
    from unnest(p_ids) with ordinality as o (id, ordinal)
   where c.id = o.id;
end;
$$;

-- Semilla: agrega «Intereses» de gasto y de ingreso. El resto no cambia.
create or replace function public.insertar_semilla(p_usuario uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.categorias (usuario_id, nombre, tipo, posicion)
  select p_usuario, s.nombre, s.tipo, s.posicion
    from (values
      ('Comida', 'gasto', 0),
      ('Transporte', 'gasto', 1),
      ('Celular', 'gasto', 2),
      ('Mercado', 'gasto', 3),
      ('Hogar', 'gasto', 4),
      ('Salud', 'gasto', 5),
      ('Ocio', 'gasto', 6),
      ('Servicios', 'gasto', 7),
      ('Otros gastos', 'gasto', 8),
      ('Intereses', 'gasto', 9),
      ('Salario', 'ingreso', 0),
      ('Trabajo independiente', 'ingreso', 1),
      ('Reembolso', 'ingreso', 2),
      ('Otros ingresos', 'ingreso', 3),
      ('Intereses', 'ingreso', 4)
    ) as s (nombre, tipo, posicion);

  insert into public.reglas_categoria (usuario_id, palabra_clave, categoria_id)
  select p_usuario, r.palabra_clave, k.id
    from (values
      ('almuerzo', 'Comida'), ('corrientazo', 'Comida'), ('restaurante', 'Comida'),
      ('desayuno', 'Comida'), ('cena', 'Comida'), ('tinto', 'Comida'),
      ('cafe', 'Comida'), ('empanada', 'Comida'), ('arepa', 'Comida'),
      ('comida', 'Comida'),
      ('pasaje', 'Transporte'), ('transmilenio', 'Transporte'), ('sitp', 'Transporte'),
      ('bus', 'Transporte'), ('uber', 'Transporte'), ('didi', 'Transporte'),
      ('taxi', 'Transporte'), ('parqueadero', 'Transporte'), ('gasolina', 'Transporte'),
      ('recarga', 'Celular'), ('datos', 'Celular'), ('celular', 'Celular'),
      ('minutos', 'Celular'),
      ('tienda', 'Mercado'), ('d1', 'Mercado'), ('ara', 'Mercado'),
      ('exito', 'Mercado'), ('mercado', 'Mercado'), ('olimpica', 'Mercado'),
      ('carulla', 'Mercado'),
      ('farmacia', 'Salud'), ('drogueria', 'Salud'), ('medico', 'Salud'),
      ('eps', 'Salud'),
      ('netflix', 'Ocio'), ('spotify', 'Ocio'), ('cine', 'Ocio'),
      ('cerveza', 'Ocio'), ('bar', 'Ocio'),
      ('nomina', 'Salario'), ('salario', 'Salario'), ('sueldo', 'Salario'),
      ('freelance', 'Trabajo independiente'), ('honorarios', 'Trabajo independiente'),
      ('proyecto', 'Trabajo independiente'),
      ('reembolso', 'Reembolso'), ('devolucion', 'Reembolso')
    ) as r (palabra_clave, categoria)
    join public.categorias k
      on k.usuario_id = p_usuario and k.nombre = r.categoria;
end;
$$;

revoke all on function public.insertar_semilla(uuid) from public, anon, authenticated;

-- Backfill: perfiles existentes sin «Intereses» de ese tipo, al final de su
-- tipo. Compara como categorias_nombre_unico (lower(nombre)).
do $$
declare
  v_tipo text;
begin
  foreach v_tipo in array array['gasto', 'ingreso'] loop
    insert into public.categorias (usuario_id, nombre, tipo, posicion)
    select p.id, 'Intereses', v_tipo,
           coalesce((select max(k.posicion) + 1 from public.categorias k
                      where k.usuario_id = p.id and k.tipo = v_tipo), 0)
      from public.perfiles p
     where not exists (
             select 1 from public.categorias k
              where k.usuario_id = p.id and k.tipo = v_tipo
                and lower(k.nombre) = 'intereses');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabla prestamos: 1:1 con su cuenta. La tasa no es un monto y no se
--    cifra (REGLAS §4 cifra importes). Centésimas de punto: 1 % = 100.
-- ---------------------------------------------------------------------------
create table public.prestamos (
  cuenta_id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  tasa_mensual_cpb integer not null default 0
    check (tasa_mensual_cpb between 0 and 10000),
  fecha_acordada date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint prestamos_usuario_id_cuenta_id_key unique (usuario_id, cuenta_id),
  constraint prestamos_cuenta_fkey
    foreign key (usuario_id, cuenta_id)
    references public.cuentas (usuario_id, id)
    on delete cascade
);

create index prestamos_usuario_idx on public.prestamos (usuario_id);

alter table public.prestamos enable row level security;

-- Sin INSERT (solo crear_prestamo) ni DELETE (cae con la cuenta).
create policy prestamos_select_propio on public.prestamos
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy prestamos_update_propio on public.prestamos
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- La tasa queda fija desde el alta: solo fecha_acordada es actualizable.
revoke update on public.prestamos from authenticated;
grant update (fecha_acordada) on public.prestamos to authenticated;

create trigger prestamos_marcar_actualizado
  before update on public.prestamos
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- 3. Tabla prestamos_intereses: una fila por movimiento de interés (ingreso
--    si te deben, gasto si debes). Nace en registrar_abono y muere con su
--    movimiento. Borrar el capital deja el interés como fila propia.
-- ---------------------------------------------------------------------------
create table public.prestamos_intereses (
  movimiento_id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  prestamo_id uuid not null,
  movimiento_capital_id uuid,
  creado_en timestamptz not null default now(),
  constraint prestamos_intereses_movimiento_fkey
    foreign key (usuario_id, movimiento_id)
    references public.movimientos (usuario_id, id)
    on delete cascade,
  constraint prestamos_intereses_prestamo_fkey
    foreign key (usuario_id, prestamo_id)
    references public.prestamos (usuario_id, cuenta_id)
    on delete cascade,
  constraint prestamos_intereses_capital_fkey
    foreign key (usuario_id, movimiento_capital_id)
    references public.movimientos (usuario_id, id)
    on delete set null (movimiento_capital_id)
);

create index prestamos_intereses_usuario_idx on public.prestamos_intereses (usuario_id);
create index prestamos_intereses_prestamo_idx
  on public.prestamos_intereses (usuario_id, prestamo_id);
create index prestamos_intereses_capital_idx
  on public.prestamos_intereses (usuario_id, movimiento_capital_id);

alter table public.prestamos_intereses enable row level security;

create policy prestamos_intereses_select_propio on public.prestamos_intereses
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- 4. Tabla prestamos_cambios (RN-13): historial de nombre y fecha acordada,
--    con la forma de cuentas_cambios. Sin FK al préstamo. La escriben solo
--    los triggers.
-- ---------------------------------------------------------------------------
create table public.prestamos_cambios (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  campo text not null check (campo in ('nombre', 'fecha_acordada')),
  valor_anterior text,
  valor_nuevo text,
  cambiado_en timestamptz not null default now()
);

create index prestamos_cambios_usuario_idx on public.prestamos_cambios (usuario_id);
create index prestamos_cambios_prestamo_idx on public.prestamos_cambios (prestamo_id);

alter table public.prestamos_cambios enable row level security;

-- El historial no se edita.
create policy prestamos_cambios_select_propio on public.prestamos_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- security definer: el usuario no tiene política de INSERT en
-- prestamos_cambios.
create function public.registrar_cambio_prestamo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prestamos_cambios (prestamo_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (new.cuenta_id, new.usuario_id, 'fecha_acordada',
          old.fecha_acordada::text, new.fecha_acordada::text);
  return null;
end;
$$;

revoke all on function public.registrar_cambio_prestamo() from public, anon, authenticated;

create trigger prestamos_registrar_cambio
  after update of fecha_acordada on public.prestamos
  for each row
  when (old.fecha_acordada is distinct from new.fecha_acordada)
  execute function public.registrar_cambio_prestamo();

create function public.registrar_cambio_nombre_prestamo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prestamos_cambios (prestamo_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (new.id, new.usuario_id, 'nombre', old.nombre, new.nombre);
  return null;
end;
$$;

revoke all on function public.registrar_cambio_nombre_prestamo() from public, anon, authenticated;

create trigger cuentas_registrar_cambio_nombre_prestamo
  after update of nombre on public.cuentas
  for each row
  when (old.tipo in ('prestamo_otorgado', 'deuda_contraida')
        and old.nombre is distinct from new.nombre)
  execute function public.registrar_cambio_nombre_prestamo();

-- ---------------------------------------------------------------------------
-- 5. Vista prestamos_detalle. security_invoker: respeta la RLS.
-- ---------------------------------------------------------------------------
create view public.prestamos_detalle
with (security_invoker = true)
as
select
  c.id,
  c.nombre,
  c.tipo,
  p.tasa_mensual_cpb,
  p.fecha_acordada,
  c.creado_en
from public.cuentas c
join public.prestamos p on p.cuenta_id = c.id;

-- ---------------------------------------------------------------------------
-- 6. crear_prestamo: cuenta, préstamo y desembolso en una sola transacción.
--    security definer en privado (como registrar_movimiento), envoltura
--    security invoker en public con la misma firma.
--    p_saldo_inicial es el 0 cifrado con la AAD de la cuenta; p_monto, el
--    desembolso cifrado con la AAD movimientos|monto|p_movimiento_id.
--    Un 23505 sobre cuentas_prestamo_nombre_unico revierte todo.
-- ---------------------------------------------------------------------------
create function privado.crear_prestamo(
  p_cuenta_id uuid,
  p_tipo text,
  p_nombre text,
  p_saldo_inicial text,
  p_tasa_mensual_cpb integer,
  p_fecha_acordada date,
  p_movimiento_id uuid,
  p_monto text,
  p_fecha date,
  p_cuenta_propia_id uuid,
  p_descripcion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_tipo_propia text;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  if p_tipo is null or p_tipo not in ('prestamo_otorgado', 'deuda_contraida') then
    raise exception 'TIPO_INVALIDO:tipo';
  end if;

  select c.tipo into v_tipo_propia
    from public.cuentas c
   where c.id = p_cuenta_propia_id and c.usuario_id = v_usuario;
  if not found then
    raise exception 'CUENTA_INVALIDA:cuentaId';
  end if;
  if v_tipo_propia in ('prestamo_otorgado', 'deuda_contraida') then
    raise exception 'CUENTA_DE_PRESTAMO:cuentaId';
  end if;

  insert into public.cuentas (id, usuario_id, tipo, nombre, saldo_inicial)
  values (p_cuenta_id, v_usuario, p_tipo, btrim(p_nombre), p_saldo_inicial);

  insert into public.prestamos (cuenta_id, usuario_id, tasa_mensual_cpb, fecha_acordada)
  values (p_cuenta_id, v_usuario, p_tasa_mensual_cpb, p_fecha_acordada);

  -- Valida la cuenta archivada (CUENTA_ARCHIVADA:<campo>).
  if p_tipo = 'prestamo_otorgado' then
    perform privado.registrar_movimiento(
      p_movimiento_id, 'transferencia', p_monto, p_fecha, p_descripcion, null,
      p_cuenta_propia_id, p_cuenta_id, null, null);
  else
    perform privado.registrar_movimiento(
      p_movimiento_id, 'transferencia', p_monto, p_fecha, p_descripcion, null,
      p_cuenta_id, p_cuenta_propia_id, null, null);
  end if;

  return p_cuenta_id;
end;
$$;

revoke all on function privado.crear_prestamo(uuid, text, text, text, integer, date, uuid, text, date, uuid, text)
  from public, anon;
grant execute on function privado.crear_prestamo(uuid, text, text, text, integer, date, uuid, text, date, uuid, text)
  to authenticated;

create function public.crear_prestamo(
  p_cuenta_id uuid,
  p_tipo text,
  p_nombre text,
  p_saldo_inicial text,
  p_tasa_mensual_cpb integer,
  p_fecha_acordada date,
  p_movimiento_id uuid,
  p_monto text,
  p_fecha date,
  p_cuenta_propia_id uuid,
  p_descripcion text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.crear_prestamo(
    p_cuenta_id, p_tipo, p_nombre, p_saldo_inicial, p_tasa_mensual_cpb,
    p_fecha_acordada, p_movimiento_id, p_monto, p_fecha, p_cuenta_propia_id,
    p_descripcion);
$$;

revoke all on function public.crear_prestamo(uuid, text, text, text, integer, date, uuid, text, date, uuid, text)
  from public, anon;
grant execute on function public.crear_prestamo(uuid, text, text, text, integer, date, uuid, text, date, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. registrar_abono: capital (transferencia) e interés (ingreso o gasto) en
--    una sola transacción, con el enlace del interés en prestamos_intereses.
--    Los montos llegan cifrados con la AAD movimientos|monto|<id>.
-- ---------------------------------------------------------------------------
create function privado.registrar_abono(
  p_prestamo_id uuid,
  p_cuenta_propia_id uuid,
  p_fecha date,
  p_capital_id uuid,
  p_capital text,
  p_interes_id uuid,
  p_interes text,
  p_categoria_interes_id uuid,
  p_descripcion_capital text,
  p_descripcion_interes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_tipo text;
  v_tipo_propia text;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select c.tipo into v_tipo
    from public.prestamos p
    join public.cuentas c on c.id = p.cuenta_id
   where p.cuenta_id = p_prestamo_id and p.usuario_id = v_usuario;
  if not found then
    raise exception 'PRESTAMO_NO_ENCONTRADO';
  end if;

  select c.tipo into v_tipo_propia
    from public.cuentas c
   where c.id = p_cuenta_propia_id and c.usuario_id = v_usuario;
  if not found then
    raise exception 'CUENTA_INVALIDA:cuentaId';
  end if;
  if v_tipo_propia in ('prestamo_otorgado', 'deuda_contraida') then
    raise exception 'CUENTA_DE_PRESTAMO:cuentaId';
  end if;

  if p_capital is null and p_interes is null then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  if p_capital is not null then
    if v_tipo = 'prestamo_otorgado' then
      perform privado.registrar_movimiento(
        p_capital_id, 'transferencia', p_capital, p_fecha, p_descripcion_capital, null,
        p_prestamo_id, p_cuenta_propia_id, null, null);
    else
      perform privado.registrar_movimiento(
        p_capital_id, 'transferencia', p_capital, p_fecha, p_descripcion_capital, null,
        p_cuenta_propia_id, p_prestamo_id, null, null);
    end if;
  end if;

  if p_interes is not null then
    if v_tipo = 'prestamo_otorgado' then
      perform privado.registrar_movimiento(
        p_interes_id, 'ingreso', p_interes, p_fecha, p_descripcion_interes, null,
        null, p_cuenta_propia_id, p_categoria_interes_id, null);
    else
      perform privado.registrar_movimiento(
        p_interes_id, 'gasto', p_interes, p_fecha, p_descripcion_interes, null,
        p_cuenta_propia_id, null, p_categoria_interes_id, null);
    end if;

    insert into public.prestamos_intereses (
      movimiento_id, usuario_id, prestamo_id, movimiento_capital_id)
    values (
      p_interes_id, v_usuario, p_prestamo_id,
      case when p_capital is null then null else p_capital_id end);
  end if;
end;
$$;

revoke all on function privado.registrar_abono(uuid, uuid, date, uuid, text, uuid, text, uuid, text, text)
  from public, anon;
grant execute on function privado.registrar_abono(uuid, uuid, date, uuid, text, uuid, text, uuid, text, text)
  to authenticated;

create function public.registrar_abono(
  p_prestamo_id uuid,
  p_cuenta_propia_id uuid,
  p_fecha date,
  p_capital_id uuid,
  p_capital text,
  p_interes_id uuid,
  p_interes text,
  p_categoria_interes_id uuid,
  p_descripcion_capital text,
  p_descripcion_interes text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_abono(
    p_prestamo_id, p_cuenta_propia_id, p_fecha, p_capital_id, p_capital,
    p_interes_id, p_interes, p_categoria_interes_id, p_descripcion_capital,
    p_descripcion_interes);
$$;

revoke all on function public.registrar_abono(uuid, uuid, date, uuid, text, uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.registrar_abono(uuid, uuid, date, uuid, text, uuid, text, uuid, text, text)
  to authenticated;
