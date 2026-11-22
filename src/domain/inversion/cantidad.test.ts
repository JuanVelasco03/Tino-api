import { describe, expect, it } from "vitest";
import { formatearCantidad, parsearCantidad } from "./cantidad.js";
import { dividirRedondeando, esClaseOperacion, esMoneda } from "./inversion.js";

describe("parsearCantidad", () => {
  it.each([
    ["0.0125", 1250000n],
    ["6.25", 625000000n],
    ["1", 100000000n],
    ["0.00000001", 1n],
    ["9999999999.99999999", 999999999999999999n],
  ])("%s → %s", (texto, esperado) => {
    expect(parsearCantidad(texto)).toBe(esperado);
  });

  it.each(["0", "0.0", "-1", "1.123456789", "1,5", "", " 1", "1.", ".5", "12345678901", "abc"])(
    "%j es inválida",
    (texto) => {
      expect(parsearCantidad(texto)).toBeNull();
    },
  );
});

describe("formatearCantidad", () => {
  it.each([
    [1250000n, "0.0125"],
    [625000000n, "6.25"],
    [100000000n, "1"],
    [1n, "0.00000001"],
    [0n, "0"],
    [-150000000n, "-1.5"],
  ])("%s → %s", (cantidad, esperado) => {
    expect(formatearCantidad(cantidad)).toBe(esperado);
  });

  it("ida y vuelta", () => {
    for (const texto of ["0.0125", "6.25", "1", "123.45678901"]) {
      expect(formatearCantidad(parsearCantidad(texto)!)).toBe(texto);
    }
  });
});

describe("constantes", () => {
  it("esMoneda y esClaseOperacion", () => {
    expect(esMoneda("COP")).toBe(true);
    expect(esMoneda("USD")).toBe(true);
    expect(esMoneda("EUR")).toBe(false);
    expect(esClaseOperacion("venta")).toBe(true);
    expect(esClaseOperacion("dividendo")).toBe(false);
  });

  it("dividirRedondeando es half-up lejos de cero", () => {
    expect(dividirRedondeando(5n, 2n)).toBe(3n);
    expect(dividirRedondeando(-5n, 2n)).toBe(-3n);
    expect(dividirRedondeando(4n, 3n)).toBe(1n);
    expect(dividirRedondeando(-4n, 3n)).toBe(-1n);
    expect(dividirRedondeando(7n, -2n)).toBe(-4n);
  });
});
