import { describe, expect, it } from "vitest";
import { calcularSaldo, type CuentaParaSaldo, type MovimientoParaSaldo } from "./calcular.js";

const ahorros: CuentaParaSaldo = {
  id: "cta-ahorros",
  tipo: "banco",
  saldoInicial: 1_000_000n,
};

const visa: CuentaParaSaldo = {
  id: "cta-visa",
  tipo: "tarjeta_credito",
  saldoInicial: 0n, // deuda inicial
};

describe("calcularSaldo — cuenta de ahorros (RN-01)", () => {
  it("sin movimientos, el saldo es el inicial", () => {
    expect(calcularSaldo(ahorros, [])).toBe(1_000_000n);
  });

  it("suma ingresos y resta gastos y transferencias de salida", () => {
    const movimientos: MovimientoParaSaldo[] = [
      {
        tipo: "ingreso",
        monto: 3_500_000n,
        cuentaDestinoId: "cta-ahorros",
        categoriaId: "cat-salario",
      },
      { tipo: "gasto", monto: 250_000n, cuentaOrigenId: "cta-ahorros", categoriaId: "cat-mercado" },
      {
        tipo: "transferencia",
        monto: 500_000n,
        cuentaOrigenId: "cta-ahorros",
        cuentaDestinoId: "cta-efectivo",
      },
      {
        tipo: "transferencia",
        monto: 200_000n,
        cuentaOrigenId: "cta-efectivo",
        cuentaDestinoId: "cta-ahorros",
      },
    ];
    // 1.000.000 + 3.500.000 - 250.000 - 500.000 + 200.000
    expect(calcularSaldo(ahorros, movimientos)).toBe(3_950_000n);
  });

  it("ignora movimientos que no tocan la cuenta", () => {
    const movimientos: MovimientoParaSaldo[] = [
      {
        tipo: "gasto",
        monto: 90_000n,
        cuentaOrigenId: "cta-efectivo",
        categoriaId: "cat-transporte",
      },
      { tipo: "ingreso", monto: 60_000n, cuentaDestinoId: "cta-nequi", categoriaId: "cat-otros" },
    ];
    expect(calcularSaldo(ahorros, movimientos)).toBe(1_000_000n);
  });

  it("se recalcula siempre desde los movimientos: nada guardado", () => {
    const movimientos: MovimientoParaSaldo[] = [
      { tipo: "gasto", monto: 100_000n, cuentaOrigenId: "cta-ahorros", categoriaId: "cat-mercado" },
    ];
    expect(calcularSaldo(ahorros, movimientos)).toBe(900_000n);
    // Al editar el movimiento, el saldo sigue la edición sin tocar la cuenta.
    const editados: MovimientoParaSaldo[] = [{ ...movimientos[0], monto: 40_000n }];
    expect(calcularSaldo(ahorros, editados)).toBe(960_000n);
    // Y al eliminarlo, vuelve al inicial.
    expect(calcularSaldo(ahorros, [])).toBe(1_000_000n);
  });

  it("no pierde precisión con importes grandes (sin coma flotante)", () => {
    const cuenta: CuentaParaSaldo = {
      id: "cta-grande",
      tipo: "banco",
      saldoInicial: 9_007_199_254_740_993n,
    };
    const movimientos: MovimientoParaSaldo[] = [
      { tipo: "ingreso", monto: 1n, cuentaDestinoId: "cta-grande", categoriaId: "cat-otros" },
    ];
    expect(calcularSaldo(cuenta, movimientos)).toBe(9_007_199_254_740_994n);
  });
});

describe("calcularSaldo — tarjeta de crédito (RN-02, RN-07)", () => {
  it("los consumos aumentan la deuda y los pagos la reducen", () => {
    const movimientos: MovimientoParaSaldo[] = [
      { tipo: "gasto", monto: 400_000n, cuentaOrigenId: "cta-visa", categoriaId: "cat-mercado" },
      {
        tipo: "gasto",
        monto: 150_000n,
        cuentaOrigenId: "cta-visa",
        categoriaId: "cat-restaurantes",
      },
      {
        tipo: "transferencia",
        monto: 300_000n,
        cuentaOrigenId: "cta-ahorros",
        cuentaDestinoId: "cta-visa",
      },
    ];
    // 0 + 400.000 + 150.000 - 300.000
    expect(calcularSaldo(visa, movimientos)).toBe(250_000n);
  });

  it("parte de la deuda inicial", () => {
    const conDeuda: CuentaParaSaldo = { ...visa, saldoInicial: 800_000n };
    const movimientos: MovimientoParaSaldo[] = [
      { tipo: "gasto", monto: 400_000n, cuentaOrigenId: "cta-visa", categoriaId: "cat-mercado" },
      {
        tipo: "gasto",
        monto: 150_000n,
        cuentaOrigenId: "cta-visa",
        categoriaId: "cat-restaurantes",
      },
      {
        tipo: "transferencia",
        monto: 300_000n,
        cuentaOrigenId: "cta-ahorros",
        cuentaDestinoId: "cta-visa",
      },
    ];
    // 800.000 + 400.000 + 150.000 - 300.000
    expect(calcularSaldo(conDeuda, movimientos)).toBe(1_050_000n);
  });

  it("pagar el total deja la deuda en cero", () => {
    const movimientos: MovimientoParaSaldo[] = [
      { tipo: "gasto", monto: 620_000n, cuentaOrigenId: "cta-visa", categoriaId: "cat-mercado" },
      {
        tipo: "transferencia",
        monto: 620_000n,
        cuentaOrigenId: "cta-ahorros",
        cuentaDestinoId: "cta-visa",
      },
    ];
    expect(calcularSaldo(visa, movimientos)).toBe(0n);
  });

  it("el mismo pago reduce el ahorro y la deuda por igual", () => {
    const pago: MovimientoParaSaldo = {
      tipo: "transferencia",
      monto: 300_000n,
      cuentaOrigenId: "cta-ahorros",
      cuentaDestinoId: "cta-visa",
    };
    expect(calcularSaldo(ahorros, [pago])).toBe(700_000n); // 1.000.000 - 300.000
    expect(calcularSaldo({ ...visa, saldoInicial: 300_000n }, [pago])).toBe(0n);
  });
});
