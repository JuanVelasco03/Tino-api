import { describe, expect, it } from "vitest";
import { cupoDisponible, porcentajeUsado } from "./cupo.js";

describe("cupoDisponible (RN-18)", () => {
  it("es cupo total menos deuda vigente", () => {
    expect(cupoDisponible(6_000_000n, 1_267_900n)).toBe(4_732_100n);
  });

  it("con deuda cero, el cupo está completo", () => {
    expect(cupoDisponible(6_000_000n, 0n)).toBe(6_000_000n);
  });
});

describe("porcentajeUsado", () => {
  it("trunca al entero: 1.267.900 de 6.000.000 es 21 %", () => {
    expect(porcentajeUsado(6_000_000n, 1_267_900n)).toBe(21);
  });

  it("0 % sin deuda y 100 % al llegar al cupo", () => {
    expect(porcentajeUsado(6_000_000n, 0n)).toBe(0);
    expect(porcentajeUsado(6_000_000n, 6_000_000n)).toBe(100);
  });

  it("se acota a 100 si la deuda excede el cupo", () => {
    expect(porcentajeUsado(6_000_000n, 6_500_000n)).toBe(100);
  });

  it("cupo cero no divide por cero", () => {
    expect(porcentajeUsado(0n, 100n)).toBe(0);
  });
});
