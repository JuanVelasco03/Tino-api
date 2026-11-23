import { describe, expect, it } from "vitest";
import { aporte, retiro } from "./fixtures.test-utils.js";
import { admiteCuenta } from "./meta.js";
import {
  formatearFechaMeta,
  parsearFechaMeta,
  validarAcumulado,
  validarAlta,
  validarAporte,
  validarArchivar,
  validarCambioDeModo,
  validarCuenta,
  validarCuentaOrigen,
  validarEditable,
  validarEdicion,
  validarFechaMeta,
  validarOrigenFijo,
  validarRestaurar,
  validarSaldoLibre,
  type MetaParaAporte,
} from "./validar.js";

const HOY = "2026-11-11";

const alta = {
  nombre: "Fondo de emergencia",
  modo: "apartado",
  objetivo: 7_500_000n,
  fechaMeta: null,
  conAporteInicial: false,
};

describe("fecha meta", () => {
  it("un mes se guarda como su último día y vuelve como mes", () => {
    expect(parsearFechaMeta("2027-12")).toEqual({ fecha: "2027-12-31", esMes: true });
    expect(parsearFechaMeta("2027-02")).toEqual({ fecha: "2027-02-28", esMes: true });
    expect(parsearFechaMeta("2026-12-15")).toEqual({ fecha: "2026-12-15", esMes: false });
    expect(formatearFechaMeta("2027-12-31", true)).toBe("2027-12");
    expect(formatearFechaMeta("2026-12-15", false)).toBe("2026-12-15");
    expect(formatearFechaMeta(null, false)).toBeNull();
  });

  it("rechaza formatos inválidos", () => {
    expect(parsearFechaMeta("2027-13")).toBeNull();
    expect(parsearFechaMeta("2026-02-30")).toBeNull();
    expect(parsearFechaMeta("dic 2027")).toBeNull();
    expect(validarFechaMeta("2027-1", HOY)).toEqual({
      codigo: "FECHA_INVALIDA",
      campo: "fechaMeta",
    });
  });

  it("un día no anterior a hoy y un mes no anterior al actual", () => {
    expect(validarFechaMeta("2026-11-10", HOY)?.codigo).toBe("FECHA_META_PASADA");
    expect(validarFechaMeta("2026-11-11", HOY)).toBeNull();
    expect(validarFechaMeta("2026-10", HOY)?.codigo).toBe("FECHA_META_PASADA");
    expect(validarFechaMeta("2026-11", HOY)).toBeNull();
  });
});

describe("alta", () => {
  it("acepta una meta válida", () => {
    expect(validarAlta(alta, HOY)).toBeNull();
    expect(validarAlta({ ...alta, fechaMeta: "2027-12", conAporteInicial: true }, HOY)).toBeNull();
  });

  it("valida nombre, objetivo, modo y fecha en ese orden", () => {
    expect(validarAlta({ ...alta, nombre: "   " }, HOY)).toEqual({
      codigo: "NOMBRE_INVALIDO",
      campo: "nombre",
    });
    expect(validarAlta({ ...alta, nombre: "x".repeat(61) }, HOY)?.codigo).toBe("NOMBRE_INVALIDO");
    expect(validarAlta({ ...alta, objetivo: 0n }, HOY)).toEqual({
      codigo: "MONTO_INVALIDO",
      campo: "objetivo",
    });
    expect(validarAlta({ ...alta, modo: "todo" }, HOY)?.codigo).toBe("MODO_INVALIDO");
    expect(validarAlta({ ...alta, fechaMeta: "2026-11-10" }, HOY)?.codigo).toBe(
      "FECHA_META_PASADA",
    );
  });

  it("el apartado inicial solo va en modo apartado", () => {
    expect(validarAlta({ ...alta, modo: "cuenta", conAporteInicial: true }, HOY)).toEqual({
      codigo: "APORTE_INICIAL_NO_ADMITIDO",
      campo: "aporteInicial",
    });
  });
});

