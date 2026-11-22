import { describe, expect, it } from "vitest";
import type { Trm } from "./trm.js";
import { cubre, resolverTrm } from "./vigente.js";

const finDeSemana: Trm = { valorCent: 346192n, vigenteDesde: "2026-11-21", vigenteHasta: "2026-11-23" };
const vieja: Trm = { valorCent: 341510n, vigenteDesde: "2026-11-18", vigenteHasta: "2026-11-18" };

describe("cubre", () => {
  it.each([
    ["2026-11-20", false],
    ["2026-11-21", true],
    ["2026-11-22", true],
    ["2026-11-23", true],
    ["2026-11-24", false],
  ])("%s → %s", (fecha, esperado) => {
    expect(cubre(finDeSemana, fecha)).toBe(esperado);
  });

  it("una vigencia de un día cubre solo ese día", () => {
    expect(cubre(vieja, "2026-11-18")).toBe(true);
    expect(cubre(vieja, "2026-11-19")).toBe(false);
  });
});

describe("resolverTrm", () => {
  const fecha = "2026-11-22";

  it("la guardada que cubre la fecha gana, al día, aunque haya obtenida", () => {
    expect(resolverTrm(finDeSemana, vieja, fecha)).toEqual({ trm: finDeSemana, desactualizada: false });
  });

  it("si la guardada no cubre, usa la obtenida, al día", () => {
    expect(resolverTrm(vieja, finDeSemana, fecha)).toEqual({ trm: finDeSemana, desactualizada: false });
  });

  it("sin obtenida, la guardada que no cubre sale desactualizada", () => {
    expect(resolverTrm(vieja, null, fecha)).toEqual({ trm: vieja, desactualizada: true });
  });

  it("sin ninguna, trm null y no desactualizada", () => {
    expect(resolverTrm(null, null, fecha)).toEqual({ trm: null, desactualizada: false });
  });

  it("sin guardada, usa la obtenida", () => {
    expect(resolverTrm(null, finDeSemana, fecha)).toEqual({ trm: finDeSemana, desactualizada: false });
  });
});
