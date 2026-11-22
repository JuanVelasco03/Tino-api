import { describe, expect, it } from "vitest";
import type { Activo } from "../inversion/inversion.js";
import { debeConsultar, loteAConsultar, precioVencido } from "./vencimiento.js";

const AHORA = new Date("2026-11-22T15:00:00Z");
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);

type Consultable = Pick<Activo, "cotizacion" | "clase" | "consultadoEn"> & { id: string };

const auto = (clase: Activo["clase"], consultadoEn: Date | null, id = "a"): Consultable => ({
  id,
  cotizacion: "automatica",
  clase,
  consultadoEn,
});

describe("debeConsultar", () => {
  it("un activo manual nunca se consulta", () => {
    expect(debeConsultar({ cotizacion: "manual", clase: "etf", consultadoEn: null }, AHORA)).toBe(
      false,
    );
    expect(
      debeConsultar({ cotizacion: "manual", clase: null, consultadoEn: hace(999) }, AHORA),
    ).toBe(false);
  });

  it("un automático sin consulta previa, siempre", () => {
    expect(debeConsultar(auto("accion", null), AHORA)).toBe(true);
  });

  it("acción y ETF: borde de 60 min", () => {
    for (const clase of ["accion", "etf"] as const) {
      expect(debeConsultar(auto(clase, hace(59)), AHORA)).toBe(false);
      expect(debeConsultar(auto(clase, hace(60)), AHORA)).toBe(true);
    }
  });

  it("cripto: borde de 15 min", () => {
    expect(debeConsultar(auto("cripto", hace(14)), AHORA)).toBe(false);
    expect(debeConsultar(auto("cripto", hace(15)), AHORA)).toBe(true);
  });
});

describe("loteAConsultar", () => {
  it("toma los 8 vencidos más antiguos, los nulos primero, y omite los vigentes y manuales", () => {
    const activos: Consultable[] = [
      ...Array.from({ length: 9 }, (_, i) => auto("etf", hace(61 + i), `viejo-${i}`)),
      auto("etf", null, "nunca"),
      auto("etf", hace(10), "fresco"),
      { id: "manual", cotizacion: "manual", clase: null, consultadoEn: null },
    ];
    const lote = loteAConsultar(activos, AHORA).map((a) => a.id);
    expect(lote).toEqual([
      "nunca",
      "viejo-8",
      "viejo-7",
      "viejo-6",
      "viejo-5",
      "viejo-4",
      "viejo-3",
      "viejo-2",
    ]);
  });

  it("sin vencidos, vacío", () => {
    expect(loteAConsultar([auto("cripto", hace(1))], AHORA)).toEqual([]);
  });
});

describe("precioVencido", () => {
  const consultado = { cotizacion: "automatica" as const, consultadoEn: AHORA };

  it("un activo manual nunca está vencido", () => {
    expect(precioVencido({ cotizacion: "manual", consultadoEn: null }, null)).toBe(false);
  });

  it("automático sin consulta todavía: no vencido", () => {
    const vigente = { origen: "manual" as const, cotizadoEn: hace(5) };
    expect(precioVencido({ cotizacion: "automatica", consultadoEn: null }, vigente)).toBe(false);
  });

  it("consultado y el vigente es el primer precio manual: vencido", () => {
    expect(precioVencido(consultado, { origen: "manual", cotizadoEn: hace(1) })).toBe(true);
    expect(precioVencido(consultado, null)).toBe(true);
  });

  it("intradía traído en la consulta: no vencido; anterior en más de 15 min: vencido", () => {
    expect(precioVencido(consultado, { origen: "intradia", cotizadoEn: hace(1) })).toBe(false);
    expect(precioVencido(consultado, { origen: "intradia", cotizadoEn: hace(15) })).toBe(false);
    expect(precioVencido(consultado, { origen: "intradia", cotizadoEn: hace(16) })).toBe(true);
  });

  it("cierre de un viernes consultado el lunes: no vencido; con más de 7 días: vencido", () => {
    expect(precioVencido(consultado, { origen: "cierre", cotizadoEn: hace(3 * 24 * 60) })).toBe(
      false,
    );
    expect(precioVencido(consultado, { origen: "cierre", cotizadoEn: hace(7 * 24 * 60 + 1) })).toBe(
      true,
    );
  });
});
