/**
 * Contrato HTTP de préstamos (SPEC 08). Montos como string de entero en
 * unidades menores; fechas "YYYY-MM-DD" en la zona del usuario. La tasa,
 * como string decimal ("1.5").
 */
import { cpbATasa } from "../domain/prestamo/tasa.js";
import type {
  Cierre,
  ClaseMovimientoPrestamo,
  Consolidado,
  EstadoPrestamo,
  FilaHistorial,
  ResumenPrestamo,
  TipoPrestamo,
  TotalesPrestamo,
} from "../domain/prestamo/prestamo.js";
import type { PropuestaAbono } from "../domain/prestamo/intereses.js";
import type { Ref } from "../domain/movimiento/movimiento.js";

export type PrestamoResumenDto = {
  /** Id de la cuenta del préstamo. */
  id: string;
  /** La persona. */
  nombre: string;
  tipo: TipoPrestamo;
  estado: EstadoPrestamo;
  /** "0" si saldado; positivo también en le_debes. */
  capitalPendiente: string;
  /** null si saldado. */
  desde: string | null;
  fechaAcordada: string | null;
  vencido: boolean;
  cierre: Cierre | null;
  /** A hoy; "0" sin tasa o saldado. */
  interesesCausados: string;
};

export type PrestamosDto = {
  fechaHoy: string;
  teDeben: { total: string; personas: number; interesesCausados: string };
  debes: { total: string; personas: number; interesesCausados: string; conIntereses: boolean };
  /** Puede ser negativa. */
  posicionNeta: string;
  prestamos: PrestamoResumenDto[];
};

export type MovimientoPrestamoDto = {
  fecha: string;
  clase: ClaseMovimientoPrestamo;
  /** La cuenta propia; null en condonación. */
  cuenta: Ref | null;
  /** Condonación: categoría del gasto. */
  categoria: Ref | null;
  /** Con signo; "0" en clase interes. */
  capital: string;
  /** "0" si no hay. */
  interes: string;
  saldoCapital: string;
  /** El de capital; null en clase interes. */
  movimientoId: string | null;
  movimientoInteresId: string | null;
};

export type PrestamoDetalleDto = PrestamoResumenDto & {
  fechaHoy: string;
  /** "0", "1", "1.5". */
  tasaMensual: string;
  totalPrestado: string;
  /** Abonos a capital + condonaciones. */
  totalAbonado: string;
  /** > 0 → rótulo «Abonos y condonación». */
  totalCondonado: string;
  /** Pagados, en una contraída. */
  interesesCobrados: string;
  ultimoAbono: string | null;
  historial: MovimientoPrestamoDto[];
  creadoEn: string;
};

export type PropuestaAbonoDto = {
  fecha: string;
  monto: string;
  capital: string;
  interes: string;
  interesesCausados: string;
  capitalPendiente: string;
};

export function aPrestamoResumenDto(p: ResumenPrestamo): PrestamoResumenDto {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    estado: p.estado,
    capitalPendiente: p.capitalPendiente.toString(),
    desde: p.desde,
    fechaAcordada: p.fechaAcordada,
    vencido: p.vencido,
    cierre: p.cierre,
    interesesCausados: p.interesesCausados.toString(),
  };
}

export function aPrestamosDto(
  fechaHoy: string,
  consolidado: Consolidado,
  prestamos: readonly ResumenPrestamo[],
): PrestamosDto {
  const { teDeben, debes } = consolidado;
  return {
    fechaHoy,
    teDeben: {
      total: teDeben.total.toString(),
      personas: teDeben.personas,
      interesesCausados: teDeben.interesesCausados.toString(),
    },
    debes: {
      total: debes.total.toString(),
      personas: debes.personas,
      interesesCausados: debes.interesesCausados.toString(),
      conIntereses: debes.conIntereses,
    },
    posicionNeta: consolidado.posicionNeta.toString(),
    prestamos: prestamos.map(aPrestamoResumenDto),
  };
}

function aMovimientoPrestamoDto(f: FilaHistorial): MovimientoPrestamoDto {
  return {
    fecha: f.fecha,
    clase: f.clase,
    cuenta: f.cuenta,
    categoria: f.categoria,
    capital: f.capital.toString(),
    interes: f.interes.toString(),
    saldoCapital: f.saldoCapital.toString(),
    movimientoId: f.movimientoId,
    movimientoInteresId: f.movimientoInteresId,
  };
}

export function aPrestamoDetalleDto(datos: {
  fechaHoy: string;
  resumen: ResumenPrestamo;
  totales: TotalesPrestamo;
  ultimoAbono: string | null;
  historial: readonly FilaHistorial[];
  creadoEn: Date;
}): PrestamoDetalleDto {
  const { resumen, totales } = datos;
  return {
    ...aPrestamoResumenDto(resumen),
    fechaHoy: datos.fechaHoy,
    tasaMensual: cpbATasa(resumen.tasaCpb),
    totalPrestado: totales.totalPrestado.toString(),
    totalAbonado: totales.totalAbonado.toString(),
    totalCondonado: totales.totalCondonado.toString(),
    interesesCobrados: totales.interesesCobrados.toString(),
    ultimoAbono: datos.ultimoAbono,
    historial: datos.historial.map(aMovimientoPrestamoDto),
    creadoEn: datos.creadoEn.toISOString(),
  };
}

export function aPropuestaAbonoDto(
  fecha: string,
  monto: bigint,
  propuesta: PropuestaAbono,
): PropuestaAbonoDto {
  return {
    fecha,
    monto: monto.toString(),
    capital: propuesta.capital.toString(),
    interes: propuesta.interes.toString(),
    interesesCausados: propuesta.interesesCausados.toString(),
    capitalPendiente: propuesta.capitalPendiente.toString(),
  };
}
