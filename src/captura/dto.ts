/**
 * Contrato HTTP de la captura rápida: datos para abrir el formulario y
 * sugerencias mientras se escribe.
 */
import type { Categoria } from "../domain/categorizacion/categoria.js";
import type { TipoCategoria } from "../domain/categorizacion/proponer.js";

export type CategoriaDto = { id: string; nombre: string; tipo: TipoCategoria };

export type CapturaDto = {
  fechaHoy: string;
  /** Elegida si está activa; si no, la primera activa del orden; null sin cuentas. */
  cuentaPredeterminadaId: string | null;
  categorias: { gasto: CategoriaDto[]; ingreso: CategoriaDto[] };
  gastosHoy: string;
  /** Hasta 6 por tipo, de los últimos 90 días, el más usado primero. */
  conceptosFrecuentes: { gasto: string[]; ingreso: string[]; transferencia: string[] };
};

export type SugerenciasDto = {
  /** Hasta 2. */
  conceptos: { descripcion: string; categoria: CategoriaDto | null }[];
  propuesta: { categoria: CategoriaDto; regla: { id: string; palabraClave: string } } | null;
};

export function aCategoriaDto(categoria: Categoria): CategoriaDto {
  return { id: categoria.id, nombre: categoria.nombre, tipo: categoria.tipo };
}
