-- SPEC 04: movimientos y captura rápida.
-- Categorías sembradas, reglas de categorización, movimientos con partes,
-- historial de cambios, saldo calculado con movimientos, bloqueo de moneda
-- base y cuenta predeterminada. RLS desde la primera migración (REGLAS §4).
--
-- Patrón: toda escritura de movimientos pasa por funciones security definer
-- que fuerzan usuario_id = auth.uid(). Las tablas no tienen políticas de
-- escritura para el usuario.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Cambios en tablas existentes
-- ---------------------------------------------------------------------------

-- Destino de las FK compuestas (usuario_id, cuenta): garantizan en la BD que
-- la cuenta referida es del mismo usuario.
alter table public.cuentas
  add constraint cuentas_usuario_id_id_key unique (usuario_id, id);

-- Cuenta predeterminada de la captura. Se resuelve al leer: si es nula o está
-- archivada, la API usa la primera activa del orden.
alter table public.perfiles
  add column cuenta_predeterminada_id uuid;

alter table public.perfiles
  add constraint perfiles_cuenta_predeterminada_fkey
  foreign key (id, cuenta_predeterminada_id)
  references public.cuentas (usuario_id, id)
  on delete set null (cuenta_predeterminada_id);

-- ---------------------------------------------------------------------------
-- Tabla categorias. Solo la semilla las crea; el usuario solo las lee.
-- ---------------------------------------------------------------------------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null
    check (char_length(btrim(nombre)) between 1 and 40),
  tipo text not null
    check (tipo in ('gasto', 'ingreso')),
  posicion integer not null,
  creado_en timestamptz not null default now(),
  constraint categorias_usuario_id_tipo_key unique (usuario_id, id, tipo),
  constraint categorias_usuario_id_id_key unique (usuario_id, id)
);

create unique index categorias_nombre_unico
  on public.categorias (usuario_id, tipo, lower(nombre));
create index categorias_usuario_idx on public.categorias (usuario_id);

alter table public.categorias enable row level security;

create policy categorias_select_propia on public.categorias
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- Tabla reglas_categoria (RN-11). palabra_clave llega normalizada por el
-- dominio (minúsculas, sin tildes, espacios colapsados).
-- ---------------------------------------------------------------------------
create table public.reglas_categoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  palabra_clave text not null
    check (char_length(palabra_clave) between 1 and 60
           and palabra_clave = lower(palabra_clave)),
  categoria_id uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint reglas_categoria_categoria_fkey
    foreign key (usuario_id, categoria_id)
    references public.categorias (usuario_id, id)
    on delete cascade
);

create unique index reglas_palabra_unica
  on public.reglas_categoria (usuario_id, palabra_clave);
create index reglas_usuario_idx on public.reglas_categoria (usuario_id);

alter table public.reglas_categoria enable row level security;

