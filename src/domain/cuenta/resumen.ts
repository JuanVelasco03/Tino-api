import type { Cuenta, GrupoCuentas, ResumenCuentas, SaldoPrestamo } from "./cuenta.js";
import { naturalezaDe } from "./naturaleza.js";

function grupo(cuentas: Cuenta[]): GrupoCuentas {
  const ordenadas = cuentas.toSorted((x, y) => x.posicion - y.posicion);
  const total = ordenadas.reduce((suma, c) => suma + c.saldo, 0n);
  return { total, cuentas: ordenadas };
}

/**
 * Agrupa en activos y pasivos (RN-02), en el orden del usuario, con el total
 * de cada grupo y el patrimonio neto. En un pasivo el saldo es la deuda
 * vigente (positiva), así que el patrimonio resta el total de pasivos.
 *
 * Los préstamos (SPEC 08) no entran en los grupos, pero sí en el patrimonio:
 * lo que te deben suma y lo que debes resta.
 */
export function agruparCuentas(
  cuentas: Cuenta[],
  prestamos: readonly SaldoPrestamo[] = [],
): ResumenCuentas {
  const activos = grupo(cuentas.filter((c) => naturalezaDe(c.tipo) === "activo"));
  const pasivos = grupo(cuentas.filter((c) => naturalezaDe(c.tipo) === "pasivo"));
  const totales = { teDeben: 0n, debes: 0n };
  for (const p of prestamos) {
    if (p.tipo === "prestamo_otorgado") totales.teDeben += p.saldo;
    else totales.debes += p.saldo;
  }
  return {
    activos,
    pasivos,
    prestamos: totales,
    patrimonioNeto: activos.total - pasivos.total + totales.teDeben - totales.debes,
  };
}