describe("cuenta", () => {
  it("apartado admite efectivo y banco; toda la cuenta, además inversión", () => {
    expect(admiteCuenta("apartado", "banco")).toBe(true);
    expect(admiteCuenta("apartado", "inversion")).toBe(false);
    expect(admiteCuenta("cuenta", "inversion")).toBe(true);
    expect(admiteCuenta("cuenta", "tarjeta_credito")).toBe(false);
    expect(admiteCuenta("cuenta", "prestamo_otorgado")).toBe(false);
  });

  it("inexistente, no admitida o archivada", () => {
    expect(validarCuenta("apartado", null)?.codigo).toBe("CUENTA_INVALIDA");
    expect(validarCuenta("apartado", { tipo: "tarjeta_credito", archivadaEn: null })).toEqual({
      codigo: "CUENTA_NO_ADMITIDA",
      campo: "cuentaId",
    });
    expect(validarCuenta("apartado", { tipo: "banco", archivadaEn: new Date() })?.codigo).toBe(
      "CUENTA_ARCHIVADA",
    );
    expect(validarCuenta("cuenta", { tipo: "inversion", archivadaEn: null })).toBeNull();
  });

  it("origen: COP, distinta de la de la meta, no préstamo", () => {
    const banco = { id: "b", tipo: "banco", moneda: "COP" as const };
    expect(validarCuentaOrigen(banco, "nubank")).toBeNull();
    expect(validarCuentaOrigen(banco, "b")?.codigo).toBe("CUENTA_INVALIDA");
    expect(validarCuentaOrigen(null, "nubank")?.codigo).toBe("CUENTA_INVALIDA");
    expect(
      validarCuentaOrigen({ id: "e", tipo: "inversion", moneda: "USD" }, "nubank")?.codigo,
    ).toBe("CUENTA_INVALIDA");
    expect(
      validarCuentaOrigen({ id: "p", tipo: "prestamo_otorgado", moneda: "COP" }, "nubank"),
    ).toEqual({ codigo: "CUENTA_INVALIDA", campo: "cuentaOrigenId" });
    expect(validarCuentaOrigen({ id: "i", tipo: "inversion", moneda: "COP" }, "nubank")).toBeNull();
  });
});

describe("aporte o retiro", () => {
  const meta: MetaParaAporte = {
    modo: "apartado",
    tipoCuenta: "banco",
    archivada: false,
    cumplida: false,
    creadaEl: "2026-09-20",
  };
  const entrada = {
    tipo: "aporte",
    monto: 150_000n,
    fecha: "2026-11-10",
    motivo: null,
    cuentaOrigenId: null,
  };

  it("acepta un aporte y un retiro válidos", () => {
    expect(validarAporte(entrada, meta, HOY)).toBeNull();
    expect(validarAporte({ ...entrada, tipo: "retiro", motivo: "nevera" }, meta, HOY)).toBeNull();
  });

  it("meta archivada, monto, fecha y motivo", () => {
    expect(validarAporte(entrada, { ...meta, archivada: true }, HOY)?.codigo).toBe(
      "META_ARCHIVADA",
    );
    expect(validarAporte({ ...entrada, monto: 0n }, meta, HOY)?.codigo).toBe("MONTO_INVALIDO");
    expect(validarAporte({ ...entrada, fecha: "2026-09-19" }, meta, HOY)).toEqual({
      codigo: "FECHA_ANTERIOR_A_META",
      campo: "fecha",
    });
    expect(validarAporte({ ...entrada, fecha: "2026-11-12" }, meta, HOY)?.codigo).toBe(
      "FECHA_FUTURA",
    );
    expect(validarAporte({ ...entrada, motivo: "x".repeat(81) }, meta, HOY)?.codigo).toBe(
      "MOTIVO_INVALIDO",
    );
    expect(validarAporte({ ...entrada, motivo: " " }, meta, HOY)?.codigo).toBe("MOTIVO_INVALIDO");
  });

  it("un retiro no lleva origen", () => {
    expect(validarAporte({ ...entrada, tipo: "retiro", cuentaOrigenId: "b" }, meta, HOY)).toEqual({
      codigo: "ORIGEN_NO_ADMITIDO",
      campo: "cuentaOrigenId",
    });
  });

  it("una cumplida admite retiros, no aportes", () => {
    const cumplida = { ...meta, cumplida: true };
    expect(validarAporte(entrada, cumplida, HOY)?.codigo).toBe("META_CUMPLIDA");
    expect(validarAporte({ ...entrada, tipo: "retiro" }, cumplida, HOY)).toBeNull();
  });

  it("modo cuenta: sin retiros, con origen y nunca en una inversión", () => {
    const cuenta = { ...meta, modo: "cuenta" as const };
    expect(validarAporte({ ...entrada, tipo: "retiro" }, cuenta, HOY)?.codigo).toBe(
      "RETIRO_NO_ADMITIDO",
    );
    expect(validarAporte(entrada, cuenta, HOY)?.codigo).toBe("ORIGEN_REQUERIDO");
    expect(validarAporte({ ...entrada, cuentaOrigenId: "b" }, cuenta, HOY)).toBeNull();
    expect(
      validarAporte(
        { ...entrada, cuentaOrigenId: "b" },
        { ...cuenta, tipoCuenta: "inversion" },
        HOY,
      )?.codigo,
    ).toBe("META_DE_INVERSION");
  });

  it("el origen no se agrega ni se quita al editar", () => {
    expect(validarOrigenFijo(true, "b")).toBeNull();
    expect(validarOrigenFijo(false, null)).toBeNull();
    expect(validarOrigenFijo(true, null)?.codigo).toBe("ORIGEN_FIJO");
    expect(validarOrigenFijo(false, "b")?.codigo).toBe("ORIGEN_FIJO");
  });

  it("saldo libre", () => {
    expect(validarSaldoLibre(600_000n, 600_000n)).toBeNull();
    expect(validarSaldoLibre(600_001n, 600_000n)).toEqual({
      codigo: "SALDO_LIBRE_INSUFICIENTE",
      campo: "monto",
    });
  });

  it("ningún día el acumulado al cierre queda negativo", () => {
    const base = [aporte(300_000n, "2026-10-01"), retiro(300_000n, "2026-10-05")];
    expect(validarAcumulado(base)).toBeNull();
    expect(validarAcumulado([...base, retiro(1n, "2026-10-05")])?.codigo).toBe(
      "APARTADO_INSUFICIENTE",
    );
    // Sin el aporte que lo pagó, el retiro posterior deja el acumulado negativo.
    expect(validarAcumulado([base[1]!])?.codigo).toBe("APARTADO_INSUFICIENTE");
    // El mismo día se mira al cierre, sin importar el orden de creación.
    expect(validarAcumulado([retiro(100n, "2026-10-01"), aporte(100n, "2026-10-01")])).toBeNull();
  });
});

