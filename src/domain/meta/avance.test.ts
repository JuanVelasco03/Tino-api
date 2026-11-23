import { describe, expect, it } from "vitest";
import {
  acumuladoA,
  acumuladosAlCierre,
  cumplimientoApartado,
  cumplimientoPorSaldo,
  debeGuardarCumplimiento,
  falta,
  porcentaje,
  resolverAporte,
  saldoEn,
  totales,
  usoDeCumplida,
  type EfectoConFecha,
} from "./avance.js";
import { FONDO, MOTO, VIAJE, aporte, retiro } from "./fixtures.test-utils.js";

describe("monto de un aporte", () => {
  const guardado = {
    id: "a",
    metaId: "m",
    tipo: "aporte" as const,
    motivo: null,
    inicial: false,
    movimientoId: null,
    creadoEn: new Date(),
  };

  it("el propio sin transferencia", () => {
    const a = resolverAporte({ ...guardado, monto: 100n, fecha: "2026-11-01" }, null);
    expect(a).toMatchObject({ monto: 100n, fecha: "2026-11-01", cuentaOrigen: null });
  });

  it("el de su transferencia, que es la única fuente", () => {
    const a = resolverAporte(
      { ...guardado, movimientoId: "mov", monto: null, fecha: null },
      { monto: 150n, fecha: "2026-10-15", cuentaOrigen: { id: "b", nombre: "Bancolombia" } },
    );
    expect(a).toMatchObject({
      monto: 150n,
      fecha: "2026-10-15",
      cuentaOrigen: { id: "b", nombre: "Bancolombia" },
    });
  });

  it("sin monto ni transferencia es un dato roto", () => {
    expect(() => resolverAporte({ ...guardado, monto: null, fecha: null }, null)).toThrow();
  });
});

describe("acumulado", () => {
  it("aportes − retiros a una fecha y vigente", () => {
    const aportes = FONDO.aportes();
    expect(acumuladoA(aportes)).toBe(1_900_000n);
    expect(acumuladoA(aportes, "2026-10-31")).toBe(1_550_000n);
    expect(acumuladoA(aportes, "2026-05-31")).toBe(0n);
  });

  it("al cierre de cada día con filas", () => {
    expect(acumuladosAlCierre([aporte(100n, "2026-01-02"), retiro(40n, "2026-01-02")])).toEqual([
      { fecha: "2026-01-02", acumulado: 60n },
    ]);
  });
});

describe("cumplimiento", () => {
  it("apartado: el primer día en que el acumulado al cierre llega al objetivo", () => {
    expect(cumplimientoApartado(MOTO.aportes(), MOTO.objetivo)).toEqual({
      fecha: "2026-09-12",
      avance: 850_000n,
    });
    expect(cumplimientoApartado(FONDO.aportes(), FONDO.objetivo)).toBeNull();
  });

  it("apartado: corregir un aporte puede volverla activa", () => {
    const [a, b, c, , r] = MOTO.aportes();
    expect(cumplimientoApartado([a!, b!, c!, r!], MOTO.objetivo)).toBeNull();
  });

  it("toda la cuenta: el primer día desde la creación en que el saldo llega", () => {
    const cuenta = { id: "c", tipo: "banco" as const, saldoInicial: 500n };
    const efectos: EfectoConFecha[] = [
      {
        monto: 300n,
        montoDestino: null,
        cuentaOrigenId: null,
        cuentaDestinoId: "c",
        fecha: "2026-01-05",
      },
      {
        monto: 200n,
        montoDestino: null,
        cuentaOrigenId: null,
        cuentaDestinoId: "c",
        fecha: "2026-02-10",
      },
      {
        monto: 900n,
        montoDestino: null,
        cuentaOrigenId: "c",
        cuentaDestinoId: null,
        fecha: "2026-03-01",
      },
      {
        monto: 999n,
        montoDestino: null,
        cuentaOrigenId: null,
        cuentaDestinoId: "otra",
        fecha: "2026-02-01",
      },
    ];
    expect(saldoEn(cuenta, efectos, "2026-02-10")).toBe(1000n);
    expect(cumplimientoPorSaldo(cuenta, efectos, "2026-01-01", "2026-06-01", 1000n)).toEqual({
      fecha: "2026-02-10",
      avance: 1000n,
    });
    // Ya cumplía el día de la creación.
    expect(cumplimientoPorSaldo(cuenta, efectos, "2026-02-15", "2026-06-01", 1000n)).toEqual({
      fecha: "2026-02-15",
      avance: 1000n,
    });
    // Un movimiento futuro no la cumple.
    expect(cumplimientoPorSaldo(cuenta, efectos, "2026-01-01", "2026-02-01", 1000n)).toBeNull();
  });

  it("inversión: se guarda una vez, sin archivar y al llegar", () => {
    const meta = { cumplidaEn: null, archivadaEn: null, objetivo: 100n };
    expect(debeGuardarCumplimiento(meta, 100n)).toBe(true);
    expect(debeGuardarCumplimiento(meta, 99n)).toBe(false);
    expect(debeGuardarCumplimiento(meta, null)).toBe(false);
    expect(debeGuardarCumplimiento({ ...meta, cumplidaEn: "2026-01-01" }, 200n)).toBe(false);
    expect(debeGuardarCumplimiento({ ...meta, archivadaEn: new Date() }, 200n)).toBe(false);
  });
});

describe("uso de una cumplida", () => {
  it("el primer retiro con fecha ≥ el cumplimiento", () => {
    expect(usoDeCumplida(MOTO.aportes(), "2026-09-12")).toEqual({
      fecha: "2026-09-14",
      motivo: "en el taller",
    });
    expect(usoDeCumplida(VIAJE.aportes(), "2026-11-10")).toBeNull();
  });
});

describe("falta, porcentaje y totales", () => {
  it("falta nunca es negativa", () => {
    expect(falta(1_800_000n, 600_000n)).toBe(1_200_000n);
    expect(falta(100n, 150n)).toBe(0n);
  });

  it("porcentaje en centésimas truncado, con avance negativo como 0", () => {
    expect(porcentaje(1_900_000n, 7_500_000n)).toBe(2533);
    expect(porcentaje(150n, 100n)).toBe(15000);
    expect(porcentaje(-5n, 100n)).toBe(0);
  });

  it("totales de las activas; un avance nulo deja incompleto", () => {
    expect(
      totales([
        { avance: 600_000n, objetivo: 1_800_000n },
        { avance: 1_900_000n, objetivo: 7_500_000n },
      ]),
    ).toEqual({ avance: 2_500_000n, objetivo: 9_300_000n, incompleto: false });
    expect(totales([{ avance: null, objetivo: 10n }])).toEqual({
      avance: 0n,
      objetivo: 10n,
      incompleto: true,
    });
  });
});
