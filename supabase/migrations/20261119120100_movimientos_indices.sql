-- SPEC 04, paso 2: avisos de get_advisors (performance, unindexed_foreign_keys).
-- Las FK compuestas (usuario_id, …) necesitan un índice que cubra sus
-- columnas. Donde ya había un índice de una sola columna, se amplía con el
-- mismo nombre: la columna de búsqueda va primero para que siga sirviendo a
-- la vista cuentas_con_saldo y a las consultas por movimiento.

drop index public.movimientos_origen_idx;
create index movimientos_origen_idx on public.movimientos (cuenta_origen_id, usuario_id);

drop index public.movimientos_destino_idx;
create index movimientos_destino_idx on public.movimientos (cuenta_destino_id, usuario_id);

create index movimientos_categoria_idx on public.movimientos (categoria_id, usuario_id, tipo);

drop index public.movimiento_partes_usuario_idx;
create index movimiento_partes_usuario_idx on public.movimiento_partes (usuario_id, categoria_id);

drop index public.reglas_usuario_idx;
create index reglas_usuario_idx on public.reglas_categoria (usuario_id, categoria_id);

create index perfiles_cuenta_predeterminada_idx
  on public.perfiles (cuenta_predeterminada_id, id);
