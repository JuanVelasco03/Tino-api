import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PreciosFuente,
  aCierre,
  aCierres,
  aIntradia,
  aResultados,
  aSubrespuestas,
  rutaActual,
  rutaHistorico,
} from "./precios.fuente.js";
import {
  BUSQUEDA_BTC,
  EOD_AAPL,
  LOTE_CON_ERROR,
  QUOTE_BTC,
  SERIE_AAPL,
} from "./respuestas.test-utils.js";

const CLAVE = "clave-secreta-de-prueba";

describe("parseo de respuestas grabadas", () => {
  it("symbol_search → resultados, con currency vacía en cripto", () => {
    const resultados = aResultados(BUSQUEDA_BTC)!;
    expect(resultados).toHaveLength(30);
    expect(resultados.find((r) => r.symbol === "BTC/USD")).toEqual({
      symbol: "BTC/USD",
      instrumentName: "Bitcoin US Dollar",
      instrumentType: "Digital Currency",
      currency: "",
      exchange: "Coinbase Pro",
    });
  });

  it("eod → cierre con la fecha de la sesión y el instante del proveedor", () => {
    expect(aCierre(EOD_AAPL)).toEqual({
      precio: 34256n,
      fecha: "2026-11-20",
      origen: "cierre",
      cotizadoEn: new Date(1795208340 * 1000),
    });
  });

  it("quote → intradía con close y last_quote_at", () => {
    expect(aIntradia(QUOTE_BTC)).toEqual({
      precio: 6131290n,
      fecha: "2026-11-22",
      origen: "intradia",
      cotizadoEn: new Date(1795366140 * 1000),
    });
    const { last_quote_at: _omitido, ...sinUltima } = QUOTE_BTC;
    expect(aIntradia(sinUltima)?.cotizadoEn).toEqual(new Date(1795305600 * 1000));
  });

  it("time_series → cierres diarios", () => {
    const cierres = aCierres(SERIE_AAPL)!;
    expect(cierres).toHaveLength(10);
    expect(cierres[0]).toEqual({
      fecha: "2026-11-02",
      precio: 33832n,
      cotizadoEn: new Date("2026-11-02T00:00:00Z"),
    });
  });

  it.each([
    ["status error", { code: 400, message: "x", status: "error" }],
    ["precio cero", { ...EOD_AAPL, close: "0.001" }],
    ["precio numérico", { ...EOD_AAPL, close: 342.56 }],
    ["sin timestamp", { symbol: "AAPL", datetime: "2026-11-20", close: "1" }],
    ["null", null],
  ])("eod con %s → null", (_caso, json) => {
    expect(aCierre(json)).toBeNull();
  });

  it("una serie con un precio inválido no se guarda a medias", () => {
    const values = [...SERIE_AAPL.values];
    values[3] = { ...values[3]!, close: "abc" };
    expect(aCierres({ ...SERIE_AAPL, values })).toBeNull();
  });

  it("un lote con una subpetición en error deja null solo en esa", () => {
    const respuestas = aSubrespuestas(LOTE_CON_ERROR)!;
    expect(respuestas.get("r3")).toBeNull();
    expect(aCierre(respuestas.get("r1"))?.precio).toBe(34256n);
    expect(aIntradia(respuestas.get("r2"))?.precio).toBe(6131290n);
  });

  it("un lote en error → null", () => {
    expect(aSubrespuestas({ code: 429, message: "x", status: "error" })).toBeNull();
  });

  it("rutas de las subpeticiones", () => {
    expect(rutaActual({ clase: "etf", simboloFuente: "VOO" })).toBe("/eod?symbol=VOO");
    expect(rutaActual({ clase: "cripto", simboloFuente: "BTC/USD" })).toBe("/quote?symbol=BTC/USD");
    expect(rutaHistorico({ simboloFuente: "VOO", desde: "2026-08-24", hasta: "2026-10-31" })).toBe(
      "/time_series?symbol=VOO&interval=1day&start_date=2026-08-24&end_date=2026-10-31",
    );
  });
});

