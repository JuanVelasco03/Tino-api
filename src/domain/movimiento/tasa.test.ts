import { describe, expect, it } from "vitest";
import { tasaDeTransferencia, tasaImplicita } from "./tasa.js";

describe("tasaImplicita (RN-04)", () => {
  it("8.240.000 pesos por US$ 2.000,00 → 4120.000000", () => {
    expect(tasaImplicita(8240000n, 200000n)).toBe("4120.000000");
  });

  it("redondea half-up a 6 decimales", () => {
    expect(tasaImplicita(1000000n, 24000n)).toBe("4166.666667");
    expect(tasaImplicita(1n, 3n)).toBe("33.333333");
    expect(tasaImplicita(2n, 3n)).toBe("66.666667");
  });

  it("montos no positivos lanzan", () => {
    expect(() => tasaImplicita(0n, 1n)).toThrow();
    expect(() => tasaImplicita(1n, 0n)).toThrow();
  });
});

describe("tasaDeTransferencia", () => {
  it("COP → USD: pesos del origen, centavos del destino", () => {
    expect(tasaDeTransferencia(8240000n, 200000n, "COP")).toBe("4120.000000");
  });

  it("USD → COP: centavos del origen, pesos del destino", () => {
    expect(tasaDeTransferencia(100000n, 4120000n, "USD")).toBe("4120.000000");
  });

  it("sin montoDestino, 1", () => {
    expect(tasaDeTransferencia(5n, null, "COP")).toBe("1");
  });
});
