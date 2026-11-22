/**
 * Posiciones y efectivo de una inversión (SPEC 10). Se derivan de las
 * operaciones en cada consulta: nunca se guardan (RN-01).
 *
 * Costo promedio ponderado: vender descuenta del costo la parte proporcional a
 * la cantidad vendida, así que el costo promedio no cambia. La diferencia
 * entre lo cobrado y ese costo es la ganancia realizada.
 */
import {
  UNIDAD,
  dividirRedondeando,
  type Activo,
  type Operacion,
  type Posicion,
} from "./inversion.js";

/** Orden cronológico: `fecha`, luego `creadoEn`, luego `id` para que sea estable. */
export function porFecha(x: Operacion, y: Operacion): number {
  if (x.fecha !== y.fecha) return x.fecha < y.fecha ? -1 : 1;
  const tiempo = x.creadoEn.getTime() - y.creadoEn.getTime();
  if (tiempo !== 0) return tiempo;
  if (x.id === y.id) return 0;
  return x.id < y.id ? -1 : 1;
}

type Acumulado = { cantidad: bigint; costo: bigint };

/** Costo de la cantidad vendida, proporcional al costo total. Cero si no hay cantidad. */
function costoVendido(acumulado: Acumulado, cantidad: bigint): bigint {
  if (acumulado.cantidad <= 0n) return 0n;
  return dividirRedondeando(acumulado.costo * cantidad, acumulado.cantidad);
}

/** Aplica una operación a la posición acumulada. Devuelve la ganancia realizada de una venta. */
function aplicar(acumulado: Acumulado, op: Operacion): bigint | null {
  if (op.clase !== "venta") {
    acumulado.cantidad += op.cantidad;
    acumulado.costo += op.monto;
    return null;
  }
  const costo = costoVendido(acumulado, op.cantidad);
  acumulado.cantidad -= op.cantidad;
  acumulado.costo -= costo;
  return op.monto - costo;
}

/** `costo × 10⁸ ÷ cantidad`: precio por unidad. Nulo con cantidad 0 o negativa. */
export function costoPromedio(cantidad: bigint, costo: bigint): bigint | null {
  return cantidad > 0n ? dividirRedondeando(costo * UNIDAD, cantidad) : null;
}

/**
 * Posición de un activo a la fecha `fecha` (inclusive; sin fecha, todas las
 * operaciones). `operaciones` puede traer las de otros activos: se filtran.
 * `primeraFecha`: la de su primera operación, para el orden (N-34).
 */
export function posicionEn(
  activo: Activo,
  operaciones: readonly Operacion[],
  fecha?: string,
): Posicion {
  const propias = operaciones
    .filter((op) => op.activoId === activo.id && (fecha === undefined || op.fecha <= fecha))
    .toSorted(porFecha);
  const acumulado: Acumulado = { cantidad: 0n, costo: 0n };
  for (const op of propias) aplicar(acumulado, op);
  return {
    activo,
    cantidad: acumulado.cantidad,
    costo: acumulado.costo,
    costoPromedio: costoPromedio(acumulado.cantidad, acumulado.costo),
    primeraFecha: propias[0]?.fecha ?? activo.creadoEn.toISOString().slice(0, 10),
  };
}

/** Una posición está abierta si le queda cantidad. */
export function estaAbierta(posicion: Posicion): boolean {
  return posicion.cantidad > 0n;
}

/** Orden de las posiciones (N-34): primera operación, luego `creadoEn` del activo, luego símbolo. */
export function porPrimeraOperacion(x: Posicion, y: Posicion): number {
  if (x.primeraFecha !== y.primeraFecha) return x.primeraFecha < y.primeraFecha ? -1 : 1;
  const tiempo = x.activo.creadoEn.getTime() - y.activo.creadoEn.getTime();
  if (tiempo !== 0) return tiempo;
  if (x.activo.simbolo === y.activo.simbolo) return 0;
  return x.activo.simbolo < y.activo.simbolo ? -1 : 1;
}

/** Posiciones abiertas a `fecha`, en el orden de N-34. */
export function posicionesAbiertas(
  activos: readonly Activo[],
  operaciones: readonly Operacion[],
  fecha?: string,
): Posicion[] {
  return activos
    .map((activo) => posicionEn(activo, operaciones, fecha))
    .filter(estaAbierta)
    .toSorted(porPrimeraOperacion);
}

/**
 * Ganancia realizada de cada venta (id de la operación → monto, puede ser
 * negativa), recorriendo todas las operaciones de cada activo en orden.
 */
export function gananciasRealizadas(operaciones: readonly Operacion[]): Map<string, bigint> {
  const porActivo = new Map<string, Acumulado>();
  const ganancias = new Map<string, bigint>();
  for (const op of operaciones.toSorted(porFecha)) {
    let acumulado = porActivo.get(op.activoId);
    if (!acumulado) {
      acumulado = { cantidad: 0n, costo: 0n };
      porActivo.set(op.activoId, acumulado);
    }
    const ganancia = aplicar(acumulado, op);
    if (ganancia !== null) ganancias.set(op.id, ganancia);
  }
  return ganancias;
}

/**
 * Efectivo a `fecha` (sin fecha, todo): el saldo de la cuenta con sus
 * movimientos (RN-01; el llamador filtra los de fecha ≤ F), menos las compras
 * y más las ventas con fecha ≤ F. Las operaciones `inicial` no lo tocan.
 */
export function efectivo(
  saldoCuenta: bigint,
  operaciones: readonly Operacion[],
  fecha?: string,
): bigint {
  let total = saldoCuenta;
  for (const op of operaciones) {
    if (fecha !== undefined && op.fecha > fecha) continue;
    if (op.clase === "compra") total -= op.monto;
    if (op.clase === "venta") total += op.monto;
  }
  return total;
}

/** `monto ÷ cantidad` por unidad, redondeado. Cero sin cantidad. */
export function precioUnitario(monto: bigint, cantidad: bigint): bigint {
  return cantidad > 0n ? dividirRedondeando(monto * UNIDAD, cantidad) : 0n;
}
