-- SPEC 10, paso 2: aviso de get_advisors (performance, unindexed_foreign_keys)
-- sobre inversion_precios_activo_fkey (usuario_id, activo_id).
-- inversion_precios_activo_idx empieza por activo_id y no la cubre.
-- Los avisos unused_index de las tablas nuevas son esperables: aún no tienen
-- uso.

create index inversion_precios_usuario_activo_idx
  on public.inversion_precios (usuario_id, activo_id);
