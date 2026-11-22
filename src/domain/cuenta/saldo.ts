import type { Cuenta, CuentaGuardada } from "./cuenta.js";
import { efectoEnSaldo, type TipoCuenta } from "./naturaleza.js";

/**
 * Lo mínimo de un movimiento para calcular saldos. `monto` siempre positivo,
 * en la moneda de la cuenta de origen (o del destino en un ingreso).
 * `montoDestino`: lo que llegó al destino en una transferencia entre monedas
 * distintas (SPEC 10), en la moneda del destino; `null` en los demás casos.
 */
export type EfectoMovimiento = {
  monto: bigint;
  montoDestino: bigint | null;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
};

/**
 * RN-01, RN-02: saldo = saldo inicial + efecto de todos los movimientos de la
 * cuenta (también los de fecha futura). Una entrada es un movimiento con la
 * cuenta como destino; una salida, como origen. En un pasivo el saldo es la
 * deuda vigente: una salida la aumenta.
 *
 * El origen recibe `monto` y el destino `montoDestino ?? monto` (SPEC 10).
 */
export function calcularSaldo(
  cuenta: Pick<CuentaGuardada, "id" | "saldoInicial"> & { tipo: TipoCuenta },
  efectos: readonly EfectoMovimiento[],
): bigint {
  let saldo = cuenta.saldoInicial;
  for (const m of efectos) {
    if (m.cuentaDestinoId === cuenta.id) {
      saldo += efectoEnSaldo(cuenta.tipo, "entrada", m.montoDestino ?? m.monto);
    }
    if (m.cuentaOrigenId === cuenta.id) saldo += efectoEnSaldo(cuenta.tipo, "salida", m.monto);
  }
  return saldo;
}

/** Saldo de cada cuenta en una sola pasada por los movimientos. */
export function conSaldos(
  cuentas: readonly CuentaGuardada[],
  efectos: readonly EfectoMovimiento[],
): Cuenta[] {
  const porCuenta = new Map<string, EfectoMovimiento[]>(cuentas.map((c) => [c.id, []]));
  for (const m of efectos) {
    for (const id of new Set([m.cuentaOrigenId, m.cuentaDestinoId])) {
      if (id !== null) porCuenta.get(id)?.push(m);
    }
  }
  return cuentas.map((c) => ({
    ...c,
    saldo: calcularSaldo(c, porCuenta.get(c.id) ?? []),
    inversion: null,
  }));
}
