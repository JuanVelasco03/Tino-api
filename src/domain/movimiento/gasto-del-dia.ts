import type { TipoMovimiento } from "./movimiento.js";

/** Suma de los gastos. Ingresos y transferencias no cuentan (RN-05). */
export function sumarGastos(
  movimientos: readonly { tipo: TipoMovimiento; monto: bigint }[],
): bigint {
  return movimientos.reduce((total, m) => (m.tipo === "gasto" ? total + m.monto : total), 0n);
}
