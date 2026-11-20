-- SPEC 04: borrar un usuario con movimientos divididos fallaba.
--
-- La cascada desde auth.users borraba categorias en el primer nivel y las
-- partes solo en el segundo (usuario → movimientos → partes). El restrict de
-- movimiento_partes_categoria_fkey se comprobaba antes de que las partes
-- cayeran. Con esta FK, las partes caen en el primer nivel, como el resto de
-- tablas con datos de usuario (REGLAS §4), y el restrict de categoría se
-- mantiene. La cubre movimiento_partes_usuario_idx (usuario_id, categoria_id).

alter table public.movimiento_partes
  add constraint movimiento_partes_usuario_id_fkey
  foreign key (usuario_id) references auth.users (id) on delete cascade;
