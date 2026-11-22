-- SPEC 12: avisos.
-- Los avisos no se guardan: los deriva src/domain/aviso/ al leer, desde las
-- fuentes vivas (plantillas y cierres, préstamos y sus movimientos, activos
-- manuales y sus precios). Solo se guarda lo que decide el usuario: la
-- antelación por tipo (avisos_config) y la marca de leído de cada aviso por
-- su clave derivada (avisos_leidos). Ninguna tabla guarda montos.
-- RLS desde la primera migración (REGLAS §4).
--
-- Tipos de aviso: ('recurrente', 'cobro', 'deuda', 'precio_manual'). La lista
-- se repite en cada sitio; su espejo en el dominio es TIPOS_AVISO
-- (src/domain/aviso/aviso.ts).

-- ---------------------------------------------------------------------------
-- 1. avisos_config: antelación por tipo.
--    Sin fila, el tipo vale CONFIG_POR_DEFECTO del dominio. No hay semilla:
--    la fila nace con el primer PATCH (upsert).
--    dias significa, según el tipo: días de antelación (recurrente, deuda),
--    cada cuántos días se repite el cobro (0 = nunca) o días sin precio nuevo
--    (precio_manual). avisos_config_dias_check es el espejo de OPCIONES_DIAS.
--    La PK empieza por usuario_id y sirve de índice de usuario.
-- ---------------------------------------------------------------------------
create table public.avisos_config (
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  tipo text not null
    check (tipo in ('recurrente', 'cobro', 'deuda', 'precio_manual')),
  activo boolean not null,
  dias integer not null,
  actualizado_en timestamptz not null default now(),
  constraint avisos_config_pkey primary key (usuario_id, tipo),
  constraint avisos_config_dias_check check (
    (tipo = 'recurrente' and dias in (1, 3, 5, 7))
    or (tipo = 'cobro' and dias in (0, 14, 30))
    or (tipo = 'deuda' and dias in (1, 3, 7))
    or (tipo = 'precio_manual' and dias in (3, 7, 14)))
);

alter table public.avisos_config enable row level security;

create policy avisos_config_select_propia on public.avisos_config
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy avisos_config_insert_propia on public.avisos_config
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy avisos_config_update_propia on public.avisos_config
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- Sin DELETE: la configuración se cambia, no se borra.

-- marcar_actualizado: definida en SPEC 02.
create trigger avisos_config_marcar_actualizado
  before update on public.avisos_config
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- 2. avisos_leidos: marca de leído o no leído por clave derivada
--    (<tipo>:<id de la fuente>:<YYYY-MM-DD>). La clave no apunta a ninguna
--    fila: si la fuente desaparece, la marca queda huérfana e inofensiva.
--    Sin DELETE: volver a «no leído» es leido = false, no borrar la fila
--    (sin marca vale la resolución de la fuente; un «no leído» explícito gana).
--    La escritura es un upsert (on conflict (usuario_id, clave)).
--    La PK empieza por usuario_id y sirve de índice de usuario.
-- ---------------------------------------------------------------------------
create table public.avisos_leidos (
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  clave text not null,
  leido boolean not null,
  marcado_en timestamptz not null default now(),
  constraint avisos_leidos_pkey primary key (usuario_id, clave),
  constraint avisos_leidos_clave_check check (
    clave ~ '^(recurrente|cobro|deuda|precio_manual):[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$')
);

alter table public.avisos_leidos enable row level security;

create policy avisos_leidos_select_propia on public.avisos_leidos
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy avisos_leidos_insert_propia on public.avisos_leidos
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy avisos_leidos_update_propia on public.avisos_leidos
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);
