/**
 * ÚNICO archivo del proyecto que conoce Twelve Data (SPEC 11), como
 * `repositories/supabase/` lo es de Supabase (REGLAS §5).
 *
 * - Búsqueda: `GET /symbol_search?symbol=S&outputsize=30`.
 * - Precio actual: `POST /batch`, una subpetición por activo y a lo sumo 8
 *   por lote: `/eod?symbol=S` (acción o ETF, último cierre) o
 *   `/quote?symbol=S/USD` (cripto, intradía).
 * - Histórico: `POST /batch` con `/time_series?symbol=S&interval=1day&…`.
 *
 * La clave va en la cabecera `Authorization: apikey <clave>`, nunca en la URL
 * ni en el log. `fetch` nativo con timeout de 5 s y sin reintentos. Cualquier
 * falla (sin clave, red, timeout, estado distinto de 200, forma inesperada o
 * `status: "error"` en el lote o en una subpetición) devuelve `null` para lo
 * que falló y deja un aviso sin datos del usuario. Una subpetición fallida no
 * tumba las demás. Inyectable: las e2e la reemplazan por una falsa.
 */
import { Logger } from "@nestjs/common";
import { z } from "zod";
import type { ClaseActivo } from "../../domain/inversion/inversion.js";
import {
  LOTE_MAXIMO,
  type CierreHistorico,
  type PrecioObtenido,
  type ResultadoBusqueda,
} from "../../domain/precio/precio.js";
import { parsearPrecio } from "../../domain/precio/valor.js";

const BASE = "https://api.twelvedata.com";
const TIMEOUT_MS = 5000;
const RESULTADOS_BUSQUEDA = 30;

/** Lo que hay que pedir de un activo automático. */
export type ActivoAConsultar = { activoId: string; clase: ClaseActivo; simboloFuente: string };

/** Rango de cierres a pedir de un activo. */
export type PedidoHistorico = {
  activoId: string;
  simboloFuente: string;
  desde: string;
  hasta: string;
};

/** Precio actual sin el activo: lo asigna quien conoce el lote. */
export type PrecioActual = Omit<PrecioObtenido, "activoId">;

// ---------------------------------------------------------------------------
// Forma de las respuestas (Zod). Campos de más se ignoran.
// ---------------------------------------------------------------------------

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const segundos = z.number().int().positive();

const busqueda = z.object({
  data: z.array(
    z.object({
      symbol: z.string(),
      instrument_name: z.string(),
      instrument_type: z.string(),
      exchange: z.string(),
      // Vacía en cripto.
      currency: z.string(),
    }),
  ),
  status: z.literal("ok"),
});

const eod = z.object({ datetime: fecha, timestamp: segundos, close: z.string() });

const quote = z.object({
  datetime: fecha,
  timestamp: segundos,
  last_quote_at: segundos.optional(),
  close: z.string(),
});

const serie = z.object({
  values: z.array(z.object({ datetime: fecha, close: z.string() })),
  status: z.literal("ok"),
});

const lote = z.object({
  status: z.literal("success"),
  data: z.record(z.string(), z.object({ status: z.string(), response: z.unknown() })),
});

// ---------------------------------------------------------------------------
// Parseo puro, probado con respuestas reales grabadas.
// ---------------------------------------------------------------------------

/** Respuesta de `symbol_search` → resultados, o `null` si no tiene la forma esperada. */
export function aResultados(json: unknown): ResultadoBusqueda[] | null {
  const r = busqueda.safeParse(json);
  if (!r.success) return null;
  return r.data.data.map((d) => ({
    symbol: d.symbol,
    instrumentName: d.instrument_name,
    instrumentType: d.instrument_type,
    currency: d.currency,
    exchange: d.exchange,
  }));
}

/**
 * `/eod` → cierre con la fecha de la sesión y el instante que informa el
 * proveedor. `null` si la forma no es la esperada o el precio da 0.
 */
