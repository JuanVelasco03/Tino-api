/**
 * Resumen de cada préstamo, orden de la lista y consolidado (SPEC 08).
 */
import { capitalPendiente, cierre, desde } from "./historial.js";
import { causadosEn } from "./intereses.js";
import type {
  Consolidado,
  EstadoPrestamo,
  InteresDePrestamo,
  MovimientoDePrestamo,
  Prestamo,
  ResumenPrestamo,
  TipoPrestamo,
} from "./prestamo.js";

/** `saldado` con capital 0; si no, `te_debe` (otorgado) o `le_debes` (contraída). */
export function estadoDe(tipo: TipoPrestamo, capital: bigint): EstadoPrestamo {
  if (capital === 0n) return "saldado";
  return tipo === "prestamo_otorgado" ? "te_debe" : "le_debes";
}

/** Vencido: fecha acordada pasada con capital pendiente. */
export function vencido(fechaAcordada: string | null, capital: bigint, hoy: string): boolean {
  return fechaAcordada !== null && fechaAcordada < hoy && capital > 0n;
}

export function resumirPrestamo(
  prestamo: Prestamo,
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly InteresDePrestamo[],
  hoy: string,
): ResumenPrestamo {
  const capital = capitalPendiente(prestamo, movimientos);
  return {
    id: prestamo.id,
    nombre: prestamo.nombre,
    tipo: prestamo.tipo,
    tasaCpb: prestamo.tasaCpb,
    estado: estadoDe(prestamo.tipo, capital),
    capitalPendiente: capital,
    desde: desde(prestamo, movimientos),
    fechaAcordada: prestamo.fechaAcordada,
    vencido: vencido(prestamo.fechaAcordada, capital, hoy),
    cierre: cierre(prestamo, movimientos),
    interesesCausados: causadosEn(prestamo, movimientos, intereses, hoy),
  };
}

const ORDEN_GRUPO: Record<EstadoPrestamo, number> = { te_debe: 0, le_debes: 1, saldado: 2 };

const porNombre = (x: ResumenPrestamo, y: ResumenPrestamo) =>
  x.nombre.localeCompare(y.nombre, "es");

/**
 * Grupos `te_debe`, `le_debes`, `saldado`. Los dos primeros por capital desc;
 * `saldado` por fecha de cierre desc (sin cierre al final). Empate: nombre.
 */
export function ordenarPrestamos(prestamos: readonly ResumenPrestamo[]): ResumenPrestamo[] {
  return prestamos.toSorted((x, y) => {
    if (x.estado !== y.estado) return ORDEN_GRUPO[x.estado] - ORDEN_GRUPO[y.estado];
    if (x.estado === "saldado") {
      const fx = x.cierre?.fecha ?? null;
      const fy = y.cierre?.fecha ?? null;
      if (fx !== fy) {
        if (fx === null) return 1;
        if (fy === null) return -1;
        return fx > fy ? -1 : 1;
      }
      return porNombre(x, y);
    }
    if (x.capitalPendiente !== y.capitalPendiente) {
      return x.capitalPendiente > y.capitalPendiente ? -1 : 1;
    }
    return porNombre(x, y);
  });
}

/**
 * `teDeben` / `debes`: Σ capital, préstamos no saldados y Σ causados a hoy de
 * los otorgados / contraídas. `conIntereses`: alguna contraída no saldada
 * tiene tasa. `posicionNeta = teDeben.total − debes.total`.
 */
export function consolidar(prestamos: readonly ResumenPrestamo[]): Consolidado {
  const teDeben = { total: 0n, personas: 0, interesesCausados: 0n };
  const debes = { total: 0n, personas: 0, interesesCausados: 0n, conIntereses: false };
  for (const p of prestamos) {
    const grupo = p.tipo === "prestamo_otorgado" ? teDeben : debes;
    grupo.total += p.capitalPendiente;
    grupo.interesesCausados += p.interesesCausados;
    if (p.estado !== "saldado") {
      grupo.personas += 1;
      if (p.tipo === "deuda_contraida" && p.tasaCpb > 0) debes.conIntereses = true;
    }
  }
  return { teDeben, debes, posicionNeta: teDeben.total - debes.total };
}
