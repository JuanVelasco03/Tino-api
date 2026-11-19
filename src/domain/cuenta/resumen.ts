import type { Cuenta, GrupoCuentas, ResumenCuentas } from "./cuenta.js";
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
 */
export function agruparCuentas(cuentas: Cuenta[]): ResumenCuentas {
  const activos = grupo(cuentas.filter((c) => naturalezaDe(c.tipo) === "activo"));
  const pasivos = grupo(cuentas.filter((c) => naturalezaDe(c.tipo) === "pasivo"));
  return { activos, pasivos, patrimonioNeto: activos.total - pasivos.total };
}
