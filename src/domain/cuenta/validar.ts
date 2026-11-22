import { TIPO_INVERSION } from "../inversion/inversion.js";
import type { TipoCuentaEnAlcance, TipoCuentaVisible } from "./cuenta.js";
import { naturalezaDe } from "./naturaleza.js";

export type CodigoErrorCuenta =
  "CUPO_REQUERIDO" | "CUPO_NO_PERMITIDO" | "CAMBIO_DE_NATURALEZA" | "TIPO_DE_INVERSION_FIJO";

export type AltaCuenta = {
  tipo: TipoCuentaEnAlcance;
  cupo?: bigint | null;
};

export type EstadoCuenta = {
  tipo: TipoCuentaVisible;
  cupo: bigint | null;
};

export type EdicionCuenta = {
  tipo?: TipoCuentaEnAlcance;
  cupo?: bigint;
};

function validarCupo(
  tipo: TipoCuentaVisible,
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
 * Una cuenta no cambia de naturaleza (activo ↔ pasivo) y una inversión no
 * cambia de tipo (SPEC 10). El cupo solo se admite si la cuenta queda como
 * tarjeta. `null` = válida.
 */
export function validarEdicion(
  actual: EstadoCuenta,
  cambios: EdicionCuenta,
): CodigoErrorCuenta | null {
  if (actual.tipo === TIPO_INVERSION && cambios.tipo !== undefined) {
    return "TIPO_DE_INVERSION_FIJO";
  }
  const tipoFinal = cambios.tipo ?? actual.tipo;
  if (naturalezaDe(tipoFinal) !== naturalezaDe(actual.tipo)) return "CAMBIO_DE_NATURALEZA";
  if (cambios.cupo !== undefined) return validarCupo(tipoFinal, cambios.cupo);
  return null;
}

/** Solo se archiva una cuenta con saldo cero. */
export function puedeArchivar(saldo: bigint): boolean {
  return saldo === 0n;
}
