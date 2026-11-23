import { describe, expect, it } from "vitest";
import { FONDO, VIAJE } from "./fixtures.test-utils.js";
import { fechasDeCierre, historialAportes, historialValor } from "./historial.js";

describe("historial de aportes", () => {
  it("la más reciente primero, con el acumulado tras cada una", () => {
    const filas = historialAportes(FONDO.aportes());
    expect(filas.map((f) => [f.fecha, f.tipo, f.monto, f.acumulado])).toEqual([
      ["2026-11-10", "aporte", 350_000n, 1_900_000n],
      ["2026-10-31", "retiro", 100_000n, 1_550_000n],
      ["2026-10-15", "aporte", 250_000n, 1_650_000n],
      ["2026-09-15", "aporte", 350_000n, 1_400_000n],
      ["2026-08-15", "aporte", 300_000n, 1_050_000n],
      ["2026-07-15", "aporte", 350_000n, 750_000n],
      ["2026-06-15", "aporte", 400_000n, 400_000n],
    ]);
    expect(filas[1]!.motivo).toBe("arreglo de la nevera");
  });

  it("conserva el apartado inicial y la cuenta de origen", () => {
    const filas = historialAportes(VIAJE.aportes());
    expect(filas.at(-1)).toMatchObject({ inicial: true, cuentaOrigen: null, acumulado: 300_000n });
    expect(filas[0]).toMatchObject({
      movimientoId: "mov-2",
      cuentaOrigen: { nombre: "Bancolombia" },
      acumulado: 600_000n,
    });
  });
});

describe("historial de valor", () => {
  it("creada un fin de mes: un cierre por mes y la fila de hoy", () => {
    expect(fechasDeCierre("2026-07-31", "2026-11-11")).toEqual([
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
    ]);
  });

  it("creada a mitad de mes: la primera fila es la creación", () => {
    expect(fechasDeCierre("2026-09-20", "2026-11-11")).toEqual([
      "2026-09-20",
      "2026-09-30",
      "2026-10-31",
    ]);
  });

  it("creada hoy o este mes", () => {
    expect(fechasDeCierre("2026-11-11", "2026-11-11")).toEqual([]);
    expect(fechasDeCierre("2026-11-03", "2026-11-11")).toEqual(["2026-11-03"]);
  });

  it("variación frente a la fila anterior; la primera, sin variación", () => {
    const valores: Record<string, bigint> = {
      "2026-07-31": 28_410_200n,
      "2026-08-31": 29_006_400n,
      "2026-09-30": 30_288_900n,
      "2026-10-31": 31_517_120n,
      "2026-11-11": 31_930_000n,
    };
    const filas = historialValor("2026-07-31", "2026-11-11", (f) => valores[f] ?? null);
    expect(filas.map((f) => [f.tipo, f.fecha, f.valor, f.variacion])).toEqual([
      ["cierre", "2026-07-31", 28_410_200n, null],
      ["cierre", "2026-08-31", 29_006_400n, 596_200n],
      ["cierre", "2026-09-30", 30_288_900n, 1_282_500n],
      ["cierre", "2026-10-31", 31_517_120n, 1_228_220n],
      ["hoy", "2026-11-11", 31_930_000n, 412_880n],
    ]);
  });

  it("un valor nulo (sin TRM) deja nula su variación y la siguiente", () => {
    const filas = historialValor("2026-10-31", "2026-11-11", (f) =>
      f === "2026-10-31" ? null : 5n,
    );
    expect(filas.map((f) => f.variacion)).toEqual([null, null]);
  });
});