export function aCierre(json: unknown): PrecioActual | null {
  const r = eod.safeParse(json);
  if (!r.success) return null;
  const precio = parsearPrecio(r.data.close);
  if (precio === null) return null;
  return {
    precio,
    fecha: r.data.datetime,
    origen: "cierre",
    cotizadoEn: new Date(r.data.timestamp * 1000),
  };
}

/**
 * `/quote` → intradía con `close` como precio y el instante de la última
 * cotización (`last_quote_at`, o `timestamp` si no viene). La `fecha` es la
 * del proveedor; quien guarda la pasa a la zona del usuario.
 */
export function aIntradia(json: unknown): PrecioActual | null {
  const r = quote.safeParse(json);
  if (!r.success) return null;
  const precio = parsearPrecio(r.data.close);
  if (precio === null) return null;
  return {
    precio,
    fecha: r.data.datetime,
    origen: "intradia",
    cotizadoEn: new Date((r.data.last_quote_at ?? r.data.timestamp) * 1000),
  };
}

/**
 * `/time_series` diaria → cierres. El proveedor solo informa el día de cada
 * sesión: `cotizadoEn` es ese día a las 00:00 UTC. `null` si la forma no es la
 * esperada o algún precio da 0: una serie a medias no se guarda.
 */
export function aCierres(json: unknown): CierreHistorico[] | null {
  const r = serie.safeParse(json);
  if (!r.success) return null;
  const cierres: CierreHistorico[] = [];
  for (const v of r.data.values) {
    const precio = parsearPrecio(v.close);
    if (precio === null) return null;
    cierres.push({ fecha: v.datetime, precio, cotizadoEn: new Date(`${v.datetime}T00:00:00Z`) });
  }
  return cierres;
}

/**
 * Respuesta de `/batch` → la respuesta de cada subpetición por su clave, o
 * `null` en las que fallaron. `null` del todo si el lote falló.
 */
export function aSubrespuestas(json: unknown): Map<string, unknown> | null {
  const r = lote.safeParse(json);
  if (!r.success) return null;
  const respuestas = new Map<string, unknown>();
  for (const [clave, sub] of Object.entries(r.data.data)) {
    const enError =
      sub.status !== "success" ||
      (typeof sub.response === "object" &&
        sub.response !== null &&
        (sub.response as { status?: unknown }).status === "error");
    respuestas.set(clave, enError ? null : sub.response);
  }
  return respuestas;
}

/** Subpetición del precio actual de un activo. */
export function rutaActual(a: Pick<ActivoAConsultar, "clase" | "simboloFuente">): string {
  return a.clase === "cripto"
    ? `/quote?symbol=${a.simboloFuente}`
    : `/eod?symbol=${a.simboloFuente}`;
}

/** Subpetición de los cierres diarios de un activo en `[desde, hasta]`. */
export function rutaHistorico(p: Omit<PedidoHistorico, "activoId">): string {
  return `/time_series?symbol=${p.simboloFuente}&interval=1day&start_date=${p.desde}&end_date=${p.hasta}`;
}

function enLotes<T>(elementos: readonly T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += LOTE_MAXIMO) {
    lotes.push(elementos.slice(i, i + LOTE_MAXIMO));
  }
  return lotes;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

/**
 * Se construye con la clave de `TWELVE_DATA_API_KEY` (o `null`) en
 * `PreciosModule`. Sin clave, `disponible` es falso y nada sale a la red.
 */
export class PreciosFuente {
  private readonly logger = new Logger("PreciosFuente");

  constructor(private readonly clave: string | null) {}

  get disponible(): boolean {
    return this.clave !== null;
  }

  /** Resultados de la búsqueda de `simbolo`, o `null` ante cualquier falla. */
  async buscar(simbolo: string): Promise<ResultadoBusqueda[] | null> {
    const ruta = `/symbol_search?symbol=${encodeURIComponent(simbolo)}&outputsize=${RESULTADOS_BUSQUEDA}`;
    const json = await this.pedir("búsqueda", ruta);
    if (json === undefined) return null;
    const resultados = aResultados(json);
    if (resultados === null) this.logger.warn("Búsqueda: respuesta con otra forma");
    return resultados;
  }

