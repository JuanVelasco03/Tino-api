import { describe, expect, it } from "vitest";
import { cpbATasa, tasaACpb } from "./tasa.js";

describe("tasaACpb", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["1.5", 150],
    ["0.25", 25],
    ["100", 10000],
    ["1.50", 150],
    ["12.05", 1205],
  ])("%s → %i", (texto, cpb) => {
    expect(tasaACpb(texto)).toBe(cpb);
  });

  it.each(["100.01", "101", "-1", "1.234", "abc", "", "1.", ".5", "01", "1,5", " 1"])(
    "%j es inválida",
    (texto) => {
      expect(tasaACpb(texto)).toBeNull();
    },
  );
});

describe("cpbATasa", () => {
  it.each([
    [150, "1.5"],
    [100, "1"],
    [0, "0"],
    [25, "0.25"],
    [1205, "12.05"],
    [10000, "100"],
  ])("%i → %s", (cpb, texto) => {
    expect(cpbATasa(cpb)).toBe(texto);
  });

  it("ida y vuelta", () => {
    for (const texto of ["0", "1", "1.5", "0.25", "99.99", "100"]) {
      expect(cpbATasa(tasaACpb(texto)!)).toBe(texto);
    }
  });
});
