import { describe, expect, it } from "vitest";
import { formatearValor, parsearValor } from "./valor.js";

describe("parsearValor", () => {
  it.each([
    ["3461.92", 346192n],
    ["3415.1", 341510n],
    ["3316", 331600n],
    ["0.01", 1n],
    ["999999.99", 99999999n],
  ])("%s → %s", (texto, cent) => {
    expect(parsearValor(texto)).toBe(cent);
  });

  it.each(["0", "0.00", "-1", "3461.925", "3.461,92", "", "abc", "1234567", "3461.", ".92", " 3461"])(
    "%j → null",
    (texto) => {
      expect(parsearValor(texto)).toBeNull();
    },
  );
});

describe("formatearValor", () => {
  it.each([
    [346192n, "3461.92"],
    [341510n, "3415.10"],
    [331600n, "3316.00"],
    [1n, "0.01"],
  ])("%s → %s", (cent, texto) => {
    expect(formatearValor(cent)).toBe(texto);
  });

  it("es inversa de parsearValor", () => {
    for (const texto of ["3461.92", "3415.10", "3316.00"]) {
      expect(formatearValor(parsearValor(texto)!)).toBe(texto);
    }
  });
});
