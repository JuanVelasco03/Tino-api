import { describe, expect, it } from "vitest";
import { vencimientos } from "./calendario.js";
import type { Calendario, Periodicidad } from "./recurrente.js";

function calendario(
  periodicidad: Periodicidad,
  primerVencimiento: string,
  extra: Partial<Calendario> = {},
): Calendario {
  return {
    periodicidad,
    primerVencimiento,
    ultimoDia: false,
    generarDesde: primerVencimiento,
    pausadaDesde: null,
    ...extra,
  };
}

describe("vencimientos", () => {
  it("mensual con ancla 2027-01-31 cae el último día en meses cortos y vuelve al 31", () => {
    expect(vencimientos(calendario("mensual", "2027-01-31"), "2027-01-01", "2027-05-31")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
  });

  it("con ultimoDia desde abril cae el 30", () => {
    expect(
      vencimientos(
        calendario("mensual", "2027-04-10", { ultimoDia: true }),
        "2027-04-01",
        "2027-06-30",
      ),
    ).toEqual(["2027-04-30", "2027-05-31", "2027-06-30"]);
  });

  it("quincenal en febrero de 2027 cae el 15 y el 28", () => {
    expect(vencimientos(calendario("quincenal", "2027-01-15"), "2027-02-01", "2027-02-28")).toEqual(
      ["2027-02-15", "2027-02-28"],
    );
  });

  it("quincenal empieza en primerVencimiento", () => {
    expect(vencimientos(calendario("quincenal", "2027-01-20"), "2027-01-01", "2027-02-15")).toEqual(
      ["2027-01-31", "2027-02-15"],
    );
  });

  it("anual desde 2028-02-29 cae el 28 de febrero en un año no bisiesto", () => {
    expect(vencimientos(calendario("anual", "2028-02-29"), "2028-01-01", "2032-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("semanal suma 7 días, también desde una fecha posterior al ancla", () => {
    expect(vencimientos(calendario("semanal", "2026-11-03"), "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
    expect(vencimientos(calendario("semanal", "2026-11-03"), "2026-11-11", "2026-11-25")).toEqual([
      "2026-11-17",
      "2026-11-24",
    ]);
  });

  it("bimestral y trimestral saltan meses desde el ancla", () => {
    expect(vencimientos(calendario("bimestral", "2026-09-18"), "2026-09-01", "2027-01-31")).toEqual(
      ["2026-09-18", "2026-11-18", "2027-01-18"],
    );
    expect(
      vencimientos(calendario("trimestral", "2026-11-05"), "2026-12-01", "2027-08-31"),
    ).toEqual(["2027-02-05", "2027-05-05", "2027-08-05"]);
  });

  it("respeta generarDesde", () => {
    expect(
      vencimientos(
        calendario("mensual", "2026-08-10", { generarDesde: "2026-10-01" }),
        "2026-01-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
  });

  it("respeta pausadaDesde: no hay vencimientos desde esa fecha", () => {
    expect(
      vencimientos(
        calendario("mensual", "2026-08-10", { pausadaDesde: "2026-10-10" }),
        "2026-01-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-08-10", "2026-09-10"]);
  });

  it("nada antes del primer vencimiento ni con el rango vacío", () => {
    expect(vencimientos(calendario("mensual", "2027-01-15"), "2026-11-01", "2026-12-31")).toEqual(
      [],
    );
  });
});
