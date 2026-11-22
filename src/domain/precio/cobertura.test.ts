import { describe, expect, it } from "vitest";
import {
  BUSQUEDA_AAPL,
  BUSQUEDA_BTC,
  BUSQUEDA_RENEW,
  BUSQUEDA_VOO,
} from "../../repositories/twelve-data/respuestas.test-utils.js";
import { elegirCobertura, modoDeCobertura } from "./cobertura.js";
import type { ResultadoBusqueda } from "./precio.js";

/** El dominio recibe los resultados ya parseados por la fuente. */
const resultados = (respuesta: { data: readonly Record<string, string>[] }): ResultadoBusqueda[] =>
  respuesta.data.map((r) => ({
    symbol: r.symbol!,
    instrumentName: r.instrument_name!,
    instrumentType: r.instrument_type!,
    currency: r.currency!,
    exchange: r.exchange!,
  }));

describe("elegirCobertura (respuestas grabadas)", () => {
  it("VOO en una cuenta USD → etf", () => {
    expect(elegirCobertura("VOO", "USD", resultados(BUSQUEDA_VOO))).toEqual({
      cubierto: true,
      clase: "etf",
      simboloFuente: "VOO",
      nombre: "Vanguard S&P 500 ETF",
    });
  });

  it("AAPL en una cuenta USD → accion", () => {
    expect(elegirCobertura("AAPL", "USD", resultados(BUSQUEDA_AAPL))).toEqual({
      cubierto: true,
      clase: "accion",
      simboloFuente: "AAPL",
      nombre: "Apple Inc.",
    });
  });

  it("BTC en una cuenta USD → cripto con BTC/USD, aunque haya un ETF BTC en NYSE", () => {
    expect(elegirCobertura("BTC", "USD", resultados(BUSQUEDA_BTC))).toEqual({
      cubierto: true,
      clase: "cripto",
      simboloFuente: "BTC/USD",
      nombre: "Bitcoin US Dollar",
    });
  });

  it("RENEW (solo en SIX) → no cubierto", () => {
    expect(elegirCobertura("RENEW", "USD", resultados(BUSQUEDA_RENEW))).toEqual({
      cubierto: false,
    });
  });

  it("un símbolo inexistente → no cubierto", () => {
    expect(elegirCobertura("NOEXISTE", "USD", resultados(BUSQUEDA_VOO))).toEqual({
      cubierto: false,
    });
    expect(elegirCobertura("VOO", "USD", [])).toEqual({ cubierto: false });
  });

  it("una cuenta COP → no cubierto, aunque AAPL cotice en COP en la BVC", () => {
    expect(elegirCobertura("AAPL", "COP", resultados(BUSQUEDA_AAPL))).toEqual({
      cubierto: false,
    });
    expect(elegirCobertura("BTC", "COP", resultados(BUSQUEDA_BTC))).toEqual({ cubierto: false });
  });

  it("exige bolsa de EE. UU.: VOO en MXN (BMV) no cubre una cuenta USD por moneda ni bolsa", () => {
    const soloMexico = resultados(BUSQUEDA_VOO).filter((r) => r.exchange === "BMV");
    expect(elegirCobertura("VOO", "USD", soloMexico)).toEqual({ cubierto: false });
    const ucitsEnCboeEuropa: ResultadoBusqueda = {
      symbol: "BTC1L",
      instrumentName: "Bitwise Core Bitcoin ETP",
      instrumentType: "ETF",
      currency: "USD",
      exchange: "CBOE",
    };
    expect(elegirCobertura("BTC1L", "USD", [ucitsEnCboeEuropa])).toEqual({ cubierto: false });
  });
});

describe("modoDeCobertura", () => {
  it("cubierto → automático; no cubierto → manual", () => {
    expect(
      modoDeCobertura({ cubierto: true, clase: "cripto", simboloFuente: "BTC/USD", nombre: "x" }),
    ).toEqual({ cotizacion: "automatica", clase: "cripto", simboloFuente: "BTC/USD" });
    expect(modoDeCobertura({ cubierto: false })).toEqual({
      cotizacion: "manual",
      clase: null,
      simboloFuente: null,
    });
  });
});
