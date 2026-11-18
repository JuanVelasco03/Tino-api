import type { TipoCuenta } from "../cuenta/naturaleza.js";
import type { MovimientoEntrada } from "../movimiento/validar.js";

export type CuentaParaSaldo = {
  id: string;
  tipo: TipoCuenta;
  /** Unidades menores. En un pasivo es la deuda inicial. */
  saldoInicial: bigint;
};

export type MovimientoParaSaldo = MovimientoEntrada;

/**
 * RN-01: saldo = saldo inicial + efecto de los movimientos de la cuenta.
 * Nunca se almacena. Ignora los movimientos que no tocan la cuenta.
 * En un pasivo el resultado es la deuda vigente (RN-02).
 */
export function calcularSaldo(
  _cuenta: CuentaParaSaldo,
  _movimientos: MovimientoParaSaldo[],
): bigint {
  throw new Error("No implementado: calcularSaldo");
}
