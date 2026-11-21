import { describe, expect, it } from "vitest";
import { comprometidoDelMes, ingresosEsperados } from "./comprometido.js";
import {
  CIERRES_DISENO,
  DISENO,
  HOY,
  MES,
  confirmada,
  omitida,
  plantilla,
} from "./fixtures.test-utils.js";

describe("comprometidoDelMes, con el ejemplo del diseño", () => {
  const c = comprometidoDelMes(DISENO, CIERRES_DISENO, HOY, MES);

  it("pagado: 5 pagos por 1.396.220", () => {
    expect(c.pagado).toEqual({ monto: 1_396_220n, cantidad: 5 });
  });

  it("por confirmar: 4 por 191.150 (el variable con su estimado)", () => {
    expect(c.porConfirmar).toEqual({ monto: 191_150n, cantidad: 4 });
  });

  it("programado: 2 por 30.800", () => {
    expect(c.programado).toEqual({ monto: 30_800n, cantidad: 2 });
  });

  it("total 1.618.170", () => {
    expect(c.total).toBe(1_618_170n);
    expect(c.total.toString()).toBe("1618170");
  });
});

describe("comprometidoDelMes", () => {
  it("las omitidas y los ingresos no suman; las transferencias sí", () => {
    const recurrentes = [
      plantilla("omitido", {
        monto: 5_000n,
        primerVencimiento: "2026-11-20",
        generarDesde: "2026-11-20",
      }),
      plantilla("ingreso", {
        tipo: "ingreso",
        monto: 9_000n,
        cuentaOrigenId: null,
        cuentaDestinoId: "banco",
        primerVencimiento: "2026-11-20",
        generarDesde: "2026-11-20",
      }),
      plantilla("transferencia", {
        tipo: "transferencia",
        monto: 7_000n,
        cuentaDestinoId: "ahorro",
        primerVencimiento: "2026-11-20",
        generarDesde: "2026-11-20",
      }),
    ];
    const c = comprometidoDelMes(recurrentes, [omitida("omitido", "2026-11-20")], HOY, MES);
    expect(c.total).toBe(7_000n);
    expect(c.programado).toEqual({ monto: 7_000n, cantidad: 1 });
    expect(c.pagado.cantidad + c.porConfirmar.cantidad).toBe(0);
  });

  it("cada ocurrencia del mes cuenta (semanal)", () => {
    const semanal = plantilla("semanal", {
      monto: 10_000n,
      periodicidad: "semanal",
      primerVencimiento: "2026-11-03",
      generarDesde: "2026-11-03",
    });
    const c = comprometidoDelMes(
      [semanal],
      [confirmada("semanal", "2026-11-03", 10_000n)],
      HOY,
      MES,
    );
    // 3 pagada, 10 vencida, 17 por confirmar, 24 programada.
    expect(c.pagado).toEqual({ monto: 10_000n, cantidad: 1 });
    expect(c.porConfirmar).toEqual({ monto: 20_000n, cantidad: 2 });
    expect(c.programado).toEqual({ monto: 10_000n, cantidad: 1 });
    expect(c.total).toBe(40_000n);
  });

  it("sin plantillas, todo en cero", () => {
    expect(comprometidoDelMes([], [], HOY, MES)).toEqual({
      total: 0n,
      pagado: { monto: 0n, cantidad: 0 },
      porConfirmar: { monto: 0n, cantidad: 0 },
      programado: { monto: 0n, cantidad: 0 },
    });
  });
});

describe("ingresosEsperados", () => {
  it("el salario del diseño va en los esperados, programado el 30", () => {
    expect(ingresosEsperados(DISENO, CIERRES_DISENO, HOY, MES)).toEqual([
      {
        recurrenteId: "salario",
        vencimiento: "2026-11-30",
        estado: "programada",
        monto: 4_200_000n,
        estimado: false,
        movimientoId: null,
      },
    ]);
  });

  it("un ingreso confirmado u omitido ya no se espera; uno por línea", () => {
    const quincena = plantilla("quincena", {
      tipo: "ingreso",
      monto: 2_000_000n,
      cuentaOrigenId: null,
      cuentaDestinoId: "banco",
      periodicidad: "quincenal",
      primerVencimiento: "2026-11-15",
      generarDesde: "2026-11-15",
    });
    const extra = plantilla("extra", {
      tipo: "ingreso",
      monto: 300_000n,
      cuentaOrigenId: null,
      cuentaDestinoId: "banco",
      primerVencimiento: "2026-11-15",
      generarDesde: "2026-11-15",
    });
    const esperados = ingresosEsperados(
      [quincena, extra],
      [confirmada("quincena", "2026-11-15", 2_000_000n)],
      HOY,
      MES,
    );
    expect(esperados.map((o) => [o.recurrenteId, o.vencimiento])).toEqual([
      ["extra", "2026-11-15"],
      ["quincena", "2026-11-30"],
    ]);
  });
});
