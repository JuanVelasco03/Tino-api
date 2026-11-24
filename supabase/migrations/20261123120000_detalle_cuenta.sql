-- SPEC 14: detalle de cuenta (historial, conciliación, ajuste de saldo) y
-- tarjeta de crédito con ciclo.
--
-- - La conciliación es por cuenta: un estado por lado del movimiento
--   (conciliado_origen, conciliado_destino). Conciliar deja fila en
--   movimientos_cambios (RN-13). Editar monto, fecha, tipo o cuenta devuelve
--   el lado afectado a pendiente (trigger desconciliar_al_editar).
-- - El ajuste de saldo es un tipo propio (RN-14): tipo 'ajuste', con la
--   categoría reservada «Ajuste» (tipo 'ajuste'). Sube el saldo →
--   cuenta_destino_id; lo baja → cuenta_origen_id. Solo efectivo y banco.
-- - Las condiciones de la tarjeta viven en public.tarjetas (1:1 con su cuenta,
--   como prestamos). El ciclo se calcula en src/domain/tarjeta/ (RN-01).
-- Montos: text cifrado por la API (SPEC 05). RLS desde la primera migración
-- (REGLAS §4).
--
-- Listas espejo del dominio:
--   TIPOS_CON_DETALLE = ('efectivo', 'banco')        src/domain/cuenta/cuenta.ts
--   CATEGORIAS_CARGO = ('Intereses', 'Cuota de manejo') src/domain/tarjeta/tarjeta.ts

-- ---------------------------------------------------------------------------
-- 1. movimientos: tipo 'ajuste' y conciliación por lado.
-- ---------------------------------------------------------------------------
alter table public.movimientos drop constraint movimientos_tipo_check;
alter table public.movimientos
  add constraint movimientos_tipo_check
    check (tipo in ('gasto', 'ingreso', 'transferencia', 'ajuste'));

alter table public.movimientos drop constraint movimientos_cuentas_por_tipo;
alter table public.movimientos
  add constraint movimientos_cuentas_por_tipo check (
    (tipo = 'gasto' and cuenta_origen_id is not null and cuenta_destino_id is null)
    or (tipo = 'ingreso' and cuenta_destino_id is not null and cuenta_origen_id is null)
    or (tipo = 'transferencia' and cuenta_origen_id is not null
        and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
        and categoria_id is null)
    -- RN-14: una sola cuenta y la categoría reservada (la FK compuesta
    -- movimientos_categoria_fkey exige que sea de tipo 'ajuste').
    or (tipo = 'ajuste' and (cuenta_origen_id is null) <> (cuenta_destino_id is null)
        and categoria_id is not null));

alter table public.movimientos
  add column conciliado_origen boolean not null default false,
  add column conciliado_destino boolean not null default false,
  add constraint movimientos_conciliado_check check (
    (not conciliado_origen or cuenta_origen_id is not null)
    and (not conciliado_destino or cuenta_destino_id is not null));

-- Editar monto, fecha, tipo o una cuenta devuelve a pendiente el lado
-- afectado, sea cual sea el camino de escritura (PUT, préstamos, metas).
-- Compara textos cifrados: la API reutiliza el cifrado si el monto no cambió.
create function public.desconciliar_al_editar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tipo is distinct from new.tipo
     or old.monto is distinct from new.monto
     or old.monto_destino is distinct from new.monto_destino
     or old.fecha is distinct from new.fecha then
    new.conciliado_origen := false;
    new.conciliado_destino := false;
  end if;
  if old.cuenta_origen_id is distinct from new.cuenta_origen_id then
    new.conciliado_origen := false;
  end if;
  if old.cuenta_destino_id is distinct from new.cuenta_destino_id then
    new.conciliado_destino := false;
  end if;
  return new;
end;
$$;

revoke all on function public.desconciliar_al_editar() from public, anon, authenticated;

