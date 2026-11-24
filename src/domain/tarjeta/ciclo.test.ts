import { describe, expect, it } from "vitest";
import { cicloDeTarjeta, fechaDeDia, fechasDelCiclo, pagoLimite, proximoCorte } from "./ciclo.js";
import { simularCompra } from "./compra.js";
import {
  BANCO,
  CLASES,
  EFECTIVO,
  TARJETA,
  consumo,
  movimiento,
  tarjetaDelDisenio,
} from "./fixtures.test-utils.js";
import { tasaEfectivaAnual } from "./tasa.js";
import { clasesDeCargo } from "./tarjeta.js";
import { validarCondiciones } from "./validar.js";

const CONDICIONES = { diaCorte: 15, diaPago: 30 };
const CUENTA = { id: TARJETA.id, saldoInicial: 0n };
const HOY = "2026-11-11";

describe("fechas del ciclo", () => {
  it("datos del diseño: 16 oct – 15 nov, pago 30 nov, 4 y 19 días", () => {
    expect(fechasDelCiclo(CONDICIONES, HOY)).toEqual({
      inicio: "2026-10-16",
      corte: "2026-11-15",
      corteAnterior: "2026-10-15",
      pagoLimite: "2026-11-30",
      diasHastaCorte: 4,
      diasHastaPago: 19,
    });
  });

  it("día 31 en un mes corto es su último día", () => {
    expect(fechaDeDia("2027-02", 31)).toBe("2027-02-28");
    expect(fechaDeDia("2028-02", 30)).toBe("2028-02-29");
    expect(proximoCorte("2027-02-10", 31)).toBe("2027-02-28");
  });

  it("el día del corte pertenece al ciclo que cierra ese día", () => {
    expect(proximoCorte("2026-11-15", 15)).toBe("2026-11-15");
    expect(proximoCorte("2026-11-16", 15)).toBe("2026-12-15");
  });

  it("pago límite: este mes si cae después del corte; si no, el siguiente", () => {
    expect(pagoLimite("2026-11-15", 30)).toBe("2026-11-30");
    expect(pagoLimite("2026-11-25", 10)).toBe("2026-12-10");
    expect(pagoLimite("2026-11-15", 15)).toBe("2026-12-15");
    expect(pagoLimite("2027-01-31", 30)).toBe("2027-02-28");
  });

  it("cruce de año", () => {
    const f = fechasDelCiclo({ diaCorte: 5, diaPago: 20 }, "2026-12-28");
    expect(f.corte).toBe("2027-01-05");
    expect(f.inicio).toBe("2026-12-06");
    expect(f.pagoLimite).toBe("2027-01-20");
  });
});

describe("cicloDeTarjeta (datos del diseño)", () => {
  const ciclo = cicloDeTarjeta(CUENTA, tarjetaDelDisenio(), CONDICIONES, HOY, CLASES);

  it("saldo al corte anterior, abonos y saldo anterior pendiente", () => {
    expect(ciclo.saldoCorteAnterior).toBe(1_217_980n);
    expect(ciclo.abonos.map((m) => m.descripcion)).toEqual(["Pago desde Bancolombia"]);
    expect(ciclo.saldoAnteriorPendiente).toBe(597_980n);
    expect(ciclo.pagoSugerido).toBe(597_980n);
  });

  it("11 consumos, 2 cargos y deuda al corte", () => {
    expect(ciclo.consumos).toHaveLength(11);
    expect(ciclo.totalConsumos).toBe(651_450n);
    expect(ciclo.cargos.map((c) => c.clase)).toEqual(["cuota_manejo", "intereses"]);
    expect(ciclo.totalCargos).toBe(34_870n);
    expect(ciclo.deudaAlCorte).toBe(1_284_300n);
  });

  it("los consumos van en orden cronológico", () => {
    expect(ciclo.consumos[0]?.descripcion).toBe("Rappi · restaurante");
    expect(ciclo.consumos.at(-1)?.descripcion).toBe("Restaurante Wok");
  });
});

