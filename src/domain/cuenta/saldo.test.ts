import { describe, expect, it } from "vitest";
import type { CuentaGuardada } from "./cuenta.js";
import { calcularSaldo, conSaldos, type EfectoMovimiento } from "./saldo.js";

const cuenta = (
  id: string,
  tipo: CuentaGuardada["tipo"],
  saldoInicial: bigint,
): CuentaGuardada => ({
  id,
  nombre: id,
  tipo,
  detalle: null,
  saldoInicial,
  cupo: tipo === "tarjeta_credito" ? 4_000_000n : null,
  posicion: 0,
  archivadaEn: null,
});

const gasto = (origen: string, monto: bigint): EfectoMovimiento => ({
  monto,
  cuentaOrigenId: origen,
  cuentaDestinoId: null,
});
const ingreso = (destino: string, monto: bigint): EfectoMovimiento => ({
  monto,
  cuentaOrigenId: null,
  cuentaDestinoId: destino,
});
const transferencia = (origen: string, destino: string, monto: bigint): EfectoMovimiento => ({
  monto,
  cuentaOrigenId: origen,
  cuentaDestinoId: destino,
});

describe("calcularSaldo (RN-01, RN-02)", () => {
  it("sin movimientos es el saldo inicial", () => {
    expect(calcularSaldo(cuenta("n", "banco", 20_321n), [])).toBe(20_321n);
  });

  it("activo: el gasto resta y el ingreso suma", () => {
    const n = cuenta("n", "banco", 100_000n);
    expect(calcularSaldo(n, [gasto("n", 15_000n), ingreso("n", 5_000n)])).toBe(90_000n);
  });

  it("pasivo: el gasto aumenta la deuda y el pago (transferencia entrante) la reduce (RN-07)", () => {
    const t = cuenta("t", "tarjeta_credito", 1_284_300n);
    expect(calcularSaldo(t, [gasto("t", 15_000n)])).toBe(1_299_300n);
    expect(calcularSaldo(t, [gasto("t", 15_000n), transferencia("n", "t", 299_300n)])).toBe(
      1_000_000n,
    );
  });

  it("ignora movimientos de otras cuentas", () => {
    expect(calcularSaldo(cuenta("n", "efectivo", 0n), [gasto("x", 9n), ingreso("y", 9n)])).toBe(0n);
  });

  it("el saldo de un activo puede quedar negativo", () => {
    expect(calcularSaldo(cuenta("e", "efectivo", 0n), [gasto("e", 1n)])).toBe(-1n);
  });

  it("montos por encima de 2^53 no pierden precisión", () => {
    const grande = 9_007_199_254_740_993n;
    expect(calcularSaldo(cuenta("b", "banco", grande), [ingreso("b", 2n)])).toBe(grande + 2n);
  });
});

describe("conSaldos", () => {
  it("una transferencia mueve el monto de una cuenta a otra, conservando el orden de entrada", () => {
    const cuentas = [cuenta("n", "banco", 100_000n), cuenta("e", "efectivo", 0n)];
    const resultado = conSaldos(cuentas, [transferencia("n", "e", 40_000n), gasto("e", 1_000n)]);
    expect(resultado.map((c) => [c.id, c.saldo])).toEqual([
      ["n", 60_000n],
      ["e", 39_000n],
    ]);
  });

  it("da el mismo resultado que calcularSaldo cuenta por cuenta", () => {
    const cuentas = [
      cuenta("n", "banco", 20_321n),
      cuenta("t", "tarjeta_credito", 1_284_300n),
      cuenta("e", "efectivo", 0n),
    ];
    const efectos = [
      gasto("n", 15_000n),
      gasto("t", 15_000n),
      transferencia("n", "t", 5_000n),
      ingreso("e", 100_000n),
      transferencia("e", "n", 1n),
    ];
    for (const c of conSaldos(cuentas, efectos)) {
      expect(c.saldo).toBe(calcularSaldo(c, efectos));
    }
  });

  it("los movimientos con cuentas que no están en la lista no rompen el cálculo", () => {
    expect(
      conSaldos([cuenta("n", "banco", 1n)], [transferencia("archivada", "n", 2n)])[0]!.saldo,
    ).toBe(3n);
  });
});
