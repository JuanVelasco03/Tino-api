/**
 * «¿Puedo comprar esto?» (SPEC 14): una compra simulada contra el disponible
 * de hoy (RN-18). La compra entra al próximo corte.
 */
import { cupoDisponible, porcentajeUsado } from "../cuenta/cupo.js";

export type CompraSimulada = {
  monto: bigint;
  cabe: boolean;
  /** Si cabe: lo que queda disponible. */
  disponibleTras: bigint | null;
  /** Si cabe: porcentaje usado tras la compra, truncado y acotado a 100. */
  porcentajeTras: number | null;
  /** Si no cabe: lo que falta. */
  falta: bigint | null;
};

export function simularCompra(compra: bigint, cupo: bigint, deuda: bigint): CompraSimulada {
  const disponible = cupoDisponible(cupo, deuda);
  if (compra <= disponible) {
    return {
      monto: compra,
      cabe: true,
      disponibleTras: disponible - compra,
      porcentajeTras: porcentajeUsado(cupo, deuda + compra),
      falta: null,
    };
  }
  return {
    monto: compra,
    cabe: false,
    disponibleTras: null,
    porcentajeTras: null,
    falta: compra - disponible,
  };
}
