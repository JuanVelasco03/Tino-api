-- SPEC 13, paso 1: aviso de get_advisors (performance, unindexed_foreign_keys)
-- sobre metas_movimientos_movimiento_fkey (usuario_id, movimiento_id).
-- El unique de movimiento_id no la cubre. Con RLS, toda lectura de
-- metas_movimientos ya filtra por usuario_id.
-- Los avisos unused_index de las tablas nuevas son esperables: aún no tienen
-- uso.

create index metas_movimientos_movimiento_idx
  on public.metas_movimientos (usuario_id, movimiento_id);
