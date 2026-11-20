import type { TipoCategoria } from "./proponer.js";

/** Categoría sembrada (SPEC 04). Solo gasto e ingreso: la transferencia no lleva (RN-05). */
export type Categoria = { id: string; nombre: string; tipo: TipoCategoria; posicion: number };
