-- SPEC 08, paso 2: aviso de get_advisors (performance, unindexed_foreign_keys)
-- sobre prestamos_intereses_movimiento_fkey (usuario_id, movimiento_id).
-- La PK empieza por movimiento_id y no la cubre. Con RLS, toda lectura de
-- prestamos_intereses ya filtra por usuario_id.
-- Los avisos unused_index de las tablas nuevas son esperables: aún no tienen
-- uso.

create index prestamos_intereses_movimiento_idx
  on public.prestamos_intereses (usuario_id, movimiento_id);
