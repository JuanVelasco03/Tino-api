import { describe, expect, it } from "vitest";
import { parsearPrecio } from "./valor.js";

describe("parsearPrecio", () => {
  it.each([
    ["562.4", 56240n],
    ["71400.12345", 7140012n],
    ["71400", 7140000n],
    ["0.005", 1n],
    ["1.995", 200n],
    ["1.994999", 199n],
  ])("%s → %s", (texto, esperado) => {
    expect(parsearPrecio(texto)).toBe(esperado);
  });

  it.each(["0.004", "0", "0.00", "abc", "", "-1.5", "1e3", "1.", ".5"])("%s → null", (texto) => {
    expect(parsearPrecio(texto)).toBeNull();
  });
});
