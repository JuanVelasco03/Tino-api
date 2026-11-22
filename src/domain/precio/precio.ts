/**
 * Precios automáticos de inversiones (SPEC 11). Tipos del dominio y
 * constantes del proveedor. El dominio no sabe quién es el proveedor: recibe
 * sus resultados ya parseados y las cadenas que los clasifican.
 */
import type { ClaseActivo } from "../inversion/inversion.js";

/** Un resultado de la búsqueda de símbolos del proveedor. */
export type ResultadoBusqueda = {
  symbol: string;
  instrumentName: string;
  instrumentType: string;
  currency: string;
  exchange: string;
};

export type Cobertura =
  | { cubierto: true; clase: ClaseActivo; simboloFuente: string; nombre: string }
  | { cubierto: false };

/** Precio que trajo el proveedor, en unidades menores de la moneda de la cuenta. */
export type PrecioObtenido = {
  activoId: string;
  precio: bigint;
  fecha: string;
  origen: "cierre" | "intradia";
  cotizadoEn: Date;
};

/** Un cierre de una serie histórica del proveedor. */
export type CierreHistorico = { fecha: string; precio: bigint; cotizadoEn: Date };

// Constantes del proveedor, fijadas con respuestas reales grabadas
// (src/repositories/twelve-data/respuestas.test-utils.ts). La documentación
// no las lista.

/** `instrument_type` de una acción. */
export const TIPOS_ACCION: readonly string[] = ["Common Stock"];

/** `instrument_type` de un ETF. */
export const TIPOS_ETF: readonly string[] = ["ETF"];

/** `instrument_type` de una criptomoneda. Sus resultados traen `currency` vacía. */
export const TIPOS_CRIPTO: readonly string[] = ["Digital Currency"];

/**
 * Bolsas de EE. UU. que cubre el plan gratis, por su `exchange`. "IEX" repite
 * los mismos símbolos después de su bolsa principal; "CBOE" se excluye porque
 * también nombra a CBOE Europe (mic BCXE).
 */
export const BOLSAS_EEUU: readonly string[] = ["NASDAQ", "NYSE"];

/** Moneda de las cotizaciones del plan gratis: bolsa de EE. UU. y cripto contra el dólar. */
export const MONEDA_PROVEEDOR = "USD";

/** Activos por lote: el límite por minuto del plan gratis. */
export const LOTE_MAXIMO = 8;

/** Minutos desde la última consulta para volver a consultar, por clase. */
export const VENCIMIENTO_MINUTOS: Readonly<Record<ClaseActivo, number>> = {
  accion: 60,
  etf: 60,
  cripto: 15,
};

/** Días hacia atrás en que un precio sirve para una fecha: cubre fines de semana y festivos. */
export const VENTANA_DIAS = 7;
