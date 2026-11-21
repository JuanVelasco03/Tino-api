-- SPEC 07: recurrentes.
-- Plantillas recurrentes (gasto, ingreso, transferencia), cierres de sus
-- ocurrencias (confirmada u omitida), historial de cambios de la plantilla,
-- vista con nombres y confirmación atómica (movimiento + cierre).
-- RLS desde la primera migración (REGLAS §4).
--
-- Las ocurrencias no se guardan: las deriva el dominio de la API desde el
-- calendario de la plantilla. Solo se guarda el cierre de una ocurrencia.
-- Nada toca saldos sin el usuario (RN-10): un movimiento solo nace al
-- confirmar, por registrar_movimiento.

-- ---------------------------------------------------------------------------
-- Cambios en tablas existentes
-- ---------------------------------------------------------------------------

-- Destino de la FK compuesta (usuario_id, movimiento_id) de los cierres.
alter table public.movimientos
  add constraint movimientos_usuario_id_id_key unique (usuario_id, id);

-- ---------------------------------------------------------------------------
-- Tabla recurrentes. id lo genera la API: ata el cifrado del monto a la fila
-- (AAD <usuario_id>|recurrentes|monto|<id>, SPEC 05).
-- Calendario: periodicidad + ancla primer_vencimiento + ultimo_dia.
-- generar_desde: primera fecha que genera ocurrencias.
-- pausada_desde: nula = activa; si no, no hay ocurrencias desde esa fecha.
-- ---------------------------------------------------------------------------
create table public.recurrentes (
  id uuid primary key,
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  tipo text not null
    check (tipo in ('gasto', 'ingreso', 'transferencia')),
  concepto text not null
    check (char_length(btrim(concepto)) between 1 and 80),
  monto text not null,
  variable boolean not null default false,
  cuenta_origen_id uuid,
  cuenta_destino_id uuid,
  categoria_id uuid,
  periodicidad text not null
    check (periodicidad in ('semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual')),
  primer_vencimiento date not null,
  ultimo_dia boolean not null default false,
  generar_desde date not null,
  pausada_desde date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint recurrentes_monto_cifrado check (
    monto ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$'),
  -- RN-03, RN-05: la misma forma que movimientos_cuentas_por_tipo.
  constraint recurrentes_cuentas_por_tipo check (
    (tipo = 'gasto'
      and cuenta_origen_id is not null and cuenta_destino_id is null)
    or (tipo = 'ingreso'
      and cuenta_destino_id is not null and cuenta_origen_id is null)
    or (tipo = 'transferencia'
      and cuenta_origen_id is not null and cuenta_destino_id is not null
      and cuenta_origen_id <> cuenta_destino_id
      and categoria_id is null)
  ),
  constraint recurrentes_ultimo_dia check (
    not ultimo_dia or periodicidad in ('mensual', 'bimestral', 'trimestral', 'anual')),
  constraint recurrentes_usuario_id_id_key unique (usuario_id, id),
  constraint recurrentes_cuenta_origen_fkey
    foreign key (usuario_id, cuenta_origen_id)
    references public.cuentas (usuario_id, id)
    on delete restrict,
  constraint recurrentes_cuenta_destino_fkey
    foreign key (usuario_id, cuenta_destino_id)
    references public.cuentas (usuario_id, id)
    on delete restrict,
  -- MATCH SIMPLE, como en movimientos: con categoria_id nulo no se evalúa.
  -- Impide la categoría ajena y la de otro tipo.
  constraint recurrentes_categoria_fkey
    foreign key (usuario_id, categoria_id, tipo)
    references public.categorias (usuario_id, id, tipo)
    on delete restrict
);

create index recurrentes_usuario_idx on public.recurrentes (usuario_id);
create index recurrentes_origen_idx on public.recurrentes (usuario_id, cuenta_origen_id);
create index recurrentes_destino_idx on public.recurrentes (usuario_id, cuenta_destino_id);
create index recurrentes_categoria_idx on public.recurrentes (usuario_id, categoria_id, tipo);

alter table public.recurrentes enable row level security;

create policy recurrentes_select_propia on public.recurrentes
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy recurrentes_insert_propia on public.recurrentes
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy recurrentes_update_propia on public.recurrentes
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy recurrentes_delete_propia on public.recurrentes
  for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- marcar_actualizado: definida en SPEC 02.
create trigger recurrentes_marcar_actualizado
  before update on public.recurrentes
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- Tabla recurrentes_cierres: cómo se cerró una ocurrencia (recurrente_id +
-- vencimiento). Una confirmada apunta a su movimiento; al borrarlo, el cierre
-- cae en cascada y la ocurrencia vuelve a la bandeja.
-- ---------------------------------------------------------------------------
create table public.recurrentes_cierres (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  recurrente_id uuid not null,
  vencimiento date not null,
  estado text not null
    check (estado in ('confirmada', 'omitida')),
  movimiento_id uuid,
  creado_en timestamptz not null default now(),
  constraint recurrentes_cierres_movimiento check (
    (estado = 'confirmada') = (movimiento_id is not null)),
  -- Una ocurrencia se cierra una sola vez.
  constraint recurrentes_cierres_unico unique (recurrente_id, vencimiento),
  constraint recurrentes_cierres_recurrente_fkey
    foreign key (usuario_id, recurrente_id)
    references public.recurrentes (usuario_id, id)
    on delete cascade,
  constraint recurrentes_cierres_movimiento_fkey
    foreign key (usuario_id, movimiento_id)
    references public.movimientos (usuario_id, id)
    on delete cascade
);

create index recurrentes_cierres_usuario_idx on public.recurrentes_cierres (usuario_id);
create unique index recurrentes_cierres_movimiento_idx
  on public.recurrentes_cierres (usuario_id, movimiento_id);

alter table public.recurrentes_cierres enable row level security;

create policy recurrentes_cierres_select_propio on public.recurrentes_cierres
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- Por RLS directa solo se omite y se deshace una omisión. Una confirmada solo
-- nace en confirmar_ocurrencia y solo muere con su movimiento. Sin UPDATE.
create policy recurrentes_cierres_insert_omision on public.recurrentes_cierres
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id and estado = 'omitida');

