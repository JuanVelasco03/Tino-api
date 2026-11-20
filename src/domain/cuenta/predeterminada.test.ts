import { describe, expect, it } from "vitest";
import { resolverCuentaPredeterminada } from "./predeterminada.js";

const nequi = { id: "nequi", tipo: "banco" as const, archivadaEn: null };
const efectivo = { id: "efectivo", tipo: "efectivo" as const, archivadaEn: null };
const tarjeta = { id: "tarjeta", tipo: "tarjeta_credito" as const, archivadaEn: null };
const archivada = { ...efectivo, archivadaEn: new Date("2026-11-19T00:00:00Z") };

describe("resolverCuentaPredeterminada", () => {
  it("devuelve la elegida si está activa", () => {
    expect(resolverCuentaPredeterminada("efectivo", [nequi, efectivo])).toBe("efectivo");
  });

  it("sin elegir, la primera activa del orden", () => {
    expect(resolverCuentaPredeterminada(null, [nequi, efectivo])).toBe("nequi");
  });

  it("los activos van antes que los pasivos", () => {
    expect(resolverCuentaPredeterminada(null, [tarjeta, nequi])).toBe("nequi");
    expect(resolverCuentaPredeterminada(null, [tarjeta])).toBe("tarjeta");
  });

  it("si la elegida está archivada o no existe, vuelve a la primera activa", () => {
    expect(resolverCuentaPredeterminada("efectivo", [nequi, archivada])).toBe("nequi");
    expect(resolverCuentaPredeterminada("otra", [nequi])).toBe("nequi");
  });

  it("sin cuentas activas devuelve null", () => {
    expect(resolverCuentaPredeterminada("efectivo", [archivada])).toBeNull();
    expect(resolverCuentaPredeterminada(null, [])).toBeNull();
  });
});
