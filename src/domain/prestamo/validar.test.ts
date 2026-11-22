import { describe, expect, it } from "vitest";
import {
  validarAbono,
  validarAlta,
  validarCambio,
  validarCambioMovimiento,
  validarCapitalTrasCambio,
  validarCondonacion,
  validarDesembolso,
  validarSinCuentaDePrestamo,
  type AltaEntrada,
} from "./validar.js";

const alta: AltaEntrada = {
  tipo: "prestamo_otorgado",
  nombre: "Camila",
  monto: 600000n,
  fecha: "2026-09-12",
  tasaMensual: "1",
  fechaAcordada: "2026-10-15",
};

describe("validarAlta", () => {
  it("acepta un alta válida", () => {
    expect(validarAlta(alta)).toBeNull();
    expect(validarAlta({ ...alta, fechaAcordada: null, tasaMensual: "0" })).toBeNull();
    expect(validarAlta({ ...alta, fechaAcordada: alta.fecha })).toBeNull();
  });

  it.each([
    [{ tipo: "banco" }, "TIPO_INVALIDO", "tipo"],
    [{ nombre: "   " }, "NOMBRE_REQUERIDO", "nombre"],
    [{ nombre: "x".repeat(61) }, "NOMBRE_LARGO", "nombre"],
    [{ monto: 0n }, "MONTO_REQUERIDO", "monto"],
    [{ fecha: "2026-02-30" }, "FECHA_INVALIDA", "fecha"],
    [{ tasaMensual: "1.234" }, "TASA_INVALIDA", "tasaMensual"],
    [{ tasaMensual: "100.01" }, "TASA_INVALIDA", "tasaMensual"],
    [{ fechaAcordada: "2026-13-01" }, "FECHA_INVALIDA", "fechaAcordada"],
    [{ fechaAcordada: "2026-09-11" }, "FECHA_ACORDADA_ANTERIOR", "fechaAcordada"],
  ] as const)("%o → %s", (cambio, codigo, campo) => {
    expect(validarAlta({ ...alta, ...cambio })).toEqual({ codigo, campo });
  });

  it("un nombre de 60 caracteres tras recortar es válido", () => {
    expect(validarAlta({ ...alta, nombre: ` ${"x".repeat(60)} ` })).toBeNull();
  });
});

describe("validarDesembolso", () => {
  it("monto > 0 y fecha válida", () => {
    expect(validarDesembolso({ monto: 1n, fecha: "2026-11-11" })).toBeNull();
    expect(validarDesembolso({ monto: 0n, fecha: "2026-11-11" })).toEqual({
      codigo: "MONTO_REQUERIDO",
      campo: "monto",
    });
    expect(validarDesembolso({ monto: 1n, fecha: "x" })).toEqual({
      codigo: "FECHA_INVALIDA",
      campo: "fecha",
    });
  });
});

describe("validarAbono", () => {
  const estado = { capitalPendiente: 500000n, primeraFecha: "2026-08-14" };
  const abono = { capital: 100000n, interes: 12000n, fecha: "2026-10-02" };

  it("acepta un abono válido, también solo de interés o solo de capital", () => {
    expect(validarAbono(abono, estado)).toBeNull();
    expect(validarAbono({ ...abono, capital: 0n }, estado)).toBeNull();
    expect(validarAbono({ ...abono, interes: 0n, capital: 500000n }, estado)).toBeNull();
    expect(validarAbono({ ...abono, fecha: "2026-08-14" }, estado)).toBeNull();
  });

  it.each([
    [{ capital: 0n, interes: 0n }, "ABONO_VACIO", "capital"],
    [{ capital: 500001n }, "ABONO_EXCEDE_CAPITAL", "capital"],
    [{ fecha: "2026-08-13" }, "FECHA_ANTERIOR_AL_PRESTAMO", "fecha"],
    [{ fecha: "2026-02-30" }, "FECHA_INVALIDA", "fecha"],
  ] as const)("%o → %s", (cambio, codigo, campo) => {
    expect(validarAbono({ ...abono, ...cambio }, estado)).toEqual({ codigo, campo });
  });

  it("PRESTAMO_SALDADO si el capital es 0", () => {
    expect(validarAbono(abono, { ...estado, capitalPendiente: 0n })).toEqual({
      codigo: "PRESTAMO_SALDADO",
    });
  });
});