create trigger movimientos_desconciliar_al_editar
  before update on public.movimientos
  for each row execute function public.desconciliar_al_editar();

-- ---------------------------------------------------------------------------
-- 2. movimientos_cambios: operación 'conciliacion'.
-- ---------------------------------------------------------------------------
alter table public.movimientos_cambios drop constraint movimientos_cambios_operacion_check;
alter table public.movimientos_cambios
  add constraint movimientos_cambios_operacion_check
    check (operacion in ('edicion', 'eliminacion', 'conciliacion'));

-- ---------------------------------------------------------------------------
-- 3. categorias: tipo 'ajuste'; semilla con «Ajuste» y «Cuota de manejo».
-- ---------------------------------------------------------------------------
alter table public.categorias drop constraint categorias_tipo_check;
alter table public.categorias
  add constraint categorias_tipo_check check (tipo in ('gasto', 'ingreso', 'ajuste'));

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
      ('Cuota de manejo', 'gasto', 10),
      ('Salario', 'ingreso', 0),
      ('Trabajo independiente', 'ingreso', 1),
      ('Reembolso', 'ingreso', 2),
      ('Otros ingresos', 'ingreso', 3),
      ('Intereses', 'ingreso', 4),
      ('Ajuste', 'ajuste', 0)
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
      ('manejo', 'Cuota de manejo'),
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

-- Relleno: perfiles existentes sin «Cuota de manejo» (gasto, al final) o sin
-- «Ajuste» (tipo 'ajuste'). Compara como categorias_nombre_unico.
insert into public.categorias (usuario_id, nombre, tipo, posicion)
select p.id, 'Cuota de manejo', 'gasto',
       coalesce((select max(k.posicion) + 1 from public.categorias k
                  where k.usuario_id = p.id and k.tipo = 'gasto'), 0)
  from public.perfiles p
 where not exists (
         select 1 from public.categorias k
          where k.usuario_id = p.id and k.tipo = 'gasto'
            and lower(k.nombre) = 'cuota de manejo');

insert into public.categorias (usuario_id, nombre, tipo, posicion)
select p.id, 'Ajuste', 'ajuste', 0
  from public.perfiles p
 where not exists (
         select 1 from public.categorias k
          where k.usuario_id = p.id and k.tipo = 'ajuste');

insert into public.reglas_categoria (usuario_id, palabra_clave, categoria_id)
select k.usuario_id, 'manejo', k.id
  from public.categorias k
 where k.tipo = 'gasto' and k.nombre = 'Cuota de manejo'
   and not exists (
         select 1 from public.reglas_categoria r
          where r.usuario_id = k.usuario_id and r.palabra_clave = 'manejo');

