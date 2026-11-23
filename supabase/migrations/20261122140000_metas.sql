-- SPEC 13: metas de ahorro.
-- Una meta vive sobre una cuenta real. En modo 'apartado' separa parte del
-- saldo de una cuenta de efectivo o banco; en modo 'cuenta' toma la cuenta
-- entera (su saldo, o su valor de mercado en COP si es inversión).
-- El avance no se guarda (RN-01): lo deriva src/domain/meta/. Solo se guarda
-- el cumplimiento de una meta sobre inversión (cumplida_en, avance_cumplida),
-- la primera vez que una lectura lo detecta.
-- Un aporte sin origen solo marca dinero que ya está en la cuenta; con origen
-- es además una transferencia real (RN-16) y lee monto y fecha de ella.
-- Montos: text cifrado por la API (SPEC 05). La API genera los ids.
-- RLS desde la primera migración (REGLAS §4).
--
-- Listas espejo de src/domain/meta/meta.ts:
--   MODOS_META = ('apartado', 'cuenta')
--   TIPOS_APORTE = ('aporte', 'retiro')
--   TIPOS_CUENTA_APARTADO = ('efectivo', 'banco')
--   TIPOS_CUENTA_MODO_CUENTA = ('efectivo', 'banco', 'inversion')

-- ---------------------------------------------------------------------------
-- 1. Tabla metas
-- ---------------------------------------------------------------------------
create table public.metas (
  id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  nombre text not null
    check (char_length(btrim(nombre)) between 1 and 60),
  cuenta_id uuid not null,
  modo text not null
    check (modo in ('apartado', 'cuenta')),
  -- AAD metas|objetivo|<id>.
  objetivo text not null
    constraint metas_objetivo_cifrado check (
      objetivo ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  fecha_meta date,
  fecha_meta_es_mes boolean not null default false,
  -- Solo en metas sobre inversión.
  cumplida_en date,
  -- AAD metas|avance_cumplida|<id>.
  avance_cumplida text
    constraint metas_avance_cumplida_cifrado check (
      avance_cumplida ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  archivada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint metas_usuario_id_id_key unique (usuario_id, id),
  constraint metas_cuenta_fkey
    foreign key (usuario_id, cuenta_id)
    references public.cuentas (usuario_id, id)
    on delete restrict,
  -- Un mes se guarda como su último día.
  constraint metas_fecha_mes_check check (
    not fecha_meta_es_mes
    or (fecha_meta is not null
        and fecha_meta = (date_trunc('month', fecha_meta) + interval '1 month - 1 day')::date)),
  constraint metas_cumplida_check check ((cumplida_en is null) = (avance_cumplida is null))
);

create index metas_usuario_idx on public.metas (usuario_id);
create index metas_cuenta_idx on public.metas (usuario_id, cuenta_id);

-- N-56: una sola meta de modo 'cuenta' sin archivar por cuenta. La mezcla con
-- metas por apartado la impide validar_meta.
create unique index metas_cuenta_exclusiva on public.metas (cuenta_id)
  where modo = 'cuenta' and archivada_en is null;

alter table public.metas enable row level security;

create policy metas_select_propia on public.metas
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy metas_insert_propia on public.metas
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy metas_update_propia on public.metas
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy metas_delete_propia on public.metas
  for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- marcar_actualizado: definida en SPEC 02.
create trigger metas_marcar_actualizado
  before update on public.metas
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- 2. Tabla metas_movimientos: aportes y retiros de una meta por apartado.
--    Con movimiento_id, monto y fecha se leen de la transferencia.
-- ---------------------------------------------------------------------------
create table public.metas_movimientos (
  id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  meta_id uuid not null,
  tipo text not null
    check (tipo in ('aporte', 'retiro')),
  -- AAD metas_movimientos|monto|<id>.
  monto text
    constraint metas_movimientos_monto_cifrado check (
      monto ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  fecha date,
  motivo text
    check (char_length(btrim(motivo)) between 1 and 80),
  -- «Apartado inicial».
  inicial boolean not null default false,
  movimiento_id uuid unique,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint metas_movimientos_meta_fkey
    foreign key (usuario_id, meta_id)
    references public.metas (usuario_id, id)
    on delete cascade,
  -- Borrar la transferencia borra el aporte.
  constraint metas_movimientos_movimiento_fkey
    foreign key (usuario_id, movimiento_id)
    references public.movimientos (usuario_id, id)
    on delete cascade,
  constraint metas_movimientos_fuente_check check (
    (movimiento_id is null) = (monto is not null and fecha is not null)),
  constraint metas_movimientos_origen_check check (
    movimiento_id is null or tipo = 'aporte')
);

create index metas_movimientos_usuario_idx on public.metas_movimientos (usuario_id);
create index metas_movimientos_meta_idx on public.metas_movimientos (usuario_id, meta_id);
create unique index metas_movimientos_inicial_idx on public.metas_movimientos (meta_id)
  where inicial;

alter table public.metas_movimientos enable row level security;

create policy metas_movimientos_select_propio on public.metas_movimientos
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy metas_movimientos_insert_propio on public.metas_movimientos
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy metas_movimientos_update_propio on public.metas_movimientos
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy metas_movimientos_delete_propio on public.metas_movimientos
  for delete to authenticated
  using ((select auth.uid()) = usuario_id);

create trigger metas_movimientos_marcar_actualizado
  before update on public.metas_movimientos
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- 3. validar_meta: lo que las restricciones no expresan. Una cuenta ajena o
--    inexistente no se ve: la rechaza la FK metas_cuenta_fkey.
-- ---------------------------------------------------------------------------
create function public.validar_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
  v_archivada timestamptz;
begin
  select c.tipo, c.archivada_en into v_tipo, v_archivada
    from public.cuentas c
   where c.id = new.cuenta_id and c.usuario_id = new.usuario_id;

  if found then
    if (new.modo = 'apartado' and v_tipo not in ('efectivo', 'banco'))
       or (new.modo = 'cuenta' and v_tipo not in ('efectivo', 'banco', 'inversion')) then
      raise exception 'CUENTA_NO_ADMITIDA:cuentaId';
    end if;

    -- En un alta, al cambiar de cuenta o al restaurar la meta.
    if v_archivada is not null
       and (tg_op = 'INSERT'
            or old.cuenta_id is distinct from new.cuenta_id
            or (old.archivada_en is not null and new.archivada_en is null)) then
      raise exception 'CUENTA_ARCHIVADA:cuentaId';
    end if;
  end if;

  if new.archivada_en is null and exists (
       select 1 from public.metas m
        where m.cuenta_id = new.cuenta_id
          and m.id <> new.id
          and m.archivada_en is null
          and (m.modo = 'cuenta' or new.modo = 'cuenta')) then
    raise exception 'CUENTA_CON_META_EXCLUSIVA:cuentaId';
  end if;

  if tg_op = 'UPDATE' and old.modo is distinct from new.modo
     and exists (select 1 from public.metas_movimientos mm where mm.meta_id = new.id) then
    raise exception 'META_CON_APORTES:modo';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_meta() from public, anon, authenticated;

create trigger metas_validar
  before insert or update of cuenta_id, modo, archivada_en on public.metas
  for each row execute function public.validar_meta();

-- ---------------------------------------------------------------------------
-- 4. Tabla metas_cambios (RN-13), con la forma de cuentas_cambios. Una tabla
--    para la meta y sus aportes. Sin FK a la meta: sobrevive a su eliminación.
--    Los montos se copian cifrados, con la AAD de su fila de origen.
--    Los cambios de la transferencia de un aporte quedan en
--    movimientos_cambios.
-- ---------------------------------------------------------------------------
create table public.metas_cambios (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  entidad text not null
    check (entidad in ('meta', 'aporte')),
  entidad_id uuid not null,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  cambiado_en timestamptz not null default now()
);

create index metas_cambios_usuario_idx on public.metas_cambios (usuario_id);
create index metas_cambios_meta_idx on public.metas_cambios (meta_id);

alter table public.metas_cambios enable row level security;

-- El historial no se edita.
create policy metas_cambios_select_propio on public.metas_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- security definer: el usuario no tiene política de INSERT en metas_cambios.
-- En DELETE, si el usuario ya no existe (cascada de auth.users), no hay
-- historial que guardar: la fila violaría su FK.
create function public.registrar_cambio_meta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users u where u.id = old.usuario_id) then
      return null;
    end if;
    insert into public.metas_cambios (meta_id, usuario_id, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
    values (old.id, old.usuario_id, 'meta', old.id, 'eliminada', old.nombre, null);
    return null;
  end if;

  insert into public.metas_cambios (meta_id, usuario_id, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
  select new.id, new.usuario_id, 'meta', new.id, c.campo, c.anterior, c.nuevo
    from (values
      ('nombre', old.nombre, new.nombre),
      ('cuenta_id', old.cuenta_id::text, new.cuenta_id::text),
      ('modo', old.modo, new.modo),
      ('objetivo', old.objetivo, new.objetivo),
      ('fecha_meta', old.fecha_meta::text, new.fecha_meta::text),
      ('fecha_meta_es_mes', old.fecha_meta_es_mes::text, new.fecha_meta_es_mes::text),
      ('archivada_en', old.archivada_en::text, new.archivada_en::text)
    ) as c (campo, anterior, nuevo)
   where c.anterior is distinct from c.nuevo;
  return null;
end;
$$;

revoke all on function public.registrar_cambio_meta() from public, anon, authenticated;

create trigger metas_registrar_cambio
  after update or delete on public.metas
  for each row execute function public.registrar_cambio_meta();

create function public.registrar_cambio_aporte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users u where u.id = old.usuario_id) then
      return null;
    end if;
    insert into public.metas_cambios (meta_id, usuario_id, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
    values (old.meta_id, old.usuario_id, 'aporte', old.id, 'eliminado', old.monto, null);
    return null;
  end if;

  insert into public.metas_cambios (meta_id, usuario_id, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
  select new.meta_id, new.usuario_id, 'aporte', new.id, c.campo, c.anterior, c.nuevo
    from (values
      ('monto', old.monto, new.monto),
      ('fecha', old.fecha::text, new.fecha::text),
      ('motivo', old.motivo, new.motivo)
    ) as c (campo, anterior, nuevo)
   where c.anterior is distinct from c.nuevo;
  return null;
end;
$$;

revoke all on function public.registrar_cambio_aporte() from public, anon, authenticated;

create trigger metas_movimientos_registrar_cambio
  after update or delete on public.metas_movimientos
  for each row execute function public.registrar_cambio_aporte();

-- ---------------------------------------------------------------------------
-- 5. registrar_aporte: un aporte o retiro de una meta por apartado; con
--    cuenta de origen, además la transferencia real hacia la cuenta de la
--    meta, en la misma transacción. security definer en privado (como
--    registrar_movimiento), envoltura security invoker en public.
--    p_monto: el del aporte sin origen (AAD metas_movimientos|monto|p_id).
--    p_monto_movimiento: el de la transferencia (AAD movimientos|monto|
--    p_movimiento_id).
-- ---------------------------------------------------------------------------
create function privado.registrar_aporte(
  p_id uuid,
  p_meta_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_motivo text,
  p_inicial boolean,
  p_movimiento_id uuid,
  p_monto_movimiento text,
  p_cuenta_origen_id uuid,
  p_descripcion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cuenta uuid;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select m.cuenta_id into v_cuenta
    from public.metas m
   where m.id = p_meta_id and m.usuario_id = v_usuario;
  if not found then
    raise exception 'META_NO_ENCONTRADA';
  end if;

  if p_cuenta_origen_id is null then
    insert into public.metas_movimientos (
      id, usuario_id, meta_id, tipo, monto, fecha, motivo, inicial)
    values (
      p_id, v_usuario, p_meta_id, p_tipo, p_monto, p_fecha, p_motivo,
      coalesce(p_inicial, false));
  else
    -- Valida origen, préstamo, inversión, archivada y RN-03.
    perform privado.registrar_movimiento(
      p_movimiento_id, 'transferencia', p_monto_movimiento, p_fecha, p_descripcion, null,
      p_cuenta_origen_id, v_cuenta, null, null);

    insert into public.metas_movimientos (
      id, usuario_id, meta_id, tipo, monto, fecha, motivo, inicial, movimiento_id)
    values (
      p_id, v_usuario, p_meta_id, 'aporte', null, null, p_motivo,
      coalesce(p_inicial, false), p_movimiento_id);
  end if;

  return p_id;
end;
$$;

revoke all on function privado.registrar_aporte(uuid, uuid, text, text, date, text, boolean, uuid, text, uuid, text)
  from public, anon;
grant execute on function privado.registrar_aporte(uuid, uuid, text, text, date, text, boolean, uuid, text, uuid, text)
  to authenticated;

create function public.registrar_aporte(
  p_id uuid,
  p_meta_id uuid,
  p_tipo text,
  p_monto text,
  p_fecha date,
  p_motivo text,
  p_inicial boolean,
  p_movimiento_id uuid,
  p_monto_movimiento text,
  p_cuenta_origen_id uuid,
  p_descripcion text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.registrar_aporte(
    p_id, p_meta_id, p_tipo, p_monto, p_fecha, p_motivo, p_inicial,
    p_movimiento_id, p_monto_movimiento, p_cuenta_origen_id, p_descripcion);
$$;

revoke all on function public.registrar_aporte(uuid, uuid, text, text, date, text, boolean, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.registrar_aporte(uuid, uuid, text, text, date, text, boolean, uuid, text, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. crear_meta: la meta y, si llega, su apartado inicial, en una sola
--    transacción. p_objetivo llega cifrado (AAD metas|objetivo|p_id).
--    p_aporte: { id, monto, fecha, motivo, movimiento_id, monto_movimiento,
--    cuenta_origen_id, descripcion }, con los montos cifrados como en
--    registrar_aporte.
-- ---------------------------------------------------------------------------
create function privado.crear_meta(
  p_id uuid,
  p_nombre text,
  p_cuenta_id uuid,
  p_modo text,
  p_objetivo text,
  p_fecha_meta date,
  p_fecha_meta_es_mes boolean,
  p_aporte jsonb
)
returns uuid
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

  -- Los triggers validan cuenta y modo.
  insert into public.metas (
    id, usuario_id, nombre, cuenta_id, modo, objetivo, fecha_meta, fecha_meta_es_mes)
  values (
    p_id, v_usuario, btrim(p_nombre), p_cuenta_id, p_modo, p_objetivo, p_fecha_meta,
    coalesce(p_fecha_meta_es_mes, false));

  if p_aporte is not null and jsonb_typeof(p_aporte) = 'object' then
    perform privado.registrar_aporte(
      (p_aporte ->> 'id')::uuid,
      p_id,
      'aporte',
      p_aporte ->> 'monto',
      (p_aporte ->> 'fecha')::date,
      p_aporte ->> 'motivo',
      true,
      (p_aporte ->> 'movimiento_id')::uuid,
      p_aporte ->> 'monto_movimiento',
      (p_aporte ->> 'cuenta_origen_id')::uuid,
      p_aporte ->> 'descripcion');
  end if;

  return p_id;
end;
$$;

revoke all on function privado.crear_meta(uuid, text, uuid, text, text, date, boolean, jsonb)
  from public, anon;
grant execute on function privado.crear_meta(uuid, text, uuid, text, text, date, boolean, jsonb)
  to authenticated;

create function public.crear_meta(
  p_id uuid,
  p_nombre text,
  p_cuenta_id uuid,
  p_modo text,
  p_objetivo text,
  p_fecha_meta date,
  p_fecha_meta_es_mes boolean,
  p_aporte jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.crear_meta(
    p_id, p_nombre, p_cuenta_id, p_modo, p_objetivo, p_fecha_meta,
    p_fecha_meta_es_mes, p_aporte);
$$;

revoke all on function public.crear_meta(uuid, text, uuid, text, text, date, boolean, jsonb)
  from public, anon;
grant execute on function public.crear_meta(uuid, text, uuid, text, text, date, boolean, jsonb)
  to authenticated;