-- Sin DELETE: listar o borrar reglas queda fuera de este spec.
create policy reglas_select_propia on public.reglas_categoria
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy reglas_insert_propia on public.reglas_categoria
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy reglas_update_propia on public.reglas_categoria
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create trigger reglas_categoria_marcar_actualizado
  before update on public.reglas_categoria
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- Tabla movimientos. monto siempre positivo; el efecto en el saldo lo da la
-- naturaleza de la cuenta (RN-02). moneda y tasa congeladas (RN-04).
-- fecha es el día contable del usuario; creado_en, el instante en UTC.
-- ---------------------------------------------------------------------------
create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null
    check (tipo in ('gasto', 'ingreso', 'transferencia')),
  monto numeric(19, 0) not null
    check (monto > 0),
  moneda text not null default 'COP'
    check (moneda = 'COP'),
  tasa numeric(18, 6) not null default 1
    check (tasa > 0),
  fecha date not null,
  descripcion text
    check (char_length(btrim(descripcion)) between 1 and 80),
  nota text
    check (char_length(nota) <= 500),
  cuenta_origen_id uuid,
  cuenta_destino_id uuid,
  categoria_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- RN-03, RN-05: forma de las cuentas por tipo; la transferencia no lleva categoría.
  constraint movimientos_cuentas_por_tipo check (
    (tipo = 'gasto'
      and cuenta_origen_id is not null and cuenta_destino_id is null)
    or (tipo = 'ingreso'
      and cuenta_destino_id is not null and cuenta_origen_id is null)
    or (tipo = 'transferencia'
      and cuenta_origen_id is not null and cuenta_destino_id is not null
      and cuenta_origen_id <> cuenta_destino_id
      and categoria_id is null)
  ),
  constraint movimientos_cuenta_origen_fkey
    foreign key (usuario_id, cuenta_origen_id)
    references public.cuentas (usuario_id, id)
    on delete restrict,
  constraint movimientos_cuenta_destino_fkey
    foreign key (usuario_id, cuenta_destino_id)
    references public.cuentas (usuario_id, id)
    on delete restrict,
  -- MATCH SIMPLE: con categoria_id nulo no se evalúa. Impide la categoría
  -- ajena y la de otro tipo.
  constraint movimientos_categoria_fkey
    foreign key (usuario_id, categoria_id, tipo)
    references public.categorias (usuario_id, id, tipo)
    on delete restrict
);

create index movimientos_usuario_fecha_idx
  on public.movimientos (usuario_id, fecha desc, creado_en desc);
create index movimientos_origen_idx on public.movimientos (cuenta_origen_id);
create index movimientos_destino_idx on public.movimientos (cuenta_destino_id);

alter table public.movimientos enable row level security;

-- Sin INSERT, UPDATE ni DELETE: se escribe por funciones.
create policy movimientos_select_propio on public.movimientos
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create trigger movimientos_marcar_actualizado
  before update on public.movimientos
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- Tabla movimiento_partes: solo cuando el movimiento se divide. Un movimiento
-- con partes tiene categoria_id nulo (lo garantizan las funciones).
-- ---------------------------------------------------------------------------
create table public.movimiento_partes (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos (id) on delete cascade,
  usuario_id uuid not null,
  categoria_id uuid not null,
  monto numeric(19, 0) not null
    check (monto > 0),
  constraint movimiento_partes_categoria_fkey
    foreign key (usuario_id, categoria_id)
    references public.categorias (usuario_id, id)
    on delete restrict,
  constraint movimiento_partes_movimiento_id_categoria_id_key
    unique (movimiento_id, categoria_id)
);

create index movimiento_partes_movimiento_idx on public.movimiento_partes (movimiento_id);
create index movimiento_partes_usuario_idx on public.movimiento_partes (usuario_id);

alter table public.movimiento_partes enable row level security;

create policy movimiento_partes_select_propia on public.movimiento_partes
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- Tabla movimientos_cambios (RN-13). Sin FK al movimiento: sobrevive a la
-- eliminación. antes/despues = fila completa más "partes".
-- ---------------------------------------------------------------------------
create table public.movimientos_cambios (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  operacion text not null
    check (operacion in ('edicion', 'eliminacion')),
  antes jsonb not null,
  despues jsonb,
  cambiado_en timestamptz not null default now()
);

create index movimientos_cambios_usuario_idx on public.movimientos_cambios (usuario_id);
create index movimientos_cambios_movimiento_idx on public.movimientos_cambios (movimiento_id);

alter table public.movimientos_cambios enable row level security;

-- El historial no se edita.
create policy movimientos_cambios_select_propio on public.movimientos_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- Auxiliares internas de las funciones de escritura. security invoker y sin
-- permiso para los roles de la API: solo las llaman las funciones definer.
-- ---------------------------------------------------------------------------

-- Foto del movimiento para el historial: fila completa más partes
-- [{categoria_id, monto}] ordenadas por categoría (sin ids de parte, para que
-- reemplazar partes idénticas no cuente como cambio).
create function public.foto_movimiento(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(m) || jsonb_build_object(
    'partes',
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('categoria_id', p.categoria_id, 'monto', p.monto)
                order by p.categoria_id)
         from public.movimiento_partes p
        where p.movimiento_id = m.id),
      '[]'::jsonb))
  from public.movimientos m
  where m.id = p_id;
