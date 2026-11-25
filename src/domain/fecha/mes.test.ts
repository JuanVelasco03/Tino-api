import { describe, expect, it } from "vitest";
import {
  diasDe,
  fechaCierreDelMes,
  diasEntre,
  esFechaValida,
  esMesValido,
  mesAnterior,
  mesesAnteriores,
  mesLocal,
  rangoDelMes,
  restarDias,
  sumarDias,
  sumarMeses,
  mesesEntre,
  ultimoDia,
} from "./mes.js";

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

describe("mesAnterior", () => {
  it("enero pasa a diciembre del año anterior", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });

  it("dentro del año resta un mes", () => {
    expect(mesAnterior("2026-11")).toBe("2026-10");
  });

  it("lanza con un mes inválido", () => {
    expect(() => mesAnterior("2026-13")).toThrow();
  });
});

describe("ultimoDia", () => {
  it("febrero de 2026 termina el 28 y el bisiesto el 29", () => {
    expect(ultimoDia("2026-02")).toBe("2026-02-28");
    expect(ultimoDia("2028-02")).toBe("2028-02-29");
  });
});

describe("fechaCierreDelMes", () => {
  it("un mes cerrado cierra en su último día", () => {
    expect(fechaCierreDelMes("2026-10", "2026-11-24")).toBe("2026-10-31");
  });

  it("el mes actual cierra hoy", () => {
    expect(fechaCierreDelMes("2026-11", "2026-11-24")).toBe("2026-11-24");
    expect(fechaCierreDelMes("2026-11", "2026-11-30")).toBe("2026-11-30");
  });
});

describe("mesesAnteriores", () => {
  it("los 11 meses anteriores a 2026-11 van de 2025-12 a 2026-10", () => {
    const meses = mesesAnteriores("2026-11", 11);
    expect(meses).toHaveLength(11);
    expect(meses[0]).toBe("2025-12");
    expect(meses.at(-1)).toBe("2026-10");
    expect(meses).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("con cero devuelve una lista vacía", () => {
    expect(mesesAnteriores("2026-11", 0)).toEqual([]);
  });
});

describe("sumarDias", () => {
  it("cruza meses y años", () => {
    expect(sumarDias("2026-11-28", 7)).toBe("2026-12-05");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("sumarMeses y mesesEntre", () => {
  it("suma y resta meses cruzando años", () => {
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
    expect(sumarMeses("2027-01", -1)).toBe("2026-12");
    expect(sumarMeses("2026-11", 12)).toBe("2027-11");
  });

  it("cuenta los meses entre dos meses", () => {
    expect(mesesEntre("2026-11", "2027-02")).toBe(3);
    expect(mesesEntre("2027-02", "2026-11")).toBe(-3);
  });
});

describe("diasEntre y diasDe", () => {
  it("cuenta días cruzando febrero", () => {
    expect(diasEntre("2027-02-27", "2027-03-01")).toBe(2);
    expect(diasEntre("2027-03-01", "2027-02-27")).toBe(-2);
  });

  it("días de febrero, normal y bisiesto", () => {
    expect(diasDe("2027-02")).toBe(28);
    expect(diasDe("2028-02")).toBe(29);
  });
});
