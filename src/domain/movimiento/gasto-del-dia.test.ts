import { describe, expect, it } from "vitest";
import { sumarGastos } from "./gasto-del-dia.js";

describe("sumarGastos (RN-05)", () => {
  it("sin movimientos es 0", () => {
    expect(sumarGastos([])).toBe(0n);
  });

  it("suma solo los gastos: ingresos y transferencias no cuentan", () => {
    expect(
      sumarGastos([
        { tipo: "gasto", monto: 15_000n },
        { tipo: "ingreso", monto: 100_000n },
        { tipo: "transferencia", monto: 50_000n },
        { tipo: "gasto", monto: 3_000n },
      ]),
    ).toBe(18_000n);
  });
});