  /**
   * Precio actual de cada activo, en el mismo orden; `null` en los que
   * fallaron. Lotes de a lo sumo 8.
   */
  async actuales(activos: readonly ActivoAConsultar[]): Promise<(PrecioObtenido | null)[]> {
    const resultado: (PrecioObtenido | null)[] = [];
    for (const grupo of enLotes(activos)) {
      const respuestas = await this.lote(
        "precio actual",
        grupo.map((a) => rutaActual(a)),
      );
      for (const [i, a] of grupo.entries()) {
        const json = respuestas?.[i] ?? null;
        const precio =
          json === null ? null : a.clase === "cripto" ? aIntradia(json) : aCierre(json);
        if (json !== null && precio === null) {
          this.logger.warn("Precio actual: una subpetición con otra forma o precio 0");
        }
        resultado.push(precio === null ? null : { activoId: a.activoId, ...precio });
      }
    }
    return resultado;
  }

  /** Cierres de cada pedido, en el mismo orden; `null` en los que fallaron. Lotes de a lo sumo 8. */
  async historico(pedidos: readonly PedidoHistorico[]): Promise<(CierreHistorico[] | null)[]> {
    const resultado: (CierreHistorico[] | null)[] = [];
    for (const grupo of enLotes(pedidos)) {
      const respuestas = await this.lote(
        "histórico",
        grupo.map((p) => rutaHistorico(p)),
      );
      for (const [i] of grupo.entries()) {
        const json = respuestas?.[i] ?? null;
        const cierres = json === null ? null : aCierres(json);
        if (json !== null && cierres === null) {
          this.logger.warn("Histórico: una subpetición con otra forma o precio 0");
        }
        resultado.push(cierres);
      }
    }
    return resultado;
  }

  /** Un `POST /batch` con `rutas`; la respuesta de cada una en orden, o `null` si el lote falló. */
  private async lote(contexto: string, rutas: readonly string[]): Promise<unknown[] | null> {
    const cuerpo = Object.fromEntries(rutas.map((url, i) => [`r${i + 1}`, { url }]));
    const json = await this.pedir(contexto, "/batch", cuerpo);
    if (json === undefined) return null;
    const respuestas = aSubrespuestas(json);
    if (respuestas === null) {
      this.logger.warn(`${contexto}: el lote respondió con error o con otra forma`);
      return null;
    }
    const fallidas = rutas.filter((_, i) => (respuestas.get(`r${i + 1}`) ?? null) === null).length;
    if (fallidas > 0)
      this.logger.warn(`${contexto}: ${fallidas} de ${rutas.length} subpeticiones fallaron`);
    return rutas.map((_, i) => respuestas.get(`r${i + 1}`) ?? null);
  }

  /** JSON de la respuesta, o `undefined` ante cualquier falla (con aviso). */
  private async pedir(contexto: string, ruta: string, cuerpo?: object): Promise<unknown> {
    if (this.clave === null) return undefined;
    try {
      const respuesta = await fetch(`${BASE}${ruta}`, {
        method: cuerpo === undefined ? "GET" : "POST",
        headers: {
          Authorization: `apikey ${this.clave}`,
          ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (respuesta.status !== 200) {
        this.logger.warn(`${contexto}: la fuente respondió ${respuesta.status}`);
        return undefined;
      }
      const json: unknown = await respuesta.json();
      if (
        typeof json === "object" &&
        json !== null &&
        (json as { status?: unknown }).status === "error"
      ) {
        const codigo = (json as { code?: unknown }).code;
        this.logger.warn(`${contexto}: la fuente respondió status error (${String(codigo)})`);
        return undefined;
      }
      return json;
    } catch (error) {
      const motivo = error instanceof Error ? error.name : "desconocido";
      this.logger.warn(`${contexto}: no se pudo consultar la fuente (${motivo})`);
      return undefined;
    }
  }
}