-- ---------------------------------------------------------------------------
-- 4. validar_escritura_movimiento: reglas del ajuste.
-- ---------------------------------------------------------------------------
create or replace function public.validar_escritura_movimiento(
  p_usuario uuid,
  p_tipo text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_categoria_id uuid,
  p_partes jsonb
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_partes jsonb := public.partes_o_vacio(p_partes);
  v_parte jsonb;
  v_categoria uuid;
  v_vistas uuid[] := '{}';
begin
  if p_partes is not null and jsonb_typeof(p_partes) not in ('array', 'null') then
    raise exception 'ENTRADA_INVALIDA:partes';
  end if;

  if exists (select 1 from public.cuentas c
              where c.id = p_cuenta_origen_id and c.usuario_id = p_usuario
                and c.archivada_en is not null) then
    raise exception 'CUENTA_ARCHIVADA:cuentaOrigenId';
  end if;

  if exists (select 1 from public.cuentas c
              where c.id = p_cuenta_destino_id and c.usuario_id = p_usuario
                and c.archivada_en is not null) then
    raise exception 'CUENTA_ARCHIVADA:cuentaDestinoId';
  end if;

  -- SPEC 14: un ajuste solo en efectivo o banco, sin partes.
  if p_tipo = 'ajuste' then
    if exists (select 1 from public.cuentas c
                where c.id = coalesce(p_cuenta_origen_id, p_cuenta_destino_id)
                  and c.usuario_id = p_usuario
                  and c.tipo not in ('efectivo', 'banco')) then
      raise exception 'TIPO_NO_ADMITIDO';
    end if;
    if jsonb_array_length(v_partes) > 0 then
      raise exception 'DIVISION_NO_PERMITIDA:partes';
    end if;
  end if;

  if jsonb_array_length(v_partes) = 0 then
    return;
  end if;

  if p_tipo = 'transferencia' then
    raise exception 'DIVISION_NO_PERMITIDA:partes';
  end if;
  if p_categoria_id is not null then
    raise exception 'PARTES_CON_CATEGORIA:partes';
  end if;
  if jsonb_array_length(v_partes) < 2 then
    raise exception 'PARTES_INSUFICIENTES:partes';
  end if;

  for v_parte in select e from jsonb_array_elements(v_partes) as e loop
    v_categoria := (v_parte ->> 'categoria_id')::uuid;

    -- Solo presencia: el valor es texto cifrado (lo valida su restricción).
    if (v_parte ->> 'monto') is null then
      raise exception 'MONTO_REQUERIDO:partes';
    end if;
    if v_categoria = any (v_vistas) then
      raise exception 'PARTES_REPETIDAS:partes';
    end if;
    if v_categoria is null or not exists (
         select 1 from public.categorias k
          where k.id = v_categoria and k.usuario_id = p_usuario and k.tipo = p_tipo) then
      raise exception 'CATEGORIA_INVALIDA:partes';
    end if;

    v_vistas := v_vistas || v_categoria;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Conciliación.
-- ---------------------------------------------------------------------------
-- Interna: marca el lado de p_cuenta_id de cada movimiento de p_ids en
-- p_conciliado. Solo toca y registra los que cambian de estado (RN-13).
-- No valida: la llaman funciones que ya validaron cuenta e ids.
create function privado.marcar_conciliacion(
  p_usuario uuid,
  p_cuenta_id uuid,
  p_ids uuid[],
  p_conciliado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes jsonb;
begin
  for v_id in
    select m.id
      from public.movimientos m
     where m.usuario_id = p_usuario
       and m.id = any (p_ids)
       and ((m.cuenta_origen_id = p_cuenta_id and m.conciliado_origen <> p_conciliado)
            or (m.cuenta_destino_id = p_cuenta_id and m.conciliado_destino <> p_conciliado))
     order by m.fecha, m.creado_en, m.id
       for update
  loop
    v_antes := public.foto_movimiento(v_id);

    update public.movimientos m
       set conciliado_origen = case when m.cuenta_origen_id = p_cuenta_id
                                    then p_conciliado else m.conciliado_origen end,
           conciliado_destino = case when m.cuenta_destino_id = p_cuenta_id
                                     then p_conciliado else m.conciliado_destino end
     where m.id = v_id;

    insert into public.movimientos_cambios (movimiento_id, usuario_id, operacion, antes, despues)
    values (v_id, p_usuario, 'conciliacion', v_antes, public.foto_movimiento(v_id));
  end loop;
end;
$$;

revoke all on function privado.marcar_conciliacion(uuid, uuid, uuid[], boolean)
  from public, anon, authenticated;

-- Cuenta del usuario con detalle (efectivo o banco), no archivada.
create function privado.comprobar_cuenta_con_detalle(p_usuario uuid, p_cuenta_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo text;
  v_archivada timestamptz;
begin
  select c.tipo, c.archivada_en into v_tipo, v_archivada
    from public.cuentas c
   where c.id = p_cuenta_id and c.usuario_id = p_usuario
     and c.tipo not in ('prestamo_otorgado', 'deuda_contraida');
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA';
  end if;
  if v_tipo not in ('efectivo', 'banco') then
    raise exception 'TIPO_NO_ADMITIDO';
  end if;
  if v_archivada is not null then
    raise exception 'CUENTA_ARCHIVADA';
  end if;
end;
$$;

revoke all on function privado.comprobar_cuenta_con_detalle(uuid, uuid)
  from public, anon, authenticated;

create function privado.conciliar_movimientos(
  p_cuenta_id uuid,
  p_ids uuid[],
  p_conciliado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or p_conciliado is null then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  perform privado.comprobar_cuenta_con_detalle(v_usuario, p_cuenta_id);

  if (select count(*) from public.movimientos m
       where m.usuario_id = v_usuario
         and m.id = any (p_ids)
         and p_cuenta_id in (m.cuenta_origen_id, m.cuenta_destino_id))
     <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'MOVIMIENTO_NO_ENCONTRADO';
  end if;

  perform privado.marcar_conciliacion(v_usuario, p_cuenta_id, p_ids, p_conciliado);
end;
$$;

revoke all on function privado.conciliar_movimientos(uuid, uuid[], boolean) from public, anon;
grant execute on function privado.conciliar_movimientos(uuid, uuid[], boolean) to authenticated;

create function public.conciliar_movimientos(
  p_cuenta_id uuid,
  p_ids uuid[],
  p_conciliado boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select privado.conciliar_movimientos(p_cuenta_id, p_ids, p_conciliado);
$$;

revoke all on function public.conciliar_movimientos(uuid, uuid[], boolean) from public, anon;
grant execute on function public.conciliar_movimientos(uuid, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ajuste de saldo. Monto y dirección los calcula la API (Postgres no ve
--    cifras): p_monto es el |diferencia| cifrado; p_sube, su signo.
-- ---------------------------------------------------------------------------
create function privado.registrar_ajuste(
  p_id uuid,
  p_cuenta_id uuid,
  p_monto text,
  p_sube boolean,
  p_fecha date,
  p_conciliar boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_categoria uuid;
  v_pendientes uuid[];
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  if p_sube is null or p_fecha is null then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  perform privado.comprobar_cuenta_con_detalle(v_usuario, p_cuenta_id);

  select k.id into v_categoria
    from public.categorias k
   where k.usuario_id = v_usuario and k.tipo = 'ajuste';
  if not found then
    raise exception 'ERROR_INTERNO';
  end if;

  perform privado.registrar_movimiento(
    p_id, 'ajuste', p_monto, p_fecha, 'Ajuste de saldo', null,
    case when p_sube then null else p_cuenta_id end,
    case when p_sube then p_cuenta_id else null end,
    v_categoria, null);

  -- Nace conciliado en su cuenta: sin fila de historial.
  update public.movimientos m
     set conciliado_origen = (m.cuenta_origen_id is not null),
         conciliado_destino = (m.cuenta_destino_id is not null)
   where m.id = p_id;

  if coalesce(p_conciliar, false) then
    select array_agg(m.id) into v_pendientes
      from public.movimientos m
     where m.usuario_id = v_usuario
       and m.fecha <= p_fecha
       and p_cuenta_id in (m.cuenta_origen_id, m.cuenta_destino_id);
    if v_pendientes is not null then
      perform privado.marcar_conciliacion(v_usuario, p_cuenta_id, v_pendientes, true);
    end if;
  end if;

  return p_id;
end;
$$;

revoke all on function privado.registrar_ajuste(uuid, uuid, text, boolean, date, boolean)
  from public, anon;
grant execute on function privado.registrar_ajuste(uuid, uuid, text, boolean, date, boolean)
  to authenticated;

create function public.registrar_ajuste(
  p_id uuid,
  p_cuenta_id uuid,
  p_monto text,
  p_sube boolean,
  p_fecha date,
  p_conciliar boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_ajuste(p_id, p_cuenta_id, p_monto, p_sube, p_fecha, p_conciliar);
$$;

revoke all on function public.registrar_ajuste(uuid, uuid, text, boolean, date, boolean)
  from public, anon;
grant execute on function public.registrar_ajuste(uuid, uuid, text, boolean, date, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Tabla tarjetas: condiciones de una tarjeta, 1:1 con su cuenta. Una
--    tarjeta creada antes de SPEC 14 no tiene fila (sin ciclo, N-79).
--    La tasa no es un monto y no se cifra; la cuota de manejo sí.
-- ---------------------------------------------------------------------------
create table public.tarjetas (
  cuenta_id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  dia_corte smallint not null check (dia_corte between 1 and 31),
  dia_pago smallint not null check (dia_pago between 1 and 31),
  -- Centésimas de punto: 1,98 % M.V. = 198.
  tasa_mensual_cpb integer check (tasa_mensual_cpb between 0 and 10000),
  -- AAD tarjetas|cuota_manejo|<cuenta_id>.
  cuota_manejo text
    constraint tarjetas_cuota_manejo_cifrado check (
      cuota_manejo ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  cuenta_pago_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tarjetas_usuario_id_cuenta_id_key unique (usuario_id, cuenta_id),
  constraint tarjetas_cuenta_fkey
    foreign key (usuario_id, cuenta_id)
    references public.cuentas (usuario_id, id)
    on delete cascade,
  constraint tarjetas_cuenta_pago_fkey
    foreign key (usuario_id, cuenta_pago_id)
    references public.cuentas (usuario_id, id)
    on delete set null (cuenta_pago_id),
  constraint tarjetas_cuenta_pago_check
    check (cuenta_pago_id is null or cuenta_pago_id <> cuenta_id)
);

create index tarjetas_usuario_idx on public.tarjetas (usuario_id);
create index tarjetas_cuenta_pago_idx on public.tarjetas (usuario_id, cuenta_pago_id);

alter table public.tarjetas enable row level security;

-- Sin DELETE: cae con la cuenta.
create policy tarjetas_select_propia on public.tarjetas
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy tarjetas_insert_propia on public.tarjetas
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy tarjetas_update_propia on public.tarjetas
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create trigger tarjetas_marcar_actualizado
  before update on public.tarjetas
  for each row execute function public.marcar_actualizado();

-- Lo que las restricciones no expresan. Una cuenta ajena o inexistente no se
-- ve: la rechazan las FK.
create function public.validar_tarjeta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.cuentas c
              where c.id = new.cuenta_id and c.usuario_id = new.usuario_id
                and c.tipo <> 'tarjeta_credito') then
    raise exception 'TIPO_NO_ADMITIDO';
  end if;

  if new.cuenta_pago_id is not null and exists (
       select 1 from public.cuentas c
        where c.id = new.cuenta_pago_id and c.usuario_id = new.usuario_id
          and (c.tipo not in ('efectivo', 'banco') or c.archivada_en is not null)) then
    raise exception 'CUENTA_PAGO_INVALIDA:tarjeta.cuentaPagoId';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_tarjeta() from public, anon, authenticated;

create trigger tarjetas_validar
  before insert or update of cuenta_id, cuenta_pago_id on public.tarjetas
  for each row execute function public.validar_tarjeta();

-- ---------------------------------------------------------------------------
-- 8. Tabla tarjetas_cambios (RN-13), con la forma de cuentas_cambios.
-- ---------------------------------------------------------------------------
create table public.tarjetas_cambios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  campo text not null
    check (campo in ('dia_corte', 'dia_pago', 'tasa_mensual_cpb', 'cuota_manejo', 'cuenta_pago_id')),
  valor_anterior text,
  valor_nuevo text,
  cambiado_en timestamptz not null default now()
);

create index tarjetas_cambios_usuario_idx on public.tarjetas_cambios (usuario_id);
create index tarjetas_cambios_cuenta_idx on public.tarjetas_cambios (cuenta_id);

alter table public.tarjetas_cambios enable row level security;

-- Solo lectura: el historial no se edita.
create policy tarjetas_cambios_select_propio on public.tarjetas_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- Una fila por campo que cambió. cuota_manejo se copia cifrada (conserva la
-- AAD de su fila). Si el usuario o la cuenta se están borrando (cascada), no
-- registra nada.
create function public.registrar_cambio_tarjeta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = new.usuario_id)
     or not exists (select 1 from public.cuentas c where c.id = new.cuenta_id) then
    return null;
  end if;

  insert into public.tarjetas_cambios (cuenta_id, usuario_id, campo, valor_anterior, valor_nuevo)
  select new.cuenta_id, new.usuario_id, c.campo, c.anterior, c.nuevo
    from (values
      ('dia_corte', old.dia_corte::text, new.dia_corte::text),
      ('dia_pago', old.dia_pago::text, new.dia_pago::text),
      ('tasa_mensual_cpb', old.tasa_mensual_cpb::text, new.tasa_mensual_cpb::text),
      ('cuota_manejo', old.cuota_manejo, new.cuota_manejo),
      ('cuenta_pago_id', old.cuenta_pago_id::text, new.cuenta_pago_id::text)
    ) as c (campo, anterior, nuevo)
   where c.anterior is distinct from c.nuevo;
  return null;
end;
$$;

revoke all on function public.registrar_cambio_tarjeta() from public, anon, authenticated;

create trigger tarjetas_registrar_cambio
  after update on public.tarjetas
  for each row execute function public.registrar_cambio_tarjeta();

-- ---------------------------------------------------------------------------
-- 9. Archivar la cuenta de pago la quita de sus tarjetas (N-84). Borrarla lo
--    hace la FK (on delete set null). El cambio queda en tarjetas_cambios.
-- ---------------------------------------------------------------------------
create function public.quitar_cuenta_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.tarjetas t
     set cuenta_pago_id = null
   where t.usuario_id = new.usuario_id
     and t.cuenta_pago_id = new.id;
  return null;
end;
$$;

revoke all on function public.quitar_cuenta_pago() from public, anon, authenticated;

create trigger cuentas_quitar_cuenta_pago
  after update of archivada_en on public.cuentas
  for each row
  when (old.archivada_en is null and new.archivada_en is not null)
  execute function public.quitar_cuenta_pago();

-- ---------------------------------------------------------------------------
-- 10. crear_tarjeta: la cuenta y sus condiciones en una transacción. Security
--     invoker: aplican las políticas de cuentas y tarjetas. La API genera el
--     id (AAD) y cifra saldo inicial, cupo y cuota.
-- ---------------------------------------------------------------------------
create function public.crear_tarjeta(
  p_id uuid,
  p_nombre text,
  p_detalle text,
  p_saldo_inicial text,
  p_cupo text,
  p_dia_corte smallint,
  p_dia_pago smallint,
  p_tasa_mensual_cpb integer,
  p_cuota_manejo text,
  p_cuenta_pago_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.cuentas (id, nombre, tipo, detalle, saldo_inicial, cupo)
  values (p_id, p_nombre, 'tarjeta_credito', p_detalle, p_saldo_inicial, p_cupo);

  insert into public.tarjetas (
    cuenta_id, dia_corte, dia_pago, tasa_mensual_cpb, cuota_manejo, cuenta_pago_id)
  values (
    p_id, p_dia_corte, p_dia_pago, p_tasa_mensual_cpb, p_cuota_manejo, p_cuenta_pago_id);

  return p_id;
end;
$$;

revoke all on function public.crear_tarjeta(uuid, text, text, text, text, smallint, smallint, integer, text, uuid)
  from public, anon;
grant execute on function public.crear_tarjeta(uuid, text, text, text, text, smallint, smallint, integer, text, uuid)
  to authenticated;
