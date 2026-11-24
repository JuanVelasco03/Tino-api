import { describe, expect, it } from "vitest";
import { estadoConciliacion } from "./conciliacion.js";
import { calcularAjuste } from "./ajuste.js";
import { historialDeCuenta, type MovimientoConciliable } from "./historial.js";

const EFECTIVO = { id: "efectivo", nombre: "Efectivo" };
const BANCO = { id: "banco", nombre: "Bancolombia" };

let n = 0;
/** Movimiento de Efectivo: monto con signo (+ entra, − sale). */
function mov(
  fecha: string,
  descripcion: string,
  monto: number,
  extra: Partial<MovimientoConciliable> = {},
): MovimientoConciliable {
  n++;
  const entra = monto > 0;
  const transferencia = descripcion === "Retiro cajero";
  return {
    id: `m${String(n).padStart(2, "0")}`,
    tipo: transferencia ? "transferencia" : entra ? "ingreso" : "gasto",
    monto: BigInt(Math.abs(monto)),
    moneda: "COP",
    montoDestino: null,
    tasa: "1",
    fecha,
    descripcion,
    nota: null,
    cuentaOrigen: transferencia ? BANCO : entra ? null : EFECTIVO,
    cuentaDestino: entra ? EFECTIVO : null,
    categoria: null,
    partes: [],
    creadoEn: new Date(`${fecha}T12:00:00Z`),
    actualizadoEn: new Date(`${fecha}T12:00:00Z`),
    conciliadoOrigen: false,
    conciliadoDestino: false,
    ...extra,
  };
}

/** Datos de Efectivo del diseño: saldo inicial 122.200, octubre conciliado. */
function disenio(): MovimientoConciliable[] {
  n = 0;
  const datos: [string, string, number][] = [
    ["2026-10-22", "Almuerzo", -15000],
    ["2026-10-24", "Pago taxi", -30000],
    ["2026-10-27", "Desayuno", -8000],
    ["2026-10-28", "Retiro cajero", 100000],
    ["2026-10-29", "Agua", -1100],
    ["2026-10-30", "Almuerzo", -15000],
    ["2026-10-31", "Pan", -5000],
    ["2026-11-03", "Recarga datos", -4000],
    ["2026-11-04", "Almuerzo", -15000],
    ["2026-11-05", "Recarga tarjeta SITP", -10000],
    ["2026-11-06", "Almuerzo", -15000],
    ["2026-11-07", "Pago taxi", -30000],
    ["2026-11-10", "Desayuno", -8000],
    ["2026-11-10", "Pan", -5000],
    ["2026-11-11", "Agua", -1100],
    ["2026-11-11", "Almuerzo", -15000],
  ];
  return datos.map(([fecha, desc, monto]) => {
    const m = mov(fecha, desc, monto);
    const octubre = fecha < "2026-11-01";
    return {
      ...m,
      conciliadoOrigen: octubre && m.cuentaOrigen?.id === EFECTIVO.id,
      conciliadoDestino: octubre && m.cuentaDestino?.id === EFECTIVO.id,
    };
  });
}

const CUENTA = { id: EFECTIVO.id, saldoInicial: 122_200n };
const HOY = "2026-11-11";

