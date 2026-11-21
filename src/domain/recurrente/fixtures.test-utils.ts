/**
 * Datos de apoyo de las pruebas del dominio de recurrentes. El ejemplo del
 * diseño (`referencias/export-recurrentes`): hoy 2026-11-11, mes 2026-11.
 */
import type { Cierre, Recurrente } from "./recurrente.js";

export const HOY = "2026-11-11";
export const MES = "2026-11";

export function plantilla(id: string, extra: Partial<Recurrente> = {}): Recurrente {
  return {
    id,
    tipo: "gasto",
    concepto: id,
    monto: 1000n,
    variable: false,
    cuentaOrigenId: "bancolombia",
    cuentaDestinoId: null,
    categoriaId: null,
    periodicidad: "mensual",
    primerVencimiento: "2026-10-01",
    ultimoDia: false,
    generarDesde: "2026-10-01",
    pausadaDesde: null,
    ...extra,
  };
}

export function confirmada(recurrenteId: string, vencimiento: string, monto: bigint): Cierre {
  return {
    recurrenteId,
    vencimiento,
    estado: "confirmada",
    movimientoId: `mov-${recurrenteId}-${vencimiento}`,
    montoMovimiento: monto,
  };
}

export function omitida(recurrenteId: string, vencimiento: string): Cierre {
  return {
    recurrenteId,
    vencimiento,
    estado: "omitida",
    movimientoId: null,
    montoMovimiento: null,
  };
}

/** Mensual con día fijo desde octubre de 2026. */
const mensual = (id: string, concepto: string, dia: string, monto: bigint, extra = {}) =>
  plantilla(id, {
    concepto,
    monto,
    primerVencimiento: `2026-10-${dia}`,
    generarDesde: `2026-10-${dia}`,
    ...extra,
  });

export const DISENO: Recurrente[] = [
  mensual("arriendo", "Arriendo", "01", 1_100_000n),
  mensual("spotify", "Spotify", "01", 16_900n, { cuentaOrigenId: "tarjeta" }),
  mensual("enel", "Energía Enel", "03", 80_000n, { variable: true }),
  mensual("mama", "Abono a mamá", "06", 100_000n, {
    tipo: "transferencia",
    cuentaOrigenId: "nequi",
    cuentaDestinoId: "deuda-mama",
  }),
  mensual("gym", "Gimnasio", "08", 95_000n),
  mensual("internet", "Internet Claro hogar", "12", 89_900n),
  mensual("gas", "Gas Vanti", "14", 32_400n, { variable: true }),
  mensual("manejo", "Cuota de manejo", "16", 26_990n, { cuentaOrigenId: "tarjeta" }),
  plantilla("agua", {
    concepto: "Acueducto EAAB",
    monto: 40_000n,
    variable: true,
    periodicidad: "bimestral",
    primerVencimiento: "2026-09-18",
    generarDesde: "2026-09-18",
  }),
  mensual("apple", "Mensualidad Apple", "25", 3_900n, { cuentaOrigenId: "tarjeta" }),
  mensual("netflix", "Netflix", "30", 26_900n, { cuentaOrigenId: "tarjeta" }),
  plantilla("salario", {
    tipo: "ingreso",
    concepto: "Salario Andina SAS",
    monto: 4_200_000n,
    cuentaOrigenId: null,
    cuentaDestinoId: "bancolombia",
    ultimoDia: true,
    primerVencimiento: "2026-10-31",
    generarDesde: "2026-10-31",
  }),
  // Omitida en noviembre: no suma.
  mensual("lavanderia", "Lavandería", "05", 45_000n),
];

export const CIERRES_DISENO: Cierre[] = [
  confirmada("arriendo", "2026-10-01", 1_100_000n),
  confirmada("arriendo", "2026-11-01", 1_100_000n),
  confirmada("spotify", "2026-11-01", 16_900n),
  confirmada("enel", "2026-11-03", 84_320n),
  confirmada("mama", "2026-11-06", 100_000n),
  confirmada("gym", "2026-11-08", 95_000n),
  confirmada("agua", "2026-09-18", 41_860n),
  omitida("lavanderia", "2026-11-05"),
  // El salario de octubre ya se confirmó: no está en los esperados de noviembre.
  confirmada("salario", "2026-10-31", 4_200_000n),
];
