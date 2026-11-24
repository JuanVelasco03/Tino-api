/**
 * Tarjeta de crédito con ciclo (SPEC 14). Se guardan solo las condiciones; el
 * ciclo (corte, pago límite, saldo al corte, grupos) se calcula (RN-01).
 * Montos en pesos, `bigint`: sin coma flotante.
 */

/** Condiciones de una tarjeta. Una tarjeta creada antes de SPEC 14 no tiene. */
export type CondicionesTarjeta = {
  diaCorte: number;
  diaPago: number;
  /** Centésimas de punto: 198 = 1,98 % M.V. */
  tasaMensualCpb: number | null;
  cuotaManejo: bigint | null;
  cuentaPagoId: string | null;
};

/** Categorías de gasto que son cargos del banco, no consumos (RN-09). */
export const CATEGORIAS_CARGO = {
  Intereses: "intereses",
  "Cuota de manejo": "cuota_manejo",
} as const;

export type ClaseCargo = (typeof CATEGORIAS_CARGO)[keyof typeof CATEGORIAS_CARGO];

/** Días del historial sin `desde` (SPEC 14). */
export const DIAS_HISTORIAL_POR_DEFECTO = 30;

/** Ids de las categorías de cargo del usuario, con su clase. */
export function clasesDeCargo(
  categorias: readonly { id: string; nombre: string; tipo: string }[],
): Map<string, ClaseCargo> {
  const clases = new Map<string, ClaseCargo>();
  for (const c of categorias) {
    if (c.tipo !== "gasto") continue;
    const clase = (CATEGORIAS_CARGO as Record<string, ClaseCargo | undefined>)[c.nombre];
    if (clase !== undefined) clases.set(c.id, clase);
  }
  return clases;
}