describe("historialDeCuenta (datos del diseño)", () => {
  it("últimos 30 días: saldo, entradas, salidas y saldo al inicio", () => {
    const h = historialDeCuenta(CUENTA, disenio(), { desde: "2026-10-12", hasta: null }, HOY);
    expect(h.saldo).toBe(45_000n);
    expect(h.saldoHoy).toBe(45_000n);
    expect(h.entradas).toBe(100_000n);
    expect(h.salidas).toBe(177_200n);
    expect(h.saldoInicioRango).toBe(122_200n);
    expect(h.filas).toHaveLength(16);
    expect(h.filas[0]?.saldo).toBe(45_000n);
    expect(h.filas[0]?.movimiento.descripcion).toBe("Almuerzo");
  });

  it("desde el 1 de noviembre: solo los 9 de noviembre, saldo al inicio 148.100", () => {
    const h = historialDeCuenta(CUENTA, disenio(), { desde: "2026-11-01", hasta: null }, HOY);
    expect(h.filas).toHaveLength(9);
    expect(h.saldoInicioRango).toBe(148_100n);
  });

  it("octubre con tope: saldo corrido y última fila del mes", () => {
    const h = historialDeCuenta(
      CUENTA,
      disenio(),
      { desde: "2026-10-01", hasta: "2026-10-31" },
      HOY,
    );
    expect(h.filas).toHaveLength(7);
    expect(h.filas[0]?.saldo).toBe(148_100n);
  });

  it("una transferencia desde el banco es entrada con contraparte «desde»", () => {
    const h = historialDeCuenta(
      CUENTA,
      disenio(),
      { desde: "2026-10-28", hasta: "2026-10-28" },
      HOY,
    );
    expect(h.filas[0]?.efecto).toBe(100_000n);
    expect(h.filas[0]?.contraparte).toEqual({ ...BANCO, sentido: "desde" });
  });

  it("un gasto futuro sale primero sin tope y no cuenta en el saldo a hoy", () => {
    const futuro = mov("2026-11-12", "Mercado", -5000);
    const h = historialDeCuenta(
      CUENTA,
      [...disenio(), futuro],
      { desde: "2026-10-12", hasta: null },
      HOY,
    );
    expect(h.filas[0]?.movimiento.id).toBe(futuro.id);
    expect(h.filas[0]?.saldo).toBe(h.saldo);
    expect(h.saldo).toBe(40_000n);
    expect(h.saldoHoy).toBe(45_000n);
  });

  it("rango sin movimientos: lista vacía con saldo al inicio", () => {
    const h = historialDeCuenta(CUENTA, disenio(), { desde: "2026-12-01", hasta: null }, HOY);
    expect(h.filas).toEqual([]);
    expect(h.saldoInicioRango).toBe(45_000n);
  });

  it("a igual fecha, el registrado después va arriba", () => {
    const h = historialDeCuenta(CUENTA, disenio(), { desde: "2026-11-11", hasta: null }, HOY);
    expect(h.filas.map((f) => f.movimiento.descripcion)).toEqual(["Almuerzo", "Agua"]);
  });
});

describe("estadoConciliacion", () => {
  it("datos del diseño: conciliado al 31 oct, 148.100, 9 pendientes", () => {
    expect(estadoConciliacion(CUENTA, disenio())).toEqual({
      saldo: 148_100n,
      al: "2026-10-31",
      pendientes: 9,
    });
  });

  it("sin nada conciliado: saldo y fecha nulos", () => {
    const movs = disenio().map((m) => ({
      ...m,
      conciliadoOrigen: false,
      conciliadoDestino: false,
    }));
    expect(estadoConciliacion(CUENTA, movs)).toEqual({ saldo: null, al: null, pendientes: 16 });
  });

  it("un hueco corta la continuidad aunque haya conciliados después", () => {
    const movs = disenio().map((m, i) =>
      i === 2
        ? { ...m, conciliadoOrigen: false }
        : { ...m, conciliadoOrigen: true, conciliadoDestino: true },
    );
    const estado = estadoConciliacion(CUENTA, movs);
    expect(estado.al).toBe("2026-10-24");
    expect(estado.saldo).toBe(77_200n);
    expect(estado.pendientes).toBe(1);
  });

  it("el lado conciliado es el de la cuenta: en Bancolombia no cuenta", () => {
    const retiro = mov("2026-10-28", "Retiro cajero", 100000, { conciliadoOrigen: true });
    expect(estadoConciliacion(CUENTA, [retiro]).pendientes).toBe(1);
  });
});

describe("calcularAjuste", () => {
  it("contado menor: baja por la diferencia", () => {
    expect(calcularAjuste(41_500n, 45_000n)).toEqual({ sube: false, monto: 3_500n });
  });
  it("contado mayor: sube", () => {
    expect(calcularAjuste(50_000n, 45_000n)).toEqual({ sube: true, monto: 5_000n });
  });
  it("sin diferencia: null", () => {
    expect(calcularAjuste(45_000n, 45_000n)).toBeNull();
  });
});
