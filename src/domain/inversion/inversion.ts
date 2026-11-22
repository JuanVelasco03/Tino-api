/**
 * Cuentas de inversión (SPEC 10). Una inversión es una cuenta de tipo
 * `inversion` (activo) con moneda fija. Las posiciones no se guardan: se
 * derivan de activos, operaciones y precios (RN-01).
 *
 * Unidades, siempre `bigint` y sin coma flotante:
 * - montos (efectivo, operación, valor, costo): unidades menores de la moneda
 *   de la cuenta (COP = pesos, USD = centavos);
 * - cantidad: 10⁻⁸ unidades (`1250000n` = 0,0125);
 * - precio por unidad: unidades menores;
 * - porcentaje de rendimiento: centésimas de punto (`1248n` = 12,48 %).
 */

/** Tipo de cuenta de una inversión. Espejo del `check` de `cuentas.tipo`. */
export const TIPO_INVERSION = "inversion" as const;

/** Monedas de una cuenta. Espejo del `check` de `cuentas.moneda`. */
export const MONEDAS = ["COP", "USD"] as const;

export type Moneda = (typeof MONEDAS)[number];

export const CLASES_OPERACION = ["inicial", "compra", "venta"] as const;

export type ClaseOperacion = (typeof CLASES_OPERACION)[number];

export type OrigenPrecio = "manual";

/** 10⁸: una unidad entera de un activo en la escala de la cantidad. */
export const UNIDAD = 100_000_000n;

export type Activo = {
  id: string;
  cuentaId: string;
  simbolo: string;
  nombre: string;
  creadoEn: Date;
};

export type Operacion = {
  id: string;
  activoId: string;
  clase: ClaseOperacion;
  cantidad: bigint;
  /** Total de la operación, comisión incluida. */
  monto: bigint;
  fecha: string;
  creadoEn: Date;
  actualizadoEn: Date;
};

export type Precio = {
  activoId: string;
  precio: bigint;
  fecha: string;
  origen: OrigenPrecio;
  cotizadoEn: Date;
};

export type Posicion = {
  activo: Activo;
  cantidad: bigint;
  costo: bigint;
  /** Precio por unidad en unidades menores, solo para mostrar; nulo con cantidad 0. */
  costoPromedio: bigint | null;
  primeraFecha: string;
};

export type Valoracion = {
  valor: bigint;
  rendimiento: bigint;
  rendimientoPorcentaje: bigint | null;
};

export function esMoneda(valor: string): valor is Moneda {
  return (MONEDAS as readonly string[]).includes(valor);
}

export function esClaseOperacion(valor: string): valor is ClaseOperacion {
  return (CLASES_OPERACION as readonly string[]).includes(valor);
}

/** round(n / d) con la mitad lejos de cero, solo con enteros. `d` distinto de cero. */
export function dividirRedondeando(n: bigint, d: bigint): bigint {
  const negativo = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const cociente = (2n * a + b) / (2n * b);
  return negativo ? -cociente : cociente;
}
