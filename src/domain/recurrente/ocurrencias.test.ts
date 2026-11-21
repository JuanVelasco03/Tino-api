import { describe, expect, it } from "vitest";
import { HOY, confirmada, omitida, plantilla } from "./fixtures.test-utils.js";
import {
  bandeja,
  compararPlantillas,
  estadoDe,
  ocurrenciaEn,
  ocurrenciasEntre,
  proximoVencimiento,
  ultimoConfirmado,
} from "./ocurrencias.js";

describe("estadoDe", () => {
  it("sin cierre: vencida antes de hoy, por confirmar hasta hoy + 7, programada después", () => {
    expect(estadoDe("2026-11-10", undefined, HOY)).toBe("vencida");
    expect(estadoDe("2026-11-11", undefined, HOY)).toBe("por_confirmar");
    expect(estadoDe("2026-11-18", undefined, HOY)).toBe("por_confirmar");
    expect(estadoDe("2026-11-19", undefined, HOY)).toBe("programada");
  });

  it("con cierre: pagada u omitida, sin importar la fecha", () => {
    expect(estadoDe("2026-11-01", confirmada("x", "2026-11-01", 1n), HOY)).toBe("pagada");
    expect(estadoDe("2026-11-30", omitida("x", "2026-11-30"), HOY)).toBe("omitida");
  });
});

describe("importe mostrado", () => {
  it("una fija muestra el monto de la plantilla; una pagada, el de su movimiento", () => {
    const internet = plantilla("internet", {
      monto: 89_900n,
      primerVencimiento: "2026-11-12",
      generarDesde: "2026-11-12",
    });
    const [nov, dic] = ocurrenciasEntre(
      internet,
      [confirmada("internet", "2026-11-12", 90_500n)],
      HOY,
      "2026-11-01",
      "2026-12-31",
    );
    expect(nov).toMatchObject({ estado: "pagada", monto: 90_500n, estimado: false });
    expect(nov!.movimientoId).toBe("mov-internet-2026-11-12");
    expect(dic).toMatchObject({ estado: "programada", monto: 89_900n, estimado: false });
    expect(dic!.movimientoId).toBeNull();
  });

  it("una variable muestra el último confirmado como estimado", () => {
    const gas = plantilla("gas", { monto: 32_400n, variable: true });
    const cierres = [
      confirmada("gas", "2026-10-01", 31_870n),
      confirmada("gas", "2026-09-01", 99_999n),
    ];
    expect(ultimoConfirmado("gas", cierres)).toEqual({ monto: 31_870n, vencimiento: "2026-10-01" });
    expect(ocurrenciaEn(gas, cierres, HOY, "2026-11-01")).toMatchObject({
      estado: "vencida",
      monto: 31_870n,
      estimado: true,
    });
  });

  it("una variable sin confirmados muestra el monto de la plantilla, estimado", () => {
    const gas = plantilla("gas", { monto: 32_400n, variable: true });
    expect(ultimoConfirmado("gas", [])).toBeNull();
    expect(ocurrenciaEn(gas, [], HOY, "2026-11-01")).toMatchObject({
      monto: 32_400n,
      estimado: true,
    });
  });

  it("una omitida variable no es pagada: sigue estimada", () => {
    const gas = plantilla("gas", { monto: 32_400n, variable: true });
    expect(ocurrenciaEn(gas, [omitida("gas", "2026-11-01")], HOY, "2026-11-01")).toMatchObject({
      estado: "omitida",
      monto: 32_400n,
      estimado: true,
      movimientoId: null,
    });
  });
});

describe("ocurrenciasEntre", () => {
  it("los cierres se quedan aunque el calendario ya no genere esa fecha", () => {
    // Reanudada el 11: generar_desde pasa a hoy; lo pagado el 5 sigue visible.
    const r = plantilla("r", {
      primerVencimiento: "2026-10-05",
      generarDesde: "2026-11-11",
    });
    const lista = ocurrenciasEntre(
      r,
      [confirmada("r", "2026-11-05", 1000n)],
      HOY,
      "2026-11-01",
      "2026-11-30",
    );
    expect(lista.map((o) => [o.vencimiento, o.estado])).toEqual([["2026-11-05", "pagada"]]);
  });

  it("una fecha fuera del calendario no es ocurrencia", () => {
    const r = plantilla("r", { primerVencimiento: "2026-11-12", generarDesde: "2026-11-12" });
    expect(ocurrenciaEn(r, [], HOY, "2026-11-13")).toBeNull();
  });
});