create policy recurrentes_cierres_delete_omision on public.recurrentes_cierres
  for delete to authenticated
  using ((select auth.uid()) = usuario_id and estado = 'omitida');

-- ---------------------------------------------------------------------------
-- Tabla recurrentes_cambios (RN-13). Sin FK a la plantilla: sobrevive a la
-- eliminación. antes/despues = fila completa; el monto viaja cifrado con la
-- AAD de su fila (SPEC 05). La escribe solo el trigger.
-- ---------------------------------------------------------------------------
create table public.recurrentes_cambios (
  id uuid primary key default gen_random_uuid(),
  recurrente_id uuid not null,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  operacion text not null
    check (operacion in ('edicion', 'eliminacion')),
  antes jsonb not null,
  despues jsonb,
  cambiado_en timestamptz not null default now()
);

create index recurrentes_cambios_usuario_idx on public.recurrentes_cambios (usuario_id);
create index recurrentes_cambios_recurrente_idx on public.recurrentes_cambios (recurrente_id);

alter table public.recurrentes_cambios enable row level security;

-- El historial no se edita.
create policy recurrentes_cambios_select_propio on public.recurrentes_cambios
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- registrar_cambio_recurrente (RN-13): security definer porque el usuario no
-- tiene política de INSERT en recurrentes_cambios.
-- En UPDATE compara las fotos sin actualizado_en: la API reutiliza el monto
-- cifrado si no cambió, así que una diferencia es un cambio real. La pausa y
-- la reanudación son ediciones.
-- En DELETE, si el usuario ya no existe (la plantilla cae en la cascada de
-- auth.users), no hay historial que guardar: la fila violaría su FK.
-- ---------------------------------------------------------------------------
create function public.registrar_cambio_recurrente()
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

    insert into public.recurrentes_cambios (recurrente_id, usuario_id, operacion, antes, despues)
    values (new.id, new.usuario_id, 'edicion', to_jsonb(old), to_jsonb(new));
  else
    if not exists (select 1 from auth.users u where u.id = old.usuario_id) then
      return null;
    end if;

    insert into public.recurrentes_cambios (recurrente_id, usuario_id, operacion, antes, despues)
    values (old.id, old.usuario_id, 'eliminacion', to_jsonb(old), null);
  end if;

  return null;
