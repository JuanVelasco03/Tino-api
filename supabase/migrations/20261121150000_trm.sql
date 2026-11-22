-- SPEC 09: TRM oficial, automática e histórica.
-- Caché por usuario de la TRM publicada por la Superintendencia Financiera.
-- La API la trae de la fuente bajo demanda y la guarda con el token del
-- usuario, bajo RLS: sin service_role ni tabla global (REGLAS §4). Un usuario
-- que altere su caché solo se afecta a sí mismo (RN-12).
--
-- Una fila por vigencia, tal como la publica la fuente: la del sábado vale
-- hasta el lunes. valor_cent no se cifra: es un dato público, no un monto del
-- usuario. Sin UPDATE ni DELETE: una TRM publicada no cambia.

create table public.trm (
  usuario_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  vigente_desde date not null,
  vigente_hasta date not null,
  -- Centavos de peso por US$ 1: 3.461,92 = 346192.
  valor_cent integer not null check (valor_cent > 0),
  obtenida_en timestamptz not null default now(),
  -- Su índice empieza por usuario_id: sirve de índice de usuario (REGLAS §4).
  constraint trm_pkey primary key (usuario_id, vigente_desde),
  constraint trm_vigencia_check check (vigente_hasta >= vigente_desde)
);

alter table public.trm enable row level security;

create policy trm_select_propia on public.trm
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy trm_insert_propia on public.trm
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);
