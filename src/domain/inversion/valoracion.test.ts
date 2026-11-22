import { describe, expect, it } from "vitest";
import { UNA, activo, op, precio } from "./fixtures.test-utils.js";
import { aCop, precioVigente, valorDe, valorar, valorarInversion } from "./valoracion.js";

describe("precioVigente", () => {
  const precios = [
    precio("VOO", 50_000n, "2026-01-05"),
    precio("VOO", 56_240n, "2026-01-10", "2026-01-10T10:00:00Z"),
    precio("VOO", 57_000n, "2026-01-10", "2026-01-10T15:00:00Z"),
    precio("VOO", 60_000n, "2026-01-20"),
    precio("BTC", 1n, "2026-01-01"),
  ];

  it("el de mayor fecha ≤ F; en empate, el de mayor cotizadoEn", () => {
    const r = precioVigente("activo-VOO", precios, "2026-01-15");
    expect(r?.vigente.precio).toBe(57_000n);
    expect(r?.anterior?.precio).toBe(56_240n);
  });

  it("el anterior del primero ≤ F puede ser de otro día", () => {
    const r = precioVigente("activo-VOO", precios, "2026-01-07");
    expect(r?.vigente.precio).toBe(50_000n);
    expect(r?.anterior).toBeNull();
    expect(precioVigente("activo-VOO", precios, "2026-01-25")?.anterior?.precio).toBe(57_000n);
  });

  it("antes del primer precio, el más antiguo y sin anterior", () => {
    const r = precioVigente("activo-VOO", precios, "2025-12-31");
    expect(r?.vigente.precio).toBe(50_000n);
    expect(r?.anterior).toBeNull();
  });

  it("sin precios del activo, null", () => {
    expect(precioVigente("activo-ETH", precios, "2026-01-15")).toBeNull();
  });
});

describe("valorar", () => {
  it("ejemplo VOO del diseño: 6,25 × 562,40 = 3.515,00", () => {
    expect(valorDe(625_000_000n, 56_240n)).toBe(351_500n);
  });

  it("BTC: 0,0125 × 71.400,00 = 892,50", () => {
    expect(valorDe(1_250_000n, 7_140_000n)).toBe(89_250n);
  });

  it("rendimiento y porcentaje en centésimas", () => {
    expect(valorar(2n * UNA, 100_000n, 56_240n)).toEqual({
      valor: 112_480n,
      rendimiento: 12_480n,
      rendimientoPorcentaje: 1_248n,
    });
  });

  it("porcentaje negativo y redondeado", () => {
    expect(valorar(UNA, 30_000n, 20_000n).rendimientoPorcentaje).toBe(-3_333n);
  });

  it("con costo 0 el porcentaje es null", () => {
    expect(valorar(UNA, 0n, 10n).rendimientoPorcentaje).toBeNull();
  });
});

describe("aCop", () => {
  it("COP es el mismo monto; sin TRM no importa", () => {
    expect(aCop(1_250_000n, "COP", null)).toBe(1_250_000n);
  });

  it("USD: 112.480 centavos × 4.120,00 = 4.634.176 pesos", () => {
    expect(aCop(112_480n, "USD", 412_000n)).toBe(4_634_176n);
  });

  it("USD sin TRM, null", () => {
    expect(aCop(1n, "USD", null)).toBeNull();
  });

  it("redondea half-up, también los negativos", () => {
    // 1 centavo × 3.461,50 = 34,615 pesos → 35; negativo → −35.
    expect(aCop(1n, "USD", 346_150n)).toBe(35n);
    expect(aCop(-1n, "USD", 346_150n)).toBe(-35n);
    expect(aCop(-1n, "USD", 346_140n)).toBe(-35n);
    expect(aCop(-1n, "USD", 346_149n)).toBe(-35n);
    expect(aCop(-1n, "USD", 345_000n)).toBe(-35n);
    expect(aCop(-1n, "USD", 344_999n)).toBe(-34n);
  });
});

describe("valorarInversion", () => {
  it("criterios de SPEC 10: fondeo, compra, precio manual", () => {
    const voo = activo("VOO");
    const v = valorarInversion(
      {
        saldoCuenta: 200_000n,
        activos: [voo],
        operaciones: [op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05")],
        precios: [
          precio("VOO", 50_000n, "2026-01-05", "2026-01-05T10:00:00Z"),
          precio("VOO", 56_240n, "2026-01-05", "2026-01-05T11:00:00Z"),
        ],
      },
      "2026-01-05",
    );
    expect(v.efectivo).toBe(100_000n);
    expect(v.valorMercado).toBe(212_480n);
    expect(v.costo).toBe(100_000n);
    expect(v.rendimiento).toBe(12_480n);
    expect(v.rendimientoPorcentaje).toBe(1_248n);
    expect(v.posiciones).toHaveLength(1);
    expect(v.posiciones[0]).toMatchObject({
      valor: 112_480n,
      precio: { precio: 56_240n },
      precioAnterior: { precio: 50_000n },
    });
  });

  it("sin posiciones: el valor de mercado es el efectivo y el % es null", () => {
    const v = valorarInversion(
      { saldoCuenta: 5n, activos: [], operaciones: [], precios: [] },
      "2026-01-05",
    );
    expect(v).toMatchObject({
      efectivo: 5n,
      valorMercado: 5n,
      costo: 0n,
      rendimientoPorcentaje: null,
    });
  });
});
