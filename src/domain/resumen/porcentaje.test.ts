import { describe, expect, it } from "vitest";
import { porcentajeEnDecimas, variacionPorcentual } from "./porcentaje.js";

describe("porcentajeEnDecimas", () => {
  it("260000 de 300000 → 867", () => {
    expect(porcentajeEnDecimas(260_000n, 300_000n)).toBe(867);
  });

  it("1 de 3 → 333", () => {
    expect(porcentajeEnDecimas(1n, 3n)).toBe(333);
  });

  it("5 de 1000 → 5", () => {
    expect(porcentajeEnDecimas(5n, 1000n)).toBe(5);
  });

  it("la mitad redondea hacia arriba: 1 de 2000 → 1", () => {
    expect(porcentajeEnDecimas(1n, 2000n)).toBe(1);
  });

  it("total cero → null", () => {
    expect(porcentajeEnDecimas(0n, 0n)).toBeNull();
    expect(porcentajeEnDecimas(10n, 0n)).toBeNull();
  });

  it("parte cero → 0", () => {
    expect(porcentajeEnDecimas(0n, 420_000n)).toBe(0);
  });

  it("siempre devuelve un entero", () => {
    expect(Number.isInteger(porcentajeEnDecimas(10_000n, 300_000n))).toBe(true);
  });
});

describe("variacionPorcentual", () => {
  it("de 1.580.000 a −300.000 → −1190", () => {
    expect(variacionPorcentual(-300_000n, 1_580_000n)).toBe(-1190);
  });

  it("de 420.000 a 300.000 → −286", () => {
    expect(variacionPorcentual(300_000n, 420_000n)).toBe(-286);
  });

  it("de 2.000.000 a 0 → −1000", () => {
    expect(variacionPorcentual(0n, 2_000_000n)).toBe(-1000);
  });

  it("la mitad negativa redondea lejos de cero: de 2000 a 1999 → −1", () => {
    // −1000/2000 = −0,5 → −1
    expect(variacionPorcentual(1999n, 2000n)).toBe(-1);
  });

  it("anterior negativo: divide por su valor absoluto", () => {
    // De −100.000 a −50.000 mejora: (−50.000 + 100.000) / 100.000 → +500.
    expect(variacionPorcentual(-50_000n, -100_000n)).toBe(500);
    // De −100.000 a −150.000 empeora: → −500.
    expect(variacionPorcentual(-150_000n, -100_000n)).toBe(-500);
  });

  it("puede pasar de 1000", () => {
    expect(variacionPorcentual(300_000n, 100_000n)).toBe(2000);
  });

  it("anterior cero → null", () => {
    expect(variacionPorcentual(500n, 0n)).toBeNull();
    expect(variacionPorcentual(0n, 0n)).toBeNull();
  });
});