$$;

revoke all on function public.foto_movimiento(uuid) from public, anon, authenticated;

-- Normaliza p_partes: nulo, JSON null o [] = sin división.
create function public.partes_o_vacio(p_partes jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_partes) = 'array' then p_partes else '[]'::jsonb end;
$$;

revoke all on function public.partes_o_vacio(jsonb) from public, anon, authenticated;

-- Valida lo que las restricciones no expresan: cuentas nuevas no archivadas
-- y partes. Las cuentas y categorías ajenas las rechazan las FK compuestas.
create function public.validar_escritura_movimiento(
  p_usuario uuid,
  p_tipo text,
  p_monto numeric,
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
  v_monto numeric;
  v_vistas uuid[] := '{}';
  v_total numeric := 0;
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
    v_monto := (v_parte ->> 'monto')::numeric;

    if v_monto is null or v_monto <= 0 or v_monto <> trunc(v_monto) then
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
    v_total := v_total + v_monto;
  end loop;

  if v_total <> p_monto then
    raise exception 'PARTES_NO_SUMAN:partes';
  end if;
end;
$$;

revoke all on function public.validar_escritura_movimiento(uuid, text, numeric, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Si alguna cuenta actual del movimiento está archivada, no se toca (SPEC 03:
-- una archivada tiene saldo cero y no se modifica).
create function public.comprobar_cuentas_actuales(p_movimiento public.movimientos)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (select 1 from public.cuentas c
              where c.id in (p_movimiento.cuenta_origen_id, p_movimiento.cuenta_destino_id)
                and c.archivada_en is not null) then
    raise exception 'CUENTA_ARCHIVADA';
  end if;
end;
$$;

revoke all on function public.comprobar_cuentas_actuales(public.movimientos)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones de escritura. security definer: fuerzan usuario_id = auth.uid().
-- Errores: raise exception '<CODIGO>' o '<CODIGO>:<campo>'.
-- ---------------------------------------------------------------------------
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_fecha date;
  v_id uuid;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  -- Sin fecha: hoy en la zona del perfil.
  v_fecha := coalesce(
    p_fecha,
    (now() at time zone coalesce(
      (select p.zona_horaria from public.perfiles p where p.id = v_usuario),
      'America/Bogota'))::date);

  perform public.validar_escritura_movimiento(
    v_usuario, p_tipo, p_monto, p_cuenta_origen_id, p_cuenta_destino_id,
    p_categoria_id, p_partes);

  insert into public.movimientos (
    usuario_id, tipo, monto, fecha, descripcion, nota,
    cuenta_origen_id, cuenta_destino_id, categoria_id)
  values (
    v_usuario, p_tipo, p_monto, v_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id)
  returning id into v_id;

  insert into public.movimiento_partes (movimiento_id, usuario_id, categoria_id, monto)
  select v_id, v_usuario, (e ->> 'categoria_id')::uuid, (e ->> 'monto')::numeric
    from jsonb_array_elements(public.partes_o_vacio(p_partes)) as e;

  return v_id;
end;
$$;

revoke all on function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

-- Reemplazo completo (PUT). Sin p_fecha conserva la fecha actual.
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_actual public.movimientos;
  v_antes jsonb;
  v_despues jsonb;
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
    v_usuario, p_tipo, p_monto, p_cuenta_origen_id, p_cuenta_destino_id,
    p_categoria_id, p_partes);

  v_antes := public.foto_movimiento(p_id);

  update public.movimientos
     set tipo = p_tipo,
         monto = p_monto,
         fecha = coalesce(p_fecha, v_actual.fecha),
         descripcion = p_descripcion,
         nota = p_nota,
         cuenta_origen_id = p_cuenta_origen_id,
         cuenta_destino_id = p_cuenta_destino_id,
         categoria_id = p_categoria_id
   where id = p_id;

  delete from public.movimiento_partes where movimiento_id = p_id;
  insert into public.movimiento_partes (movimiento_id, usuario_id, categoria_id, monto)
  select p_id, v_usuario, (e ->> 'categoria_id')::uuid, (e ->> 'monto')::numeric
    from jsonb_array_elements(public.partes_o_vacio(p_partes)) as e;

  v_despues := public.foto_movimiento(p_id);

  if (v_antes - 'actualizado_en') is distinct from (v_despues - 'actualizado_en') then
    insert into public.movimientos_cambios (movimiento_id, usuario_id, operacion, antes, despues)
    values (p_id, v_usuario, 'edicion', v_antes, v_despues);
  end if;

  return p_id;
end;
$$;

revoke all on function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

create function public.eliminar_movimiento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_actual public.movimientos;
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

  insert into public.movimientos_cambios (movimiento_id, usuario_id, operacion, antes, despues)
  values (p_id, v_usuario, 'eliminacion', public.foto_movimiento(p_id), null);

  -- Las partes caen en cascada.
  delete from public.movimientos where id = p_id;
end;
$$;

revoke all on function public.eliminar_movimiento(uuid) from public, anon;
grant execute on function public.eliminar_movimiento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones de consulta (REGLAS §5: analítica en SQL). security invoker: la
-- RLS de movimientos sigue aplicando.
-- ---------------------------------------------------------------------------

-- Suma de los gastos de un día. Sin ingresos ni transferencias (RN-05).
-- Devuelve una fila para que el repositorio lea el total como texto
-- (select total::text): un numeric escalar llegaría como número JSON.
create function public.gastos_del_dia(p_fecha date)
returns table (total numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(m.monto), 0)::numeric
    from public.movimientos m
   where m.usuario_id = (select auth.uid())
     and m.tipo = 'gasto'
     and m.fecha = p_fecha;
$$;

revoke all on function public.gastos_del_dia(date) from public, anon;
grant execute on function public.gastos_del_dia(date) to authenticated;

-- Por tipo, las p_limite descripciones más usadas desde p_desde. Agrupa por
-- lower(btrim(descripcion)), muestra la grafía más reciente y desempata por
-- uso más reciente.
create function public.conceptos_frecuentes(p_desde date, p_limite integer)
returns table (tipo text, descripcion text, usos bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with grupos as (
    select m.tipo,
           (array_agg(btrim(m.descripcion) order by m.fecha desc, m.creado_en desc))[1] as descripcion,
           count(*) as usos,
           max(m.fecha) as ultima_fecha,
           max(m.creado_en) as ultimo_registro
      from public.movimientos m
     where m.usuario_id = (select auth.uid())
       and m.descripcion is not null
       and m.fecha >= p_desde
     group by m.tipo, lower(btrim(m.descripcion))
  ),
  ordenados as (
    select g.*,
           row_number() over (
             partition by g.tipo
             order by g.usos desc, g.ultima_fecha desc, g.ultimo_registro desc) as n
      from grupos g
  )
  select o.tipo, o.descripcion, o.usos
    from ordenados o
   where o.n <= p_limite
   order by o.tipo, o.n;
$$;

revoke all on function public.conceptos_frecuentes(date, integer) from public, anon;
grant execute on function public.conceptos_frecuentes(date, integer) to authenticated;

-- Autocompletado: descripciones del tipo que empiezan por el prefijo, sin
-- distinguir mayúsculas ni tildes. Todo el historial, por frecuencia.
-- unaccent con diccionario explícito: con search_path vacío la forma de un
-- argumento no encuentra el diccionario.
create function public.conceptos_por_prefijo(p_tipo text, p_prefijo text, p_limite integer)
returns table (descripcion text, usos bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with patron as (
    select replace(replace(replace(
             extensions.unaccent('extensions.unaccent'::regdictionary, lower(btrim(p_prefijo))),
             '\', '\\'), '%', '\%'), '_', '\_') || '%' as valor
  )
  select (array_agg(btrim(m.descripcion) order by m.fecha desc, m.creado_en desc))[1],
         count(*)
    from public.movimientos m
   cross join patron
   where m.usuario_id = (select auth.uid())
     and m.tipo = p_tipo
     and m.descripcion is not null
     and extensions.unaccent('extensions.unaccent'::regdictionary, lower(btrim(m.descripcion)))
         like patron.valor
   group by lower(btrim(m.descripcion))
   order by count(*) desc, max(m.fecha) desc, max(m.creado_en) desc
   limit p_limite;
$$;

revoke all on function public.conceptos_por_prefijo(text, text, integer) from public, anon;
grant execute on function public.conceptos_por_prefijo(text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Semilla de categorías y reglas.
-- ---------------------------------------------------------------------------
create function public.insertar_semilla(p_usuario uuid)
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
      ('Salario', 'ingreso', 0),
      ('Trabajo independiente', 'ingreso', 1),
      ('Reembolso', 'ingreso', 2),
      ('Otros ingresos', 'ingreso', 3)
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

-- Al crear el perfil, siembra categorías y reglas. security definer: el
-- usuario no tiene política de INSERT en categorias.
create function public.sembrar_categorias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insertar_semilla(new.id);
  return null;
end;
$$;

revoke all on function public.sembrar_categorias() from public, anon, authenticated;

create trigger perfiles_sembrar_categorias
  after insert on public.perfiles
  for each row execute function public.sembrar_categorias();

-- Backfill: perfiles existentes sin categorías.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id from public.perfiles p
     where not exists (select 1 from public.categorias k where k.usuario_id = p.id)
  loop
    perform public.insertar_semilla(v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- bloquear_moneda_base (RN-15): perfiles admite UPDATE directo del usuario,
-- así que la garantía va en un trigger.
-- ---------------------------------------------------------------------------
create function public.bloquear_moneda_base()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.moneda_base is distinct from old.moneda_base
     and exists (select 1 from public.movimientos m where m.usuario_id = new.id) then
    raise exception 'MONEDA_BASE_BLOQUEADA';
  end if;
  return new;
end;
$$;

create trigger perfiles_bloquear_moneda_base
  before update of moneda_base on public.perfiles
  for each row execute function public.bloquear_moneda_base();

-- ---------------------------------------------------------------------------
-- Vista cuentas_con_saldo (reemplazo, mismas columnas). RN-01, RN-02:
-- saldo = saldo_inicial + signo × (entradas − salidas); signo 1 en activo y
-- −1 en pasivo. Espejo SQL de efectoEnSaldo. Cuenta todos los movimientos,
-- también los de fecha futura.
-- ---------------------------------------------------------------------------
create or replace view public.cuentas_con_saldo
with (security_invoker = true)
as
select
  c.*,
  (c.saldo_inicial
    + (case public.naturaleza_de(c.tipo) when 'pasivo' then -1 else 1 end)
      * (coalesce((select sum(m.monto) from public.movimientos m
                    where m.cuenta_destino_id = c.id), 0)
         - coalesce((select sum(m.monto) from public.movimientos m
                      where m.cuenta_origen_id = c.id), 0))
  )::numeric(19, 0) as saldo
from public.cuentas c;

-- ---------------------------------------------------------------------------
-- Vista movimientos_detalle: movimiento con nombres de cuenta y categoría y
-- sus partes. Los montos de las partes van como texto en el jsonb para no
-- pasar por número JSON. security_invoker: respeta la RLS.
-- ---------------------------------------------------------------------------
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
                'monto', p.monto::text)
              order by kp.posicion)
       from public.movimiento_partes p
       join public.categorias kp on kp.id = p.categoria_id
      where p.movimiento_id = m.id),
    '[]'::jsonb) as partes
from public.movimientos m
left join public.cuentas co on co.id = m.cuenta_origen_id
left join public.cuentas cd on cd.id = m.cuenta_destino_id
left join public.categorias k on k.id = m.categoria_id;
