import { describe, expect, it } from "vitest";
import { esFechaValida, esMesValido, mesLocal, rangoDelMes, restarDias } from "./mes.js";

describe("rangoDelMes", () => {
  it("febrero de 2026 va del 1 al 28", () => {
    expect(rangoDelMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("febrero bisiesto llega al 29", () => {
    expect(rangoDelMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("noviembre llega al 30 y diciembre al 31", () => {
    expect(rangoDelMes("2026-11").hasta).toBe("2026-11-30");
    expect(rangoDelMes("2026-12").hasta).toBe("2026-12-31");
  });

  it("lanza con un mes inválido", () => {
    expect(() => rangoDelMes("2026-13")).toThrow();
  });
});

describe("mesLocal", () => {
  it("2026-12-01T03:00Z en America/Bogota todavía es noviembre", () => {
    expect(mesLocal(new Date("2026-12-01T03:00:00Z"), "America/Bogota")).toBe("2026-11");
  });

  it("2026-12-01T05:00Z en America/Bogota ya es diciembre", () => {
    expect(mesLocal(new Date("2026-12-01T05:00:00Z"), "America/Bogota")).toBe("2026-12");
  });
});

describe("esMesValido", () => {
  it.each(["2026-01", "2026-12"])("%s es válido", (mes) => {
    expect(esMesValido(mes)).toBe(true);
  });

  it.each(["2026-13", "2026-00", "2026-1", "26-11", "2026-11-01", ""])("%s no es válido", (mes) => {
    expect(esMesValido(mes)).toBe(false);
  });
});

describe("esFechaValida", () => {
  it("acepta fechas reales", () => {
    expect(esFechaValida("2026-11-19")).toBe(true);
    expect(esFechaValida("2028-02-29")).toBe(true);
  });

  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "2026-11-1", "19/11/2026"])(
    "rechaza %s",
    (fecha) => {
      expect(esFechaValida(fecha)).toBe(false);
    },
  );
});

describe("restarDias", () => {
  it("cruza meses y años", () => {
    expect(restarDias("2026-11-19", 90)).toBe("2026-08-21");
    expect(restarDias("2026-01-05", 10)).toBe("2025-12-26");
  });

  it("con cero devuelve la misma fecha", () => {
    expect(restarDias("2026-11-19", 0)).toBe("2026-11-19");
  });
});
