/**
 * Valoración a mercado de una inversión (SPEC 10): precio vigente, valor,
 * rendimiento y su porcentaje, y conversión a COP con la TRM.
 */
import {
  UNIDAD,
  dividirRedondeando,
  type Activo,
  type Cotizacion,
  type Moneda,
  type Operacion,
  type Posicion,
  type Precio,
  type Valoracion,
} from "./inversion.js";
import { efectivo, posicionesAbiertas } from "./posiciones.js";

/** Orden de los precios del más reciente al más antiguo: `fecha` desc, luego `cotizadoEn` desc. */
function masReciente(x: Precio, y: Precio): number {
  if (x.fecha !== y.fecha) return x.fecha > y.fecha ? -1 : 1;
  return y.cotizadoEn.getTime() - x.cotizadoEn.getTime();
}

export type PrecioVigente = { vigente: Precio; anterior: Precio | null };

/**
 * Precio vigente en `fecha`: el de mayor `fecha ≤ F` y, en empate, el de mayor
 * `cotizadoEn`. Si ninguno es ≤ F, el más antiguo. `anterior`: el que le sigue
 * en ese orden, o nulo. Sin fecha, el más reciente. `precios` puede traer los
 * de otros activos: se filtran por `activoId`. Sin precios, `null`.
 *
 * En un activo automático (SPEC 11), si hay precios del proveedor (`cierre`,
 * `intradia`) con fecha ≤ F, la regla se aplica solo entre ellos: el costo
 * unitario con que nació el activo, o un precio de cuando era manual, no le
 * gana al último cierre del proveedor por tener fecha posterior.
 */
export function precioVigente(
  activoId: string,
  precios: readonly Precio[],
  fecha?: string,
  cotizacion: Cotizacion = "manual",
): PrecioVigente | null {
  const propios = precios.filter((p) => p.activoId === activoId).toSorted(masReciente);
  if (propios.length === 0) return null;
  const delProveedor = propios.filter((p) => p.origen !== "manual");
  const candidatos =
    cotizacion === "automatica" && delProveedor.some((p) => fecha === undefined || p.fecha <= fecha)
      ? delProveedor
      : propios;
  let indice = fecha === undefined ? 0 : candidatos.findIndex((p) => p.fecha <= fecha);
  if (indice === -1) indice = candidatos.length - 1;
  return { vigente: candidatos[indice]!, anterior: candidatos[indice + 1] ?? null };
}

/** `cantidad × precio ÷ 10⁸`, redondeado. */
export function valorDe(cantidad: bigint, precio: bigint): bigint {
  return dividirRedondeando(cantidad * precio, UNIDAD);
}

/** `rendimiento × 10000 ÷ costo` en centésimas de punto; nulo si el costo es 0. */
export function porcentajeRendimiento(rendimiento: bigint, costo: bigint): bigint | null {
  return costo === 0n ? null : dividirRedondeando(rendimiento * 10_000n, costo);
}

/** Valor a `precio`, rendimiento no realizado y su porcentaje. */
export function valorar(cantidad: bigint, costo: bigint, precio: bigint): Valoracion {
  const valor = valorDe(cantidad, precio);
  const rendimiento = valor - costo;
  return { valor, rendimiento, rendimientoPorcentaje: porcentajeRendimiento(rendimiento, costo) };
}

/**
 * Monto a pesos: en COP, el mismo; en USD, `centavos × trmCent ÷ 10⁴`
 * redondeado half-up; sin TRM, `null`.
 */
export function aCop(monto: bigint, moneda: Moneda, trmCent: bigint | null): bigint | null {
  if (moneda === "COP") return monto;
  if (trmCent === null) return null;
  return dividirRedondeando(monto * trmCent, 10_000n);
}

export type PosicionValorada = Posicion &
  Valoracion & { precio: Precio | null; precioAnterior: Precio | null };

export type InversionValorada = {
  efectivo: bigint;
  posiciones: PosicionValorada[];
  /** efectivo + Σ valor de las posiciones abiertas. */
  valorMercado: bigint;
  /** Totales de las posiciones abiertas, sin el efectivo. */
  costo: bigint;
  rendimiento: bigint;
  rendimientoPorcentaje: bigint | null;
};

export type DatosInversion = {
  /** Saldo de la cuenta con sus movimientos (RN-01), ya filtrados a fecha ≤ F si hay fecha. */
  saldoCuenta: bigint;
  activos: readonly Activo[];
  operaciones: readonly Operacion[];
  precios: readonly Precio[];
};

/**
 * Valoración de una inversión en `fecha` (inclusive): efectivo, posiciones
 * abiertas a su precio vigente y totales. Una posición sin precio vale 0. Sin
 * fecha, todas las operaciones y el último precio: el saldo de Cuentas (RN-01).
 */
export function valorarInversion(datos: DatosInversion, fecha?: string): InversionValorada {
  const caja = efectivo(datos.saldoCuenta, datos.operaciones, fecha);
  const posiciones = posicionesAbiertas(datos.activos, datos.operaciones, fecha).map((p) => {
    const precio = precioVigente(p.activo.id, datos.precios, fecha, p.activo.cotizacion);
    return {
      ...p,
      ...valorar(p.cantidad, p.costo, precio?.vigente.precio ?? 0n),
      precio: precio?.vigente ?? null,
      precioAnterior: precio?.anterior ?? null,
    };
  });
  const valor = posiciones.reduce((suma, p) => suma + p.valor, 0n);
  const costo = posiciones.reduce((suma, p) => suma + p.costo, 0n);
  const rendimiento = valor - costo;
  return {
    efectivo: caja,
    posiciones,
    valorMercado: caja + valor,
    costo,
    rendimiento,
    rendimientoPorcentaje: porcentajeRendimiento(rendimiento, costo),
  };
}
