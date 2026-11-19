import { describe, expect, it } from "vitest";
import type { Cuenta } from "./cuenta.js";
import { agruparCuentas } from "./resumen.js";

function cuenta(
  parcial: Partial<Cuenta> & Pick<Cuenta, "id" | "tipo" | "saldo" | "posicion">,
): Cuenta {
  return {
    nombre: parcial.id,
    detalle: null,
    saldoInicial: parcial.saldo,
    cupo: parcial.tipo === "tarjeta_credito" ? 4_000_000n : null,
    archivadaEn: null,
    ...parcial,
  };
}

describe("agruparCuentas", () => {
  it("sin cuentas: grupos vacíos y totales en cero", () => {
    expect(agruparCuentas([])).toEqual({
      activos: { total: 0n, cuentas: [] },
      pasivos: { total: 0n, cuentas: [] },
      patrimonioNeto: 0n,
    });
  });

  it("separa por naturaleza y respeta posicion", () => {
    const resumen = agruparCuentas([
      cuenta({ id: "banco", tipo: "banco", saldo: 10n, posicion: 1 }),
      cuenta({ id: "tarjeta", tipo: "tarjeta_credito", saldo: 5n, posicion: 0 }),
      cuenta({ id: "efectivo", tipo: "efectivo", saldo: 20n, posicion: 0 }),
    ]);
    expect(resumen.activos.cuentas.map((c) => c.id)).toEqual(["efectivo", "banco"]);
    expect(resumen.pasivos.cuentas.map((c) => c.id)).toEqual(["tarjeta"]);
  });

  it("suma en bigint y el patrimonio puede ser negativo", () => {
    const resumen = agruparCuentas([
      cuenta({ id: "nequi", tipo: "banco", saldo: 20_321n, posicion: 0 }),
      cuenta({ id: "tarjeta", tipo: "tarjeta_credito", saldo: 1_284_300n, posicion: 0 }),
    ]);
    expect(resumen.activos.total).toBe(20_321n);
    expect(resumen.pasivos.total).toBe(1_284_300n);
    expect(resumen.patrimonioNeto).toBe(-1_263_979n);
  });

  it("no pierde precisión con montos de 19 dígitos", () => {
    const resumen = agruparCuentas([
      cuenta({ id: "a", tipo: "banco", saldo: 9_000_000_000_000_000_001n, posicion: 0 }),
      cuenta({ id: "b", tipo: "banco", saldo: 1n, posicion: 1 }),
    ]);
    expect(resumen.activos.total).toBe(9_000_000_000_000_000_002n);
  });
});