describe("edición, archivo y restauración", () => {
  it("una archivada o cumplida no se edita", () => {
    expect(validarEditable({ archivada: true, cumplida: true })?.codigo).toBe("META_ARCHIVADA");
    expect(validarEditable({ archivada: false, cumplida: true })?.codigo).toBe("META_CUMPLIDA");
    expect(validarEditable({ archivada: false, cumplida: false })).toBeNull();
  });

  it("valida cada campo enviado", () => {
    expect(validarEdicion({}, HOY)).toBeNull();
    expect(validarEdicion({ fechaMeta: null }, HOY)).toBeNull();
    expect(validarEdicion({ nombre: "" }, HOY)?.codigo).toBe("NOMBRE_INVALIDO");
    expect(validarEdicion({ objetivo: 0n }, HOY)?.codigo).toBe("MONTO_INVALIDO");
    expect(validarEdicion({ modo: "x" }, HOY)?.codigo).toBe("MODO_INVALIDO");
    expect(validarEdicion({ fechaMeta: "2026-01" }, HOY)?.codigo).toBe("FECHA_META_PASADA");
  });

  it("una meta con aportes no cambia de modo", () => {
    expect(validarCambioDeModo("apartado", "cuenta", 1)).toEqual({
      codigo: "META_CON_APORTES",
      campo: "modo",
    });
    expect(validarCambioDeModo("apartado", "cuenta", 0)).toBeNull();
    expect(validarCambioDeModo("apartado", "apartado", 3)).toBeNull();
  });

  it("solo se archiva una cumplida, con apartado 0", () => {
    const base = { archivada: false, cumplida: true, modo: "apartado" as const, apartado: 0n };
    expect(validarArchivar(base)).toBeNull();
    expect(validarArchivar({ ...base, cumplida: false })?.codigo).toBe("META_NO_CUMPLIDA");
    expect(validarArchivar({ ...base, apartado: 1n })?.codigo).toBe("APARTADO_NO_CERO");
    expect(validarArchivar({ ...base, modo: "cuenta", apartado: 1n })).toBeNull();
    expect(validarArchivar({ ...base, archivada: true })?.codigo).toBe("META_ARCHIVADA");
  });

  it("solo se restaura una archivada", () => {
    expect(validarRestaurar(true)).toBeNull();
    expect(validarRestaurar(false)?.codigo).toBe("META_NO_ARCHIVADA");
  });
});
