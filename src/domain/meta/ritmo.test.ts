import { describe, expect, it } from "vitest";
import { acumuladoA, falta } from "./avance.js";
import { FONDO, VIAJE } from "./fixtures.test-utils.js";
import { calcularRitmo, inicioDeVentana } from "./ritmo.js";

const sinAvance = () => 0n;

describe("ritmo", () => {
  it("fecha de día: el viaje faltan 1.200.000 en 34 días", () => {
    const avance = acumuladoA(VIAJE.aportes());
    expect(
      calcularRitmo({
        fechaMeta: VIAJE.fechaMeta,
        fechaMetaEsMes: false,
        falta: falta(VIAJE.objetivo, avance),
        hoy: VIAJE.hoy,
        creadaEl: VIAJE.creadaEl,
        avanceEn: sinAvance,
      }),
    ).toEqual({ tipo: "dias", falta: 1_200_000n, dias: 34, vencida: false });
  });

  it("fecha de día vencida: 0 días", () => {
    expect(
      calcularRitmo({
        fechaMeta: "2026-11-01",
        fechaMetaEsMes: false,
        falta: 5n,
        hoy: "2026-11-11",
        creadaEl: "2026-10-01",
        avanceEn: sinAvance,
      }),
    ).toEqual({ tipo: "dias", falta: 5n, dias: 0, vencida: true });
  });

  it("fecha de mes: la cuota inicial, 13.070.000 en 13 meses → 1.005.385", () => {
    expect(
      calcularRitmo({
        fechaMeta: "2027-12-31",
        fechaMetaEsMes: true,
        falta: 13_070_000n,
        hoy: "2026-11-11",
        creadaEl: "2026-07-31",
        avanceEn: sinAvance,
      }),
    ).toEqual({
      tipo: "meses",
      falta: 13_070_000n,
      meses: 13,
      cuotaMensual: 1_005_385n,
      vencida: false,
    });
  });

  it("fecha de mes en el mes actual: la cuota es todo lo que falta", () => {
    expect(
      calcularRitmo({
        fechaMeta: "2026-11-30",
        fechaMetaEsMes: true,
        falta: 700n,
        hoy: "2026-11-11",
        creadaEl: "2026-10-01",
        avanceEn: sinAvance,
      }),
    ).toMatchObject({ meses: 0, cuotaMensual: 700n, vencida: false });
  });

  it("sin fecha: el fondo, 316.667 al mes y llegada en mayo de 2028", () => {
    const aportes = FONDO.aportes();
    expect(
      calcularRitmo({
        fechaMeta: null,
        fechaMetaEsMes: false,
        falta: falta(FONDO.objetivo, acumuladoA(aportes)),
        hoy: FONDO.hoy,
        creadaEl: FONDO.creadaEl,
        avanceEn: (f) => acumuladoA(aportes, f),
      }),
    ).toEqual({ tipo: "promedio", promedioMensual: 316_667n, mesEstimado: "2028-05" });
  });

  it("sin fecha y sin avance neto: sin proyección", () => {
    expect(
      calcularRitmo({
        fechaMeta: null,
        fechaMetaEsMes: false,
        falta: 100n,
        hoy: "2026-11-11",
        creadaEl: "2026-11-01",
        avanceEn: sinAvance,
      }),
    ).toEqual({ tipo: "promedio", promedioMensual: null, mesEstimado: null });
  });

  it("la ventana: seis meses o los que lleva la meta", () => {
    expect(inicioDeVentana("2026-11-11", "2026-06-15")).toEqual({ meses: 6, base: "2026-05-31" });
    expect(inicioDeVentana("2026-11-11", "2025-01-01")).toEqual({ meses: 6, base: "2026-05-31" });
    expect(inicioDeVentana("2026-11-11", "2026-10-20")).toEqual({ meses: 2, base: "2026-09-30" });
    expect(inicioDeVentana("2026-11-11", "2026-11-05")).toEqual({ meses: 1, base: "2026-10-31" });
  });

  it("antes de la creación el avance es 0, aunque la cuenta tuviera saldo", () => {
    expect(
      calcularRitmo({
        fechaMeta: null,
        fechaMetaEsMes: false,
        falta: 1000n,
        hoy: "2026-11-11",
        creadaEl: "2026-10-20",
        // Modo cuenta: la cuenta ya tenía 900 antes de crear la meta.
        avanceEn: (f) => (f < "2026-10-20" ? 900n : 1100n),
      }),
    ).toEqual({ tipo: "promedio", promedioMensual: 550n, mesEstimado: "2027-01" });
  });
});
