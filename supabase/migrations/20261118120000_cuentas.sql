-- SPEC 03: cuentas (efectivo, banco, tarjeta sin ciclo), historial de cambios
-- del saldo inicial, vista con saldo calculado y reordenamiento por grupo.
-- RLS desde la primera migración (REGLAS §4).

-- ---------------------------------------------------------------------------
-- naturaleza_de: espejo SQL de naturalezaDe (src/domain/cuenta/naturaleza.ts).
-- Al ampliar el check de tipo, se tocan las dos.
-- ---------------------------------------------------------------------------
create function public.naturaleza_de(tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case tipo
    when 'efectivo' then 'activo'
    when 'banco' then 'activo'
    when 'tarjeta_credito' then 'pasivo'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Tabla cuentas. El saldo no se almacena (RN-01): sale de cuentas_con_saldo.
-- Montos en unidades menores (COP = pesos). En un pasivo, saldo_inicial es la
-- deuda inicial.
-- ---------------------------------------------------------------------------
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  nombre text not null
    check (char_length(btrim(nombre)) between 1 and 60),
  tipo text not null
    check (tipo in ('efectivo', 'banco', 'tarjeta_credito')),
  detalle text
    check (char_length(detalle) <= 60),
  saldo_inicial numeric(19, 0) not null default 0
    check (saldo_inicial >= 0),
  cupo numeric(19, 0)
    check (cupo > 0),
  posicion integer not null,
  archivada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((cupo is not null) = (tipo = 'tarjeta_credito'))
);

create index cuentas_usuario_idx on public.cuentas (usuario_id);

create unique index cuentas_nombre_unico on public.cuentas (usuario_id, lower(nombre))
  where archivada_en is null;

alter table public.cuentas enable row level security;

create policy cuentas_select_propia on public.cuentas
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy cuentas_insert_propia on public.cuentas
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy cuentas_update_propia on public.cuentas
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy cuentas_delete_propia on public.cuentas
  for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- Tabla cuentas_cambios (RN-13). La escribe solo el trigger
-- registrar_cambio_saldo_inicial; el usuario solo la lee.
-- ---------------------------------------------------------------------------
create table public.cuentas_cambios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  campo text not null check (campo in ('saldo_inicial')),
  valor_anterior numeric(19, 0) not null,
  valor_nuevo numeric(19, 0) not null,
  cambiado_en timestamptz not null default now()
);

create index cuentas_cambios_usuario_idx on public.cuentas_cambios (usuario_id);
create index cuentas_cambios_cuenta_idx on public.cuentas_cambios (cuenta_id);

alter table public.cuentas_cambios enable row level security;

-- Sin INSERT, UPDATE ni DELETE para usuarios: el historial no se edita.
create policy cuentas_cambios_select_propio on public.cuentas_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- asignar_posicion: al insertar, o al restaurar (archivada_en pasa de no nulo
-- a nulo), la cuenta va al final de su grupo (misma naturaleza, no archivadas).
-- ---------------------------------------------------------------------------
create function public.asignar_posicion()
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
       and public.naturaleza_de(c.tipo) = public.naturaleza_de(new.tipo);
  end if;
  return new;
end;
$$;

create trigger cuentas_asignar_posicion
  before insert or update of archivada_en on public.cuentas
  for each row execute function public.asignar_posicion();

-- ---------------------------------------------------------------------------
-- impedir_cambio_naturaleza: un activo no pasa a pasivo ni al revés.
-- Garantía en la BD del mismo error que devuelve el dominio.
-- ---------------------------------------------------------------------------
create function public.impedir_cambio_naturaleza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.naturaleza_de(old.tipo) <> public.naturaleza_de(new.tipo) then
    raise exception 'CAMBIO_DE_NATURALEZA';
  end if;
  return new;
end;
$$;

create trigger cuentas_impedir_cambio_naturaleza
  before update of tipo on public.cuentas
  for each row execute function public.impedir_cambio_naturaleza();

-- ---------------------------------------------------------------------------
-- registrar_cambio_saldo_inicial (RN-13): security definer porque el usuario
-- no tiene política de INSERT en cuentas_cambios. Solo inserta la fila de la
-- cuenta actualizada.
-- ---------------------------------------------------------------------------
create function public.registrar_cambio_saldo_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cuentas_cambios (cuenta_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (new.id, new.usuario_id, 'saldo_inicial', old.saldo_inicial, new.saldo_inicial);
  return null;
end;
$$;

revoke all on function public.registrar_cambio_saldo_inicial() from public, anon, authenticated;

create trigger cuentas_registrar_cambio_saldo_inicial
  after update of saldo_inicial on public.cuentas
  for each row
  when (old.saldo_inicial is distinct from new.saldo_inicial)
  execute function public.registrar_cambio_saldo_inicial();

-- marcar_actualizado: definida en SPEC 02.
create trigger cuentas_marcar_actualizado
  before update on public.cuentas
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- reordenar_cuentas: p_ids debe ser exactamente el conjunto de cuentas no
-- archivadas del usuario con esa naturaleza, sin repetidos. Escribe
-- posicion = ordinal - 1 en una sola sentencia.
-- security invoker: la RLS de cuentas sigue aplicando, así que un id ajeno
-- no se ve y el conjunto no coincide.
-- ---------------------------------------------------------------------------
create function public.reordenar_cuentas(p_naturaleza text, p_ids uuid[])
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

revoke all on function public.reordenar_cuentas(text, uuid[]) from public, anon;
grant execute on function public.reordenar_cuentas(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Vista cuentas_con_saldo: única fuente del saldo (RN-01). Hoy es el saldo
-- inicial; el spec de movimientos le suma el efecto de los movimientos.
-- security_invoker: respeta la RLS de cuentas.
-- ---------------------------------------------------------------------------
create view public.cuentas_con_saldo
with (security_invoker = true)
as
select
  c.*,
  c.saldo_inicial::numeric(19, 0) as saldo
from public.cuentas c;
