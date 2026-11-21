import { describe, expect, it } from "vitest";
import { HOY, confirmada, omitida, plantilla } from "./fixtures.test-utils.js";
import { ocurrenciaEn } from "./ocurrencias.js";
import type { Periodicidad, RecurrenteEntrada } from "./recurrente.js";
import { cambiaCalendario, validarCierre, validarRecurrente } from "./validar.js";

const base: RecurrenteEntrada = {
  tipo: "gasto",
  concepto: "Internet",
  monto: 89_900n,
  variable: false,
  periodicidad: "mensual",
  primerVencimiento: "2026-11-14",
  ultimoDia: false,
  cuentaOrigenId: "nequi",
  cuentaDestinoId: null,
  categoriaId: null,
};

const con = (extra: Partial<RecurrenteEntrada>): RecurrenteEntrada => ({ ...base, ...extra });

describe("validarRecurrente", () => {
  it("una plantilla válida no tiene error; hoy cuenta como primer vencimiento", () => {
    expect(validarRecurrente(base, HOY)).toBeNull();
    expect(validarRecurrente(con({ primerVencimiento: HOY }), HOY)).toBeNull();
  });

  it.each([
    [con({ concepto: "   " }), "CONCEPTO_REQUERIDO", "concepto"],
    [con({ concepto: "x".repeat(81) }), "CONCEPTO_LARGO", "concepto"],
    [con({ periodicidad: "diaria" as Periodicidad }), "PERIODICIDAD_INVALIDA", "periodicidad"],
    [con({ primerVencimiento: "2026-02-30" }), "FECHA_INVALIDA", "primerVencimiento"],
    [con({ primerVencimiento: "2026-11-10" }), "PRIMER_VENCIMIENTO_PASADO", "primerVencimiento"],
    [con({ periodicidad: "semanal", ultimoDia: true }), "ULTIMO_DIA_NO_PERMITIDO", "ultimoDia"],
    [con({ periodicidad: "quincenal", ultimoDia: true }), "ULTIMO_DIA_NO_PERMITIDO", "ultimoDia"],
    [con({ monto: 0n }), "MONTO_REQUERIDO", "monto"],
    [con({ cuentaOrigenId: null }), "ORIGEN_REQUERIDO", "cuentaOrigenId"],
    [con({ cuentaDestinoId: "otra" }), "DESTINO_NO_PERMITIDO", "cuentaDestinoId"],
    [con({ tipo: "ingreso", cuentaOrigenId: null }), "DESTINO_REQUERIDO", "cuentaDestinoId"],
    [con({ tipo: "ingreso", cuentaDestinoId: "banco" }), "ORIGEN_NO_PERMITIDO", "cuentaOrigenId"],
    [
      con({ tipo: "transferencia", cuentaDestinoId: "nequi" }),
      "CUENTAS_IGUALES",
      "cuentaDestinoId",
    ],
    [
      con({ tipo: "transferencia", cuentaDestinoId: "ahorro", categoriaId: "servicios" }),
      "CATEGORIA_NO_PERMITIDA",
      "categoriaId",
    ],
  ] as const)("%# → %s", (entrada, codigo, campo) => {
    expect(validarRecurrente(entrada, HOY)).toEqual({ codigo, campo });
  });

  it("ultimoDia se admite en mensual, bimestral, trimestral y anual", () => {
    for (const periodicidad of ["mensual", "bimestral", "trimestral", "anual"] as const) {
      expect(validarRecurrente(con({ periodicidad, ultimoDia: true }), HOY)).toBeNull();
    }
  });

  it("al editar sin cambiar el calendario, un primer vencimiento pasado se admite", () => {
    const actual = {
      periodicidad: "mensual",
      primerVencimiento: "2026-10-01",
      ultimoDia: false,
    } as const;
    const edicion = con({ primerVencimiento: "2026-10-01", monto: 95_000n });
    expect(validarRecurrente(edicion, HOY, actual)).toBeNull();
    expect(validarRecurrente(con({ ...edicion, periodicidad: "bimestral" }), HOY, actual)).toEqual({
      codigo: "PRIMER_VENCIMIENTO_PASADO",
      campo: "primerVencimiento",
    });
  });
});

describe("cambiaCalendario", () => {
  const actual = {
    periodicidad: "mensual",
    primerVencimiento: "2026-10-01",
    ultimoDia: false,
  } as const;

  it("detecta cambios de periodicidad, ancla o último día", () => {
    expect(cambiaCalendario(actual, { ...actual })).toBe(false);
    expect(cambiaCalendario(actual, { ...actual, periodicidad: "anual" })).toBe(true);
    expect(cambiaCalendario(actual, { ...actual, primerVencimiento: "2026-10-02" })).toBe(true);
    expect(cambiaCalendario(actual, { ...actual, ultimoDia: true })).toBe(true);
  });
});

describe("validarCierre", () => {
  const r = plantilla("r", { primerVencimiento: "2026-10-12", generarDesde: "2026-10-12" });

  it("vencida y por confirmar se pueden cerrar", () => {
    expect(validarCierre(ocurrenciaEn(r, [], HOY, "2026-10-12"))).toBeNull();
    expect(validarCierre(ocurrenciaEn(r, [], HOY, "2026-11-12"))).toBeNull();
  });

  it("una programada o una fecha fuera del calendario → OCURRENCIA_INVALIDA", () => {
    expect(validarCierre(ocurrenciaEn(r, [], HOY, "2026-12-12"))).toBe("OCURRENCIA_INVALIDA");
    expect(validarCierre(ocurrenciaEn(r, [], HOY, "2026-11-13"))).toBe("OCURRENCIA_INVALIDA");
  });

  it("una pagada u omitida → OCURRENCIA_CERRADA", () => {
    const cierres = [confirmada("r", "2026-10-12", 1n), omitida("r", "2026-11-12")];
    expect(validarCierre(ocurrenciaEn(r, cierres, HOY, "2026-10-12"))).toBe("OCURRENCIA_CERRADA");
    expect(validarCierre(ocurrenciaEn(r, cierres, HOY, "2026-11-12"))).toBe("OCURRENCIA_CERRADA");
  });
});
