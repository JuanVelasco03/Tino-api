import type { Cuenta, CuentaGuardada } from "./cuenta.js";
import { efectoEnSaldo } from "./naturaleza.js";

/** Lo mínimo de un movimiento para calcular saldos. `monto` siempre positivo. */
export type EfectoMovimiento = {
  monto: bigint;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
};

/**
 * RN-01, RN-02: saldo = saldo inicial + efecto de todos los movimientos de la
 * cuenta (también los de fecha futura). Una entrada es un movimiento con la
 * cuenta como destino; una salida, como origen. En un pasivo el saldo es la
 * deuda vigente: una salida la aumenta.
 */
export function calcularSaldo(
  cuenta: Pick<CuentaGuardada, "id" | "tipo" | "saldoInicial">,
  efectos: readonly EfectoMovimiento[],
): bigint {
  let saldo = cuenta.saldoInicial;
  for (const m of efectos) {
    if (m.cuentaDestinoId === cuenta.id) saldo += efectoEnSaldo(cuenta.tipo, "entrada", m.monto);
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
  return cuentas.map((c) => ({ ...c, saldo: calcularSaldo(c, porCuenta.get(c.id) ?? []) }));
}
