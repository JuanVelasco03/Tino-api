/**
 * Conciliación de una cuenta (SPEC 14). El estado es por lado del movimiento:
 * conciliar en Efectivo no concilia en Bancolombia. Nada se guarda aparte
 * (RN-01): el saldo conciliado sale de los movimientos y su estado.
 */
import {
  compararCronologico,
  conciliadoEnCuenta,
  efectoEnCuenta,
  type CuentaHistorial,
  type MovimientoConciliable,
} from "./historial.js";

export type EstadoConciliacion = {
  /** Saldo tras el último movimiento conciliado con todo lo anterior conciliado; `null` si no hay. */
  saldo: bigint | null;
  /** Fecha de ese movimiento; `null` si no hay. */
  al: string | null;
  /** Movimientos de la cuenta, de cualquier fecha, pendientes en ella. */
  pendientes: number;
};

export function estadoConciliacion(
  cuenta: CuentaHistorial,
  movimientos: readonly MovimientoConciliable[],
): EstadoConciliacion {
  const ordenados = [...movimientos].sort(compararCronologico);
  let corrido = cuenta.saldoInicial;
  let saldo: bigint | null = null;
  let al: string | null = null;
  let continuo = true;
  let pendientes = 0;

  for (const m of ordenados) {
    corrido += efectoEnCuenta(cuenta.id, m);
    if (conciliadoEnCuenta(cuenta.id, m)) {
      if (continuo) {
        saldo = corrido;
        al = m.fecha;
      }
    } else {
      continuo = false;
      pendientes++;
    }
  }
  return { saldo, al, pendientes };
}
