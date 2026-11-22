import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aTrm, aTrms, TrmFuente, urlEn, urlRango } from "./trm.fuente.js";

/** Filas reales de la fuente, citadas en SPEC 09. */
const filaFinDeSemana = {
  valor: "3461.92",
  unidad: "COP",
  vigenciadesde: "2026-11-21T00:00:00.000",
  vigenciahasta: "2026-11-23T00:00:00.000",
};
const filaSinCerosFinales = { ...filaFinDeSemana, valor: "3415.1" };

describe("aTrm", () => {
  it("convierte la fila real de fin de semana", () => {
    expect(aTrm([filaFinDeSemana])).toEqual({
      valorCent: 346192n,
      vigenteDesde: "2026-11-21",
      vigenteHasta: "2026-11-23",
    });
  });

  it("acepta un valor sin ceros finales", () => {
    expect(aTrm([filaSinCerosFinales])?.valorCent).toBe(341510n);
  });

  it("ignora campos adicionales", () => {
    expect(aTrm([{ ...filaFinDeSemana, otro: "x" }])?.valorCent).toBe(346192n);
  });

  it.each([
    ["lista vacía", []],
    ["unidad USD", [{ ...filaFinDeSemana, unidad: "USD" }]],
    ["valor inválido", [{ ...filaFinDeSemana, valor: "3.461,92" }]],
    ["valor cero", [{ ...filaFinDeSemana, valor: "0" }]],
    ["valor numérico", [{ ...filaFinDeSemana, valor: 3461.92 }]],
    ["sin fechas", [{ valor: "3461.92", unidad: "COP" }]],
    ["fecha mal formada", [{ ...filaFinDeSemana, vigenciadesde: "21/11/2026" }]],
    ["vigencia invertida", [{ ...filaFinDeSemana, vigenciahasta: "2026-11-20T00:00:00.000" }]],
    ["objeto en vez de lista", filaFinDeSemana],
    ["error de Socrata", { error: true, message: "bad query" }],
    ["null", null],
  ])("%s → null", (_caso, json) => {
    expect(aTrm(json)).toBeNull();
  });
});

describe("aTrms (SPEC 10)", () => {
  const lunes = {
    valor: "3470.10",
    unidad: "COP",
    vigenciadesde: "2026-11-24T00:00:00.000",
    vigenciahasta: "2026-11-24T00:00:00.000",
  };

  it("convierte todas las filas, en orden", () => {
    expect(aTrms([filaFinDeSemana, lunes])).toEqual([
      { valorCent: 346192n, vigenteDesde: "2026-11-21", vigenteHasta: "2026-11-23" },
      { valorCent: 347010n, vigenteDesde: "2026-11-24", vigenteHasta: "2026-11-24" },
    ]);
  });

  it("una lista vacía es válida: no hay filas en el rango", () => {
    expect(aTrms([])).toEqual([]);
  });

  it.each([
    ["una fila inválida", [filaFinDeSemana, { ...lunes, valor: "x" }]],
    ["no es lista", filaFinDeSemana],
    ["null", null],
  ])("%s → null", (_caso, json) => {
    expect(aTrms(json)).toBeNull();
  });
});

describe("urlRango", () => {
  it("pide las filas que se cruzan con el rango, ordenadas", () => {
    const url = new URL(urlRango("2026-10-31", "2026-11-30"));
    expect(url.searchParams.get("$where")).toBe(
      "vigenciahasta >= '2026-10-31T00:00:00.000' AND vigenciadesde <= '2026-11-30T00:00:00.000'",
    );
    expect(url.searchParams.get("$order")).toBe("vigenciadesde");
    expect(url.searchParams.get("$limit")).toBe("1000");
  });
});

describe("urlEn", () => {
  it("pide la fila que cubre la fecha, codificada", () => {
    const url = new URL(urlEn("2026-11-22"));
    expect(url.origin + url.pathname).toBe("https://www.datos.gov.co/resource/32sa-8pi3.json");
    expect(url.searchParams.get("$where")).toBe(
      "vigenciadesde <= '2026-11-22T00:00:00.000' AND vigenciahasta >= '2026-11-22T00:00:00.000'",
    );
    expect(url.searchParams.get("$limit")).toBe("1");
    expect(urlEn("2026-11-22")).not.toContain(" ");
  });
});

describe("TrmFuente.obtenerEn", () => {
  const fuente = new TrmFuente();
  const fetchFalso = vi.fn<typeof fetch>();
  let aviso: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchFalso);
    aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchFalso.mockReset();
  });

  it("arma la URL, aplica el timeout y devuelve la TRM", async () => {
    fetchFalso.mockResolvedValue(Response.json([filaFinDeSemana]));
    expect(await fuente.obtenerEn("2026-11-22")).toEqual({
      valorCent: 346192n,
      vigenteDesde: "2026-11-21",
      vigenteHasta: "2026-11-23",
    });
    const [url, opciones] = fetchFalso.mock.calls[0]!;
    expect(url).toBe(urlEn("2026-11-22"));
    expect(opciones?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["estado 500", () => Promise.resolve(new Response("caída", { status: 500 }))],
    ["estado 404", () => Promise.resolve(Response.json([filaFinDeSemana], { status: 404 }))],
    ["error de red", () => Promise.reject(new TypeError("fetch failed"))],
    ["timeout", () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["JSON inválido", () => Promise.resolve(new Response("<html>", { status: 200 }))],
    ["lista vacía", () => Promise.resolve(Response.json([]))],
  ])("%s → null con aviso", async (_caso, respuesta) => {
    fetchFalso.mockImplementation(respuesta);
    expect(await fuente.obtenerEn("2026-11-22")).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("TrmFuente.obtenerRango", () => {
  const fuente = new TrmFuente();
  const fetchFalso = vi.fn<typeof fetch>();
  let aviso: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchFalso);
    aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchFalso.mockReset();
  });

  it("una sola consulta por el rango, con timeout", async () => {
    fetchFalso.mockResolvedValue(Response.json([filaFinDeSemana]));
    expect(await fuente.obtenerRango("2026-11-20", "2026-11-23")).toHaveLength(1);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchFalso.mock.calls[0]!;
    expect(url).toBe(urlRango("2026-11-20", "2026-11-23"));
    expect(opciones?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["estado 500", () => Promise.resolve(new Response("caída", { status: 500 }))],
    ["error de red", () => Promise.reject(new TypeError("fetch failed"))],
    ["forma inválida", () => Promise.resolve(Response.json({ error: true }))],
  ])("%s → null con aviso", async (_caso, respuesta) => {
    fetchFalso.mockImplementation(respuesta);
    expect(await fuente.obtenerRango("2026-11-20", "2026-11-23")).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});