describe("cicloDeTarjeta (casos)", () => {
  it("primer ciclo: el saldo inicial es el saldo al corte anterior", () => {
    const c = cicloDeTarjeta({ ...CUENTA, saldoInicial: 500_000n }, [], CONDICIONES, HOY, CLASES);
    expect(c.saldoCorteAnterior).toBe(500_000n);
    expect(c.totalConsumos).toBe(0n);
    expect(c.totalCargos).toBe(0n);
    expect(c.deudaAlCorte).toBe(500_000n);
  });

  it("un gasto del día del corte entra; el del día siguiente, no", () => {
    const movs = [
      consumo("2026-11-15", "Último", 1_000),
      consumo("2026-11-16", "Siguiente", 2_000),
    ];
    const c = cicloDeTarjeta(CUENTA, movs, CONDICIONES, HOY, CLASES);
    expect(c.consumos.map((m) => m.descripcion)).toEqual(["Último"]);
  });

  it("un avance (transferencia que sale) es consumo; una devolución, abono", () => {
    const avance = movimiento({
      tipo: "transferencia",
      monto: 100_000n,
      fecha: "2026-11-02",
      cuentaOrigen: TARJETA,
      cuentaDestino: EFECTIVO,
    });
    const devolucion = movimiento({
      tipo: "ingreso",
      monto: 20_000n,
      fecha: "2026-11-03",
      cuentaDestino: TARJETA,
    });
    const c = cicloDeTarjeta(CUENTA, [avance, devolucion], CONDICIONES, HOY, CLASES);
    expect(c.consumos).toEqual([avance]);
    expect(c.abonos).toEqual([devolucion]);
    expect(c.saldoAnteriorPendiente).toBe(-20_000n);
    expect(c.pagoSugerido).toBe(0n);
  });

  it("un gasto dividido con parte de intereses es consumo", () => {
    const dividido = movimiento({
      tipo: "gasto",
      monto: 10_000n,
      fecha: "2026-11-02",
      cuentaOrigen: TARJETA,
      partes: [],
    });
    const c = cicloDeTarjeta(CUENTA, [dividido], CONDICIONES, HOY, CLASES);
    expect(c.consumos).toHaveLength(1);
    expect(c.cargos).toHaveLength(0);
  });

  it("un pago a otra tarjeta desde el banco no toca esta", () => {
    const ajeno = movimiento({
      tipo: "transferencia",
      monto: 1_000n,
      fecha: "2026-11-02",
      cuentaOrigen: BANCO,
      cuentaDestino: EFECTIVO,
    });
    const c = cicloDeTarjeta(CUENTA, [ajeno], CONDICIONES, HOY, CLASES);
    expect(c.abonos).toHaveLength(0);
    expect(c.consumos).toHaveLength(0);
  });
});

describe("clasesDeCargo", () => {
  it("solo las de gasto con nombre de cargo", () => {
    const clases = clasesDeCargo([
      { id: "a", nombre: "Intereses", tipo: "gasto" },
      { id: "b", nombre: "Intereses", tipo: "ingreso" },
      { id: "c", nombre: "Cuota de manejo", tipo: "gasto" },
      { id: "d", nombre: "Comida", tipo: "gasto" },
    ]);
    expect([...clases]).toEqual([
      ["a", "intereses"],
      ["c", "cuota_manejo"],
    ]);
  });
});

describe("simularCompra", () => {
  const CUPO = 4_000_000n;
  const DEUDA = 1_284_300n;

  it("cabe: disponible tras la compra y uso truncado", () => {
    expect(simularCompra(450_000n, CUPO, DEUDA)).toEqual({
      monto: 450_000n,
      cabe: true,
      disponibleTras: 2_265_700n,
      porcentajeTras: 43,
      falta: null,
    });
  });

  it("no cabe: lo que falta", () => {
    expect(simularCompra(3_000_000n, CUPO, DEUDA)).toEqual({
      monto: 3_000_000n,
      cabe: false,
      disponibleTras: null,
      porcentajeTras: null,
      falta: 284_300n,
    });
  });

  it("justo el disponible cabe y deja el uso en 100", () => {
    const c = simularCompra(2_715_700n, CUPO, DEUDA);
    expect(c.cabe).toBe(true);
    expect(c.disponibleTras).toBe(0n);
    expect(c.porcentajeTras).toBe(100);
  });
});

describe("tasaEfectivaAnual", () => {
  it("1,98 % M.V. → 26,52 % E.A.", () => {
    expect(tasaEfectivaAnual(198)).toBe(2652);
  });
  it("0 → 0; 1 % M.V. → 12,68 % E.A.", () => {
    expect(tasaEfectivaAnual(0)).toBe(0);
    expect(tasaEfectivaAnual(100)).toBe(1268);
  });
});

describe("validarCondiciones", () => {
  it("alta completa es válida", () => {
    expect(validarCondiciones({ diaCorte: 15, diaPago: 30, tasaMensual: 198 }, true)).toBeNull();
  });

  it("día fuera de 1–31 → DIA_INVALIDO con su campo", () => {
    expect(validarCondiciones({ diaCorte: 32, diaPago: 30 }, true)).toEqual({
      codigo: "DIA_INVALIDO",
      campo: "tarjeta.diaCorte",
    });
    expect(validarCondiciones({ diaCorte: 15, diaPago: 0 }, true)).toEqual({
      codigo: "DIA_INVALIDO",
      campo: "tarjeta.diaPago",
    });
    expect(validarCondiciones({ diaCorte: 1.5 }, false)?.codigo).toBe("DIA_INVALIDO");
  });

  it("sin días cuando se requieren → CONDICIONES_REQUERIDAS", () => {
    expect(validarCondiciones({ diaCorte: 15 }, true)).toEqual({
      codigo: "CONDICIONES_REQUERIDAS",
      campo: "tarjeta",
    });
    expect(validarCondiciones({ tasaMensual: 100 }, false)).toBeNull();
  });

  it("tasa fuera de 0–10000 → TASA_INVALIDA; null la borra", () => {
    expect(validarCondiciones({ tasaMensual: 10_001 }, false)).toEqual({
      codigo: "TASA_INVALIDA",
      campo: "tarjeta.tasaMensual",
    });
    expect(validarCondiciones({ tasaMensual: null }, false)).toBeNull();
  });
});