describe("validarCondonacion", () => {
  it("acepta hasta el capital pendiente", () => {
    expect(validarCondonacion("prestamo_otorgado", 500000n, 500000n)).toBeNull();
  });

  it("cada código", () => {
    expect(validarCondonacion("deuda_contraida", 500000n, 1n)).toEqual({
      codigo: "CONDONACION_NO_PERMITIDA",
    });
    expect(validarCondonacion("prestamo_otorgado", 0n, 1n)).toEqual({ codigo: "PRESTAMO_SALDADO" });
    expect(validarCondonacion("prestamo_otorgado", 500000n, 0n)).toEqual({
      codigo: "MONTO_REQUERIDO",
      campo: "monto",
    });
    expect(validarCondonacion("prestamo_otorgado", 500000n, 500001n)).toEqual({
      codigo: "CONDONACION_EXCEDE_CAPITAL",
      campo: "monto",
    });
  });
});

describe("validarCambio", () => {
  it("acepta nombre, fecha o null", () => {
    expect(validarCambio({ nombre: "Camila Ortiz" })).toBeNull();
    expect(validarCambio({ fechaAcordada: null })).toBeNull();
    expect(validarCambio({ fechaAcordada: "2027-01-01" })).toBeNull();
  });

  it("cada código", () => {
    expect(validarCambio({})).toEqual({ codigo: "SIN_CAMBIOS" });
    expect(validarCambio({ nombre: "" })).toEqual({ codigo: "NOMBRE_REQUERIDO", campo: "nombre" });
    expect(validarCambio({ nombre: "x".repeat(61) })).toEqual({
      codigo: "NOMBRE_LARGO",
      campo: "nombre",
    });
    expect(validarCambio({ fechaAcordada: "2026-02-30" })).toEqual({
      codigo: "FECHA_INVALIDA",
      campo: "fechaAcordada",
    });
  });
});

