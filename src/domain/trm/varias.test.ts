/** Resolución de varias fechas a la vez (SPEC 10). */
import { describe, expect, it } from "vitest";
import type { Trm } from "./trm.js";
import { resolverEnFechas, sinCubrir, ultimaHasta } from "./vigente.js";

const t = (desde: string, hasta: string, valorCent: bigint): Trm => ({
  valorCent,
  vigenteDesde: desde,
  vigenteHasta: hasta,
});

const oct = t("2026-10-31", "2026-11-03", 400_000n);
const nov18 = t("2026-11-18", "2026-11-18", 410_000n);
const nov21 = t("2026-11-21", "2026-11-23", 412_000n);

describe("ultimaHasta y sinCubrir", () => {
  it("la de mayor vigenteDesde ≤ fecha", () => {
    expect(ultimaHasta([nov21, oct, nov18], "2026-11-20")).toBe(nov18);
    expect(ultimaHasta([nov21, oct], "2026-10-01")).toBeNull();
  });

  it("fechas sin fila que las cubra", () => {
    expect(sinCubrir([oct, nov21], ["2026-11-01", "2026-11-10", "2026-11-22"])).toEqual([
      "2026-11-10",
    ]);
  });
});

describe("resolverEnFechas", () => {
  it("todas cubiertas por la caché: al día", () => {
    const r = resolverEnFechas([oct, nov21], null, ["2026-11-01", "2026-11-22"]);
    expect(r.get("2026-11-01")).toEqual({ trm: oct, desactualizada: false });
    expect(r.get("2026-11-22")).toEqual({ trm: nov21, desactualizada: false });
  });

  it("las obtenidas cubren lo que faltaba", () => {
    const r = resolverEnFechas([oct], [nov18, nov21], ["2026-11-18", "2026-11-22"]);
    expect(r.get("2026-11-18")).toEqual({ trm: nov18, desactualizada: false });
    expect(r.get("2026-11-22")).toEqual({ trm: nov21, desactualizada: false });
  });

  it("la fuente falló: la última conocida, desactualizada", () => {
    const r = resolverEnFechas([oct], null, ["2026-11-10"]);
    expect(r.get("2026-11-10")).toEqual({ trm: oct, desactualizada: true });
  });

  it("sin caché y la fuente falló: ninguna", () => {
    expect(resolverEnFechas([], null, ["2026-11-10"]).get("2026-11-10")).toEqual({
      trm: null,
      desactualizada: false,
    });
  });

  it("la fuente respondió pero no cubre la fecha: la última conocida, desactualizada", () => {
    const r = resolverEnFechas([], [nov18], ["2026-11-20"]);
    expect(r.get("2026-11-20")).toEqual({ trm: nov18, desactualizada: true });
  });
});