end;
$$;

revoke all on function public.registrar_cambio_recurrente() from public, anon, authenticated;

create trigger recurrentes_registrar_cambio
  after update or delete on public.recurrentes
  for each row execute function public.registrar_cambio_recurrente();

-- ---------------------------------------------------------------------------
-- confirmar_ocurrencia: movimiento y cierre en una sola transacción.
-- security definer en privado (como registrar_movimiento), envoltura security
-- invoker en public con la misma firma.
-- No valida el calendario: que p_vencimiento sea una ocurrencia abierta y
-- dentro de la ventana lo comprueba el dominio antes de llamarla.
-- p_monto llega cifrado con la AAD movimientos|monto|p_movimiento_id.
-- Un 23505 sobre recurrentes_cierres_unico revierte también el movimiento.
-- ---------------------------------------------------------------------------
create function privado.confirmar_ocurrencia(
  p_recurrente_id uuid,
  p_vencimiento date,
  p_movimiento_id uuid,
  p_monto text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  r public.recurrentes;
begin
  if v_usuario is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select * into r
    from public.recurrentes x
   where x.id = p_recurrente_id and x.usuario_id = v_usuario;
  if not found then
    raise exception 'RECURRENTE_NO_ENCONTRADO';
  end if;

  -- Valida la cuenta archivada (CUENTA_ARCHIVADA:<campo>).
  perform privado.registrar_movimiento(
    p_movimiento_id, r.tipo, p_monto, p_vencimiento, r.concepto, null,
    r.cuenta_origen_id, r.cuenta_destino_id, r.categoria_id, null);

  insert into public.recurrentes_cierres (
    usuario_id, recurrente_id, vencimiento, estado, movimiento_id)
  values (
    v_usuario, p_recurrente_id, p_vencimiento, 'confirmada', p_movimiento_id);

  return p_movimiento_id;
end;
$$;

revoke all on function privado.confirmar_ocurrencia(uuid, date, uuid, text)
  from public, anon;
grant execute on function privado.confirmar_ocurrencia(uuid, date, uuid, text)
  to authenticated;

create function public.confirmar_ocurrencia(
  p_recurrente_id uuid,
  p_vencimiento date,
  p_movimiento_id uuid,
  p_monto text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select privado.confirmar_ocurrencia(
    p_recurrente_id, p_vencimiento, p_movimiento_id, p_monto);
$$;

revoke all on function public.confirmar_ocurrencia(uuid, date, uuid, text)
  from public, anon;
grant execute on function public.confirmar_ocurrencia(uuid, date, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Vista recurrentes_detalle: plantilla con nombres de cuenta y categoría.
-- security_invoker: respeta la RLS.
-- ---------------------------------------------------------------------------
create view public.recurrentes_detalle
with (security_invoker = true)
as
select
  r.*,
  co.nombre as cuenta_origen_nombre,
  cd.nombre as cuenta_destino_nombre,
  k.nombre as categoria_nombre
from public.recurrentes r
left join public.cuentas co on co.id = r.cuenta_origen_id
left join public.cuentas cd on cd.id = r.cuenta_destino_id
left join public.categorias k on k.id = r.categoria_id;