describe("movimientos y préstamos", () => {
  const prestamos = new Set(["camila", "mama"]);
  const esPrestamo = (id: string) => prestamos.has(id);
  const abono = {
    tipo: "transferencia" as const,
    cuentaOrigenId: "camila",
    cuentaDestinoId: "nequi",
  };

  describe("validarSinCuentaDePrestamo", () => {
    it("CUENTA_DE_PRESTAMO con el campo de la cuenta", () => {
      expect(
        validarSinCuentaDePrestamo(
          { cuentaOrigenId: "nequi", cuentaDestinoId: "camila" },
          esPrestamo,
        ),
      ).toEqual({ codigo: "CUENTA_DE_PRESTAMO", campo: "cuentaDestinoId" });
      expect(
        validarSinCuentaDePrestamo({ cuentaOrigenId: "mama", cuentaDestinoId: null }, esPrestamo),
      ).toEqual({ codigo: "CUENTA_DE_PRESTAMO", campo: "cuentaOrigenId" });
      expect(
        validarSinCuentaDePrestamo({ cuentaOrigenId: "nequi", cuentaDestinoId: null }, esPrestamo),
      ).toBeNull();
    });
  });

  describe("validarCambioMovimiento", () => {
    const contexto = { esPrestamo, esInteres: false };

    it("puede cambiar la cuenta propia", () => {
      expect(
        validarCambioMovimiento(abono, { ...abono, cuentaDestinoId: "bancolombia" }, contexto),
      ).toBeNull();
    });

    it("no cambia de tipo", () => {
      expect(
        validarCambioMovimiento(
          abono,
          { tipo: "gasto", cuentaOrigenId: "camila", cuentaDestinoId: null },
          contexto,
        ),
      ).toEqual({ codigo: "MOVIMIENTO_DE_PRESTAMO", campo: "tipo" });
    });

    it("no saca el préstamo de su campo", () => {
      expect(
        validarCambioMovimiento(abono, { ...abono, cuentaOrigenId: "bancolombia" }, contexto),
      ).toEqual({ codigo: "MOVIMIENTO_DE_PRESTAMO", campo: "tipo" });
      expect(
        validarCambioMovimiento(
          abono,
          { ...abono, cuentaOrigenId: "nequi", cuentaDestinoId: "camila" },
          contexto,
        ),
      ).toEqual({ codigo: "MOVIMIENTO_DE_PRESTAMO", campo: "tipo" });
      expect(
        validarCambioMovimiento(abono, { ...abono, cuentaOrigenId: "mama" }, contexto),
      ).toEqual({ codigo: "MOVIMIENTO_DE_PRESTAMO", campo: "tipo" });
    });

    it("la cuenta propia no pasa a otra de préstamo", () => {
      expect(
        validarCambioMovimiento(abono, { ...abono, cuentaDestinoId: "mama" }, contexto),
      ).toEqual({ codigo: "CUENTA_DE_PRESTAMO", campo: "cuentaDestinoId" });
    });

    it("un interés de préstamo no cambia de tipo", () => {
      const interes = { tipo: "ingreso" as const, cuentaOrigenId: null, cuentaDestinoId: "nequi" };
      expect(
        validarCambioMovimiento(
          interes,
          { tipo: "gasto", cuentaOrigenId: "nequi", cuentaDestinoId: null },
          { esPrestamo, esInteres: true },
        ),
      ).toEqual({ codigo: "MOVIMIENTO_DE_PRESTAMO", campo: "tipo" });
      expect(
        validarCambioMovimiento(
          interes,
          { ...interes, cuentaDestinoId: "bancolombia" },
          { esPrestamo, esInteres: true },
        ),
      ).toBeNull();
    });

    it("un movimiento ordinario no pasa a tocar un préstamo; sí cambia de tipo", () => {
      const gasto = { tipo: "gasto" as const, cuentaOrigenId: "nequi", cuentaDestinoId: null };
      expect(
        validarCambioMovimiento(
          gasto,
          { tipo: "transferencia", cuentaOrigenId: "nequi", cuentaDestinoId: "camila" },
          contexto,
        ),
      ).toEqual({ codigo: "CUENTA_DE_PRESTAMO", campo: "cuentaDestinoId" });
      expect(
        validarCambioMovimiento(
          gasto,
          { tipo: "ingreso", cuentaOrigenId: null, cuentaDestinoId: "nequi" },
          contexto,
        ),
      ).toBeNull();
    });
  });

  describe("validarCapitalTrasCambio", () => {
    const camila = { id: "camila", tipo: "prestamo_otorgado" as const };
    const movimientos = [
      {
        id: "d",
        monto: 600000n,
        montoDestino: null,
        cuentaOrigenId: "nequi",
        cuentaDestinoId: "camila",
      },
      {
        id: "a",
        monto: 100000n,
        montoDestino: null,
        cuentaOrigenId: "camila",
        cuentaDestinoId: "nequi",
      },
    ];

    it("CAPITAL_NEGATIVO al borrar el desembolso con abonos vivos", () => {
      expect(validarCapitalTrasCambio([camila], movimientos, "d", null)).toEqual({
        codigo: "CAPITAL_NEGATIVO",
      });
    });

    it("CAPITAL_NEGATIVO si el abono editado supera el capital", () => {
      expect(
        validarCapitalTrasCambio([camila], movimientos, "a", {
          ...movimientos[1]!,
          monto: 600001n,
        }),
      ).toEqual({ codigo: "CAPITAL_NEGATIVO" });
    });

    it("acepta bajar el abono o borrarlo", () => {
      expect(
        validarCapitalTrasCambio([camila], movimientos, "a", { ...movimientos[1]!, monto: 80000n }),
      ).toBeNull();
      expect(validarCapitalTrasCambio([camila], movimientos, "a", null)).toBeNull();
      expect(
        validarCapitalTrasCambio([camila], movimientos, "a", {
          ...movimientos[1]!,
          monto: 600000n,
        }),
      ).toBeNull();
    });

    it("en una contraída también", () => {
      const mama = { id: "mama", tipo: "deuda_contraida" as const };
      const movs = [
        {
          id: "d",
          monto: 900000n,
          montoDestino: null,
          cuentaOrigenId: "mama",
          cuentaDestinoId: "banco",
        },
        {
          id: "a",
          monto: 200000n,
          montoDestino: null,
          cuentaOrigenId: "banco",
          cuentaDestinoId: "mama",
        },
      ];
      expect(validarCapitalTrasCambio([mama], movs, "d", null)).toEqual({
        codigo: "CAPITAL_NEGATIVO",
      });
      expect(validarCapitalTrasCambio([mama], movs, "a", null)).toBeNull();
    });
  });
});
