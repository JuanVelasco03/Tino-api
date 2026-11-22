import { describe, expect, it } from "vitest";
import { UNA, activo, op, precio } from "../inversion/fixtures.test-utils.js";
import { cierresAGuardar, fechasFaltantes, rangoHistorico } from "./historico.js";

const voo = activo("VOO", "2026-01-01T00:00:00Z", {
  cotizacion: "automatica",
  clase: "etf",
  simboloFuente: "VOO",
});
const compra = op("VOO", "compra", 2n * UNA, 100_000n, "2026-08-10");

describe("fechasFaltantes", () => {
  it("un activo manual no pide histórico", () => {
    const manual = activo("VOO");
    expect(fechasFaltantes(manual, ["2026-09-30"], [compra], [])).toEqual([]);
  });

  it("sin cantidad en F no falta", () => {
    expect(fechasFaltantes(voo, ["2026-07-31", "2026-08-31"], [compra], [])).toEqual([
      "2026-08-31",
    ]);
    const venta = op("VOO", "venta", 2n * UNA, 110_000n, "2026-09-05");
    expect(fechasFaltantes(voo, ["2026-08-31", "2026-09-30"], [compra, venta], [])).toEqual([
      "2026-08-31",
    ]);
  });

  it("ventana de 7 días: un precio en [F − 7, F] cubre F", () => {
    const fechas = ["2026-08-31", "2026-09-30", "2026-10-31"];
    const precios = [
      // Viernes antes de un cierre de mes en domingo: cubre.
      precio("VOO", 56_000n, "2026-08-24", undefined, "cierre"),
      // 8 días antes: no cubre.
      precio("VOO", 56_000n, "2026-09-22", undefined, "cierre"),
      // Posterior a F: no cubre.
      precio("VOO", 56_000n, "2026-11-01", undefined, "cierre"),
    ];
    expect(fechasFaltantes(voo, fechas, [compra], precios)).toEqual(["2026-09-30", "2026-10-31"]);
  });

  it("cuenta cualquier origen y solo los precios del activo", () => {
    const precios = [
      precio("VOO", 50_000n, "2026-08-30"),
      precio("AAPL", 20_000n, "2026-09-30", undefined, "cierre"),
    ];
    expect(fechasFaltantes(voo, ["2026-08-31", "2026-09-30"], [compra], precios)).toEqual([
      "2026-09-30",
    ]);
  });
});

describe("rangoHistorico", () => {
  it("un solo rango por activo, de min(F) − 7 a max(F)", () => {
    expect(rangoHistorico(["2026-10-31", "2026-08-31", "2026-09-30"])).toEqual({
      desde: "2026-08-24",
      hasta: "2026-10-31",
    });
  });

  it("sin faltantes, null", () => {
    expect(rangoHistorico([])).toBeNull();
  });
});

describe("cierresAGuardar", () => {
  const cotizadoEn = new Date("2026-11-01T00:00:00Z");
  const serie = [
    { fecha: "2026-08-27", precio: 55_000n, cotizadoEn },
    { fecha: "2026-08-28", precio: 55_500n, cotizadoEn },
    { fecha: "2026-09-29", precio: 57_000n, cotizadoEn },
    { fecha: "2026-09-30", precio: 57_100n, cotizadoEn },
    { fecha: "2026-10-01", precio: 57_200n, cotizadoEn },
  ];

  it("el último cierre ≤ F de cada F, con su propia fecha", () => {
    expect(cierresAGuardar("activo-VOO", ["2026-08-31", "2026-09-30"], serie)).toEqual([
      {
        activoId: "activo-VOO",
        precio: 55_500n,
        fecha: "2026-08-28",
        origen: "cierre",
        cotizadoEn,
      },
      {
        activoId: "activo-VOO",
        precio: 57_100n,
        fecha: "2026-09-30",
        origen: "cierre",
        cotizadoEn,
      },
    ]);
  });

  it("dos F con el mismo cierre lo guardan una vez; sin cierre ≤ F, nada", () => {
    expect(
      cierresAGuardar("activo-VOO", ["2026-08-29", "2026-08-30", "2026-08-01"], serie),
    ).toEqual([
      {
        activoId: "activo-VOO",
        precio: 55_500n,
        fecha: "2026-08-28",
        origen: "cierre",
        cotizadoEn,
      },
    ]);
  });
});