describe("PreciosFuente", () => {
  const fetchFalso = vi.fn<typeof fetch>();
  let avisos: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchFalso);
    avisos = [];
    vi.spyOn(Logger.prototype, "warn").mockImplementation((mensaje: unknown) => {
      avisos.push(String(mensaje));
    });
  });

  afterEach(() => {
    fetchFalso.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const json = (cuerpo: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));

  it("sin clave: no disponible y nada sale a la red", async () => {
    const fuente = new PreciosFuente(null);
    expect(fuente.disponible).toBe(false);
    expect(await fuente.buscar("VOO")).toBeNull();
    expect(await fuente.actuales([{ activoId: "a", clase: "etf", simboloFuente: "VOO" }])).toEqual([
      null,
    ]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("la clave va en la cabecera, nunca en la URL", async () => {
    fetchFalso.mockReturnValue(json(BUSQUEDA_BTC));
    const fuente = new PreciosFuente(CLAVE);
    await fuente.buscar("BTC");
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url as string).toBe("https://api.twelvedata.com/symbol_search?symbol=BTC&outputsize=30");
    expect(url as string).not.toContain(CLAVE);
    expect((init!.headers as Record<string, string>).Authorization).toBe(`apikey ${CLAVE}`);
  });

  it("actuales: un POST /batch con una subpetición por activo y null en la que falló", async () => {
    fetchFalso.mockReturnValue(json(LOTE_CON_ERROR));
    const fuente = new PreciosFuente(CLAVE);
    const precios = await fuente.actuales([
      { activoId: "aapl", clase: "accion", simboloFuente: "AAPL" },
      { activoId: "btc", clase: "cripto", simboloFuente: "BTC/USD" },
      { activoId: "otro", clase: "accion", simboloFuente: "NOEXISTE123" },
    ]);
    expect(precios.map((p) => p?.activoId ?? null)).toEqual(["aapl", "btc", null]);
    expect(precios[0]?.origen).toBe("cierre");
    expect(precios[1]?.origen).toBe("intradia");

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url as string).toBe("https://api.twelvedata.com/batch");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      r1: { url: "/eod?symbol=AAPL" },
      r2: { url: "/quote?symbol=BTC/USD" },
      r3: { url: "/eod?symbol=NOEXISTE123" },
    });
  });

  it("parte en lotes de 8", async () => {
    fetchFalso.mockImplementation(() => json({ status: "success", data: {} }));
    const fuente = new PreciosFuente(CLAVE);
    const activos = Array.from({ length: 9 }, (_, i) => ({
      activoId: `a${i}`,
      clase: "etf" as const,
      simboloFuente: `S${i}`,
    }));
    const precios = await fuente.actuales(activos);
    expect(precios).toEqual(Array(9).fill(null));
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["estado 500", () => json({}, 500)],
    ["status error", () => json({ code: 429, message: "límite", status: "error" })],
    ["forma inesperada", () => json({ otra: "cosa" })],
    ["red caída", () => Promise.reject(new TypeError("fetch failed"))],
    ["timeout", () => Promise.reject(new DOMException("t", "TimeoutError"))],
  ])("%s → null y aviso sin la clave", async (_caso, respuesta) => {
    fetchFalso.mockImplementation(respuesta);
    const fuente = new PreciosFuente(CLAVE);
    expect(await fuente.buscar("VOO")).toBeNull();
    expect(
      await fuente.historico([
        { activoId: "a", simboloFuente: "VOO", desde: "2026-01-01", hasta: "2026-01-31" },
      ]),
    ).toEqual([null]);
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.join("\n")).not.toContain(CLAVE);
  });

  it("historico: la serie de cada pedido en orden", async () => {
    fetchFalso.mockReturnValue(
      json({ status: "success", data: { r1: { status: "success", response: SERIE_AAPL } } }),
    );
    const fuente = new PreciosFuente(CLAVE);
    const [cierres] = await fuente.historico([
      { activoId: "a", simboloFuente: "AAPL", desde: "2026-10-20", hasta: "2026-11-03" },
    ]);
    expect(cierres).toHaveLength(10);
  });
});