describe("bandeja", () => {
  const internet = plantilla("internet", {
    concepto: "Internet",
    primerVencimiento: "2026-11-12",
    generarDesde: "2026-11-12",
  });
  const agua = plantilla("agua", {
    concepto: "Agua",
    primerVencimiento: "2026-11-12",
    generarDesde: "2026-11-12",
  });
  const vieja = plantilla("vieja", {
    concepto: "Zeta",
    primerVencimiento: "2026-09-08",
    generarDesde: "2026-09-08",
  });
  const lejana = plantilla("lejana", {
    primerVencimiento: "2026-11-19",
    generarDesde: "2026-11-19",
  });

  it("trae vencidas de cualquier mes y por confirmar, por vencimiento y concepto", () => {
    const lista = bandeja(
      [internet, agua, vieja, lejana],
      [confirmada("vieja", "2026-10-08", 1000n)],
      HOY,
    );
    expect(lista.map((o) => [o.recurrenteId, o.vencimiento, o.estado])).toEqual([
      ["vieja", "2026-09-08", "vencida"],
      ["vieja", "2026-11-08", "vencida"],
      ["agua", "2026-11-12", "por_confirmar"],
      ["internet", "2026-11-12", "por_confirmar"],
    ]);
  });

  it("vacía si todo está cerrado o fuera de la ventana", () => {
    expect(bandeja([lejana], [], HOY)).toEqual([]);
  });

  it("una pausada conserva lo que vencía hasta hoy", () => {
    const pausada = plantilla("p", {
      periodicidad: "semanal",
      primerVencimiento: "2026-11-04",
      generarDesde: "2026-11-04",
      pausadaDesde: "2026-11-12",
    });
    expect(bandeja([pausada], [], HOY).map((o) => o.vencimiento)).toEqual([
      "2026-11-04",
      "2026-11-11",
    ]);
  });
});

describe("proximoVencimiento", () => {
  it("salta las ocurrencias cerradas", () => {
    const r = plantilla("r", {
      periodicidad: "semanal",
      primerVencimiento: "2026-11-11",
      generarDesde: "2026-11-11",
    });
    expect(proximoVencimiento(r, [], HOY)).toBe("2026-11-11");
    expect(
      proximoVencimiento(r, [confirmada("r", "2026-11-11", 1n), omitida("r", "2026-11-18")], HOY),
    ).toBe("2026-11-25");
  });

  it("null si está pausada y no hay más vencimientos", () => {
    const r = plantilla("r", { pausadaDesde: "2026-11-12" });
    expect(proximoVencimiento(r, [], HOY)).toBeNull();
  });

  it("una anual encuentra su vencimiento del año siguiente", () => {
    const r = plantilla("r", {
      periodicidad: "anual",
      primerVencimiento: "2026-03-01",
      generarDesde: "2026-03-01",
    });
    expect(proximoVencimiento(r, [], HOY)).toBe("2027-03-01");
  });
});

describe("compararPlantillas", () => {
  it("primero las del mes por fecha, luego por próximo vencimiento, null al final, y concepto", () => {
    const claves = [
      { concepto: "Sin nada", primeraDelMes: null, proximo: null },
      { concepto: "Anual", primeraDelMes: null, proximo: "2027-03-01" },
      { concepto: "Netflix", primeraDelMes: "2026-11-30", proximo: "2026-11-30" },
      { concepto: "Arriendo", primeraDelMes: "2026-11-01", proximo: "2026-12-01" },
      { concepto: "Agua", primeraDelMes: "2026-11-01", proximo: "2026-12-01" },
    ];
    expect([...claves].sort(compararPlantillas).map((c) => c.concepto)).toEqual([
      "Agua",
      "Arriendo",
      "Netflix",
      "Anual",
      "Sin nada",
    ]);
  });
});
