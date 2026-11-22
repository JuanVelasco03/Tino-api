/**
 * Cobertura de un símbolo por el proveedor (SPEC 11). Un activo es
 * automático solo si el proveedor lo encuentra en la moneda de la cuenta.
 */
import type { ClaseActivo, Cotizacion } from "../inversion/inversion.js";
import {
  BOLSAS_EEUU,
  MONEDA_PROVEEDOR,
  TIPOS_ACCION,
  TIPOS_CRIPTO,
  TIPOS_ETF,
  type Cobertura,
  type ResultadoBusqueda,
} from "./precio.js";

function claseBursatil(instrumentType: string): ClaseActivo | null {
  if (TIPOS_ACCION.includes(instrumentType)) return "accion";
  if (TIPOS_ETF.includes(instrumentType)) return "etf";
  return null;
}

/**
 * `simbolo` ya normalizado (SPEC 10).
 * 1. El primero con `symbol === "S/USD"` y tipo cripto → cripto, `"S/USD"`.
 * 2. Si no, el primero con `symbol === S`, `currency === moneda`, tipo acción
 *    o ETF y bolsa de EE. UU. → acción o ETF, `S`.
 * 3. Si no, no cubierto.
 * La cripto va primero: en las respuestas grabadas, "BTC" y "ETH" son
 * también ETF de Grayscale en NYSE, y quien escribe BTC quiere bitcoin. El
 * usuario ve el nombre en la búsqueda y puede pasar a manual un activo mal
 * resuelto.
 * Una cuenta que no está en USD nunca queda cubierta: la fuente cotiza en
 * dólares (bolsa de EE. UU. y `S/USD`).
 */
export function elegirCobertura(
  simbolo: string,
  moneda: string,
  resultados: readonly ResultadoBusqueda[],
): Cobertura {
  if (moneda !== MONEDA_PROVEEDOR) return { cubierto: false };

  const par = `${simbolo}/${MONEDA_PROVEEDOR}`;
  const cripto = resultados.find(
    (r) => r.symbol === par && TIPOS_CRIPTO.includes(r.instrumentType),
  );
  if (cripto) {
    return { cubierto: true, clase: "cripto", simboloFuente: par, nombre: cripto.instrumentName };
  }

  for (const r of resultados) {
    const clase = claseBursatil(r.instrumentType);
    if (
      clase !== null &&
      r.symbol === simbolo &&
      r.currency === moneda &&
      BOLSAS_EEUU.includes(r.exchange)
    ) {
      return { cubierto: true, clase, simboloFuente: simbolo, nombre: r.instrumentName };
    }
  }
  return { cubierto: false };
}

/** Modo con que nace o queda un activo según su cobertura. */
export type ModoCotizacion =
  | { cotizacion: Extract<Cotizacion, "automatica">; clase: ClaseActivo; simboloFuente: string }
  | { cotizacion: Extract<Cotizacion, "manual">; clase: null; simboloFuente: null };

/** Cubierto → automático con su clase y su símbolo en el proveedor; si no, manual. */
export function modoDeCobertura(cobertura: Cobertura): ModoCotizacion {
  return cobertura.cubierto
    ? { cotizacion: "automatica", clase: cobertura.clase, simboloFuente: cobertura.simboloFuente }
    : { cotizacion: "manual", clase: null, simboloFuente: null };
}
