-- SPEC 04, paso 2 (corrección de 20261119120100): unindexed_foreign_keys solo
-- da por cubierta una FK si el índice empieza por sus columnas en el mismo
-- orden. Las FK compuestas empiezan por usuario_id. Con RLS, toda consulta a
-- movimientos ya filtra por usuario_id, así que estos índices siguen sirviendo
-- a la vista cuentas_con_saldo (usuario_id = auth.uid() and cuenta_x_id = c.id).

drop index public.movimientos_origen_idx;
create index movimientos_origen_idx on public.movimientos (usuario_id, cuenta_origen_id);

drop index public.movimientos_destino_idx;
create index movimientos_destino_idx on public.movimientos (usuario_id, cuenta_destino_id);

drop index public.movimientos_categoria_idx;
create index movimientos_categoria_idx on public.movimientos (usuario_id, categoria_id, tipo);

drop index public.perfiles_cuenta_predeterminada_idx;
create index perfiles_cuenta_predeterminada_idx
  on public.perfiles (id, cuenta_predeterminada_id);
