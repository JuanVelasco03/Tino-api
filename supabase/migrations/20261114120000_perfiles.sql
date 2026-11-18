-- SPEC 02: perfil de usuario.
-- Una fila por usuario de auth.users, creada por trigger al registrarse.

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  moneda_base text not null default 'COP'
    check (moneda_base in ('COP', 'USD')),
  zona_horaria text not null default 'America/Bogota',
  primer_uso_completado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- Solo SELECT y UPDATE propios. Sin INSERT (lo hace el trigger) ni DELETE
-- (cascada desde auth.users).
create policy perfiles_select_propio on public.perfiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy perfiles_update_propio on public.perfiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Crea el perfil con los valores por defecto al insertar un usuario.
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.crear_perfil() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Mantiene actualizado_en.
create function public.marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger perfiles_marcar_actualizado
  before update on public.perfiles
  for each row execute function public.marcar_actualizado();
