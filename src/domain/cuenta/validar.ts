import type { TipoCuentaEnAlcance } from "./cuenta.js";
import { naturalezaDe } from "./naturaleza.js";

export type CodigoErrorCuenta = "CUPO_REQUERIDO" | "CUPO_NO_PERMITIDO" | "CAMBIO_DE_NATURALEZA";

export type AltaCuenta = {
  tipo: TipoCuentaEnAlcance;
  cupo?: bigint | null;
};

export type EstadoCuenta = {
  tipo: TipoCuentaEnAlcance;
  cupo: bigint | null;
};

export type EdicionCuenta = {
  tipo?: TipoCuentaEnAlcance;
  cupo?: bigint;
};

function validarCupo(
  tipo: TipoCuentaEnAlcance,
  cupo: bigint | null | undefined,
): CodigoErrorCuenta | null {
  const informado = cupo !== undefined && cupo !== null;
  if (tipo === "tarjeta_credito") return informado && cupo > 0n ? null : "CUPO_REQUERIDO";
  return informado ? "CUPO_NO_PERMITIDO" : null;
}

/** Solo la tarjeta tiene cupo, y mayor que cero. `null` = válida. */
export function validarAlta(alta: AltaCuenta): CodigoErrorCuenta | null {
  return validarCupo(alta.tipo, alta.cupo);
}

/**
 * Una cuenta no cambia de naturaleza (activo ↔ pasivo). El cupo solo se admite
 * si la cuenta queda como tarjeta. `null` = válida.
 */
export function validarEdicion(
  actual: EstadoCuenta,
  cambios: EdicionCuenta,
): CodigoErrorCuenta | null {
  const tipoFinal = cambios.tipo ?? actual.tipo;
  if (naturalezaDe(tipoFinal) !== naturalezaDe(actual.tipo)) return "CAMBIO_DE_NATURALEZA";
  if (cambios.cupo !== undefined) return validarCupo(tipoFinal, cambios.cupo);
  return null;
}

/** Solo se archiva una cuenta con saldo cero. */
export function puedeArchivar(saldo: bigint): boolean {
  return saldo === 0n;
}
