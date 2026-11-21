-- SPEC 07, paso 2: aviso de get_advisors (performance, unindexed_foreign_keys)
-- sobre recurrentes_cierres_recurrente_fkey (usuario_id, recurrente_id).
-- recurrentes_cierres_unico empieza por recurrente_id y no la cubre. Con RLS,
-- toda lectura de cierres ya filtra por usuario_id.
-- Los avisos unused_index de las tablas nuevas son esperables: aún no tienen
-- uso.

create index recurrentes_cierres_recurrente_idx
  on public.recurrentes_cierres (usuario_id, recurrente_id);
