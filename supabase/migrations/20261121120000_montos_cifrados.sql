-- SPEC 05: montos cifrados en la base de datos (REGLAS §4).
--
-- La API cifra cada monto con AES-256-GCM antes de escribirlo y lo descifra al
-- leerlo. Postgres solo guarda texto opaco con formato
-- v<versión>.<iv>.<cifrado>.<tag> (base64url), así que no puede sumar, comparar
-- ni validar montos: el saldo (RN-01, RN-02), el gasto del día y las
-- validaciones de importes pasan a src/domain/ de la API (REGLAS §5, §6).
--
-- No hay datos reales: se borran los datos de prueba de cuentas y movimientos.

-- ---------------------------------------------------------------------------
-- 1. Datos actuales fuera. Los perfiles, categorías y reglas se conservan.
-- ---------------------------------------------------------------------------
delete from public.movimientos_cambios;
delete from public.movimiento_partes;
delete from public.movimientos;
delete from public.cuentas_cambios;
update public.perfiles set cuenta_predeterminada_id = null
 where cuenta_predeterminada_id is not null;
delete from public.cuentas;

-- ---------------------------------------------------------------------------
-- 2. Lo que operaba sobre montos en SQL, o depende del tipo de sus columnas.
--    movimientos_detalle se recrea abajo; cuentas_con_saldo y gastos_del_dia
--    no vuelven (el cálculo vive en la API).
-- ---------------------------------------------------------------------------
drop view public.cuentas_con_saldo;
drop view public.movimientos_detalle;
drop function public.gastos_del_dia(date);

-- El WHEN del trigger usa saldo_inicial: impide cambiarle el tipo.
drop trigger cuentas_registrar_cambio_saldo_inicial on public.cuentas;

-- Firmas con p_monto numeric. Las envolturas públicas primero.
drop function public.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb);
drop function public.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb);
drop function privado.registrar_movimiento(text, numeric, date, text, text, uuid, uuid, uuid, jsonb);
drop function privado.reemplazar_movimiento(uuid, text, numeric, date, text, text, uuid, uuid, uuid, jsonb);
drop function public.validar_escritura_movimiento(uuid, text, numeric, uuid, uuid, uuid, jsonb);

-- ---------------------------------------------------------------------------
-- 3. Columnas de monto: numeric → text cifrado. Sin restricciones numéricas
--    (monto > 0, saldo_inicial >= 0, cupo > 0): las valida el dominio.
--    La restricción de formato rechaza un monto escrito en claro por error.
--    Longitudes fijas: iv 12 bytes, cifrado 19 bytes (19 dígitos), tag 16.
-- ---------------------------------------------------------------------------
alter table public.movimientos drop constraint movimientos_monto_check;
alter table public.movimientos
  alter column monto type text using monto::text,
  add constraint movimientos_monto_cifrado check (
    monto ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$');

alter table public.movimiento_partes drop constraint movimiento_partes_monto_check;
alter table public.movimiento_partes
  alter column monto type text using monto::text,
  add constraint movimiento_partes_monto_cifrado check (
    monto ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$');

-- cuentas_check ((cupo is not null) = (tipo = 'tarjeta_credito')) se mantiene.
alter table public.cuentas drop constraint cuentas_saldo_inicial_check;
alter table public.cuentas drop constraint cuentas_cupo_check;
alter table public.cuentas
  alter column saldo_inicial drop default,
  alter column saldo_inicial type text using saldo_inicial::text,
  alter column cupo type text using cupo::text,
  add constraint cuentas_saldo_inicial_cifrado check (
    saldo_inicial ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  add constraint cuentas_cupo_cifrado check (
    cupo ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$');

-- El historial copia el texto cifrado de cuentas.saldo_inicial tal cual.
alter table public.cuentas_cambios
  alter column valor_anterior type text using valor_anterior::text,
  alter column valor_nuevo type text using valor_nuevo::text,
  add constraint cuentas_cambios_valor_anterior_cifrado check (
    valor_anterior ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  add constraint cuentas_cambios_valor_nuevo_cifrado check (
    valor_nuevo ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$');

-- Misma lógica que en SPEC 03. Compara textos cifrados: la API reutiliza el
-- cifrado guardado si el saldo inicial no cambió, así que un texto distinto
-- es un cambio real.
create trigger cuentas_registrar_cambio_saldo_inicial
  after update of saldo_inicial on public.cuentas
  for each row
  when (old.saldo_inicial is distinct from new.saldo_inicial)
  execute function public.registrar_cambio_saldo_inicial();

-- ---------------------------------------------------------------------------
-- 4. validar_escritura_movimiento sin p_monto: valida cuentas archivadas y la
--    forma de las partes (no transferencia, sin categoría propia, dos o más,
--    sin repetir, categoría del usuario y del tipo). Que cada parte sea > 0 y
--    que sumen el monto lo valida el dominio (validarMovimiento).
-- ---------------------------------------------------------------------------
create function public.validar_escritura_movimiento(
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

revoke all on function public.validar_escritura_movimiento(uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Funciones de escritura (security definer en privado, envolturas security
--    invoker en public, como en ..._movimientos_esquema_privado.sql).
--    p_monto y el monto de cada parte llegan cifrados. registrar_movimiento
--    recibe el id: la API lo necesita antes del insert para atar el cifrado
--    a la fila (AAD).
-- ---------------------------------------------------------------------------
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

  insert into public.movimientos (
    id, usuario_id, tipo, monto, fecha, descripcion, nota,
    cuenta_origen_id, cuenta_destino_id, categoria_id)
  values (
    p_id, v_usuario, p_tipo, p_monto, v_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id);

  insert into public.movimiento_partes (movimiento_id, usuario_id, categoria_id, monto)
  select p_id, v_usuario, (e ->> 'categoria_id')::uuid, e ->> 'monto'
    from jsonb_array_elements(public.partes_o_vacio(p_partes)) as e;

  return p_id;
end;
$$;

revoke all on function privado.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function privado.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

-- Reemplazo completo (PUT). Sin p_fecha conserva la fecha actual. El historial
-- compara las fotos antes y después: la API reutiliza los textos cifrados que
-- no cambiaron, así que una diferencia es un cambio real.
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
    v_usuario, p_tipo, p_cuenta_origen_id, p_cuenta_destino_id,
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

revoke all on function privado.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function privado.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
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
  p_partes jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_movimiento(
    p_id, p_tipo, p_monto, p_fecha, p_descripcion, p_nota,
    p_cuenta_origen_id, p_cuenta_destino_id, p_categoria_id, p_partes);
$$;

revoke all on function public.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
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

revoke all on function public.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.reemplazar_movimiento(uuid, text, text, date, text, text, uuid, uuid, uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. movimientos_detalle: igual que en SPEC 04; el monto de cada parte ya es
--    texto (cifrado). security_invoker: respeta la RLS.
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
