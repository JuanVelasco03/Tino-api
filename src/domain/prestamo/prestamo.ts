/**
 * Préstamos con personas (SPEC 08). Un préstamo es una cuenta de tipo
 * `prestamo_otorgado` (activo) o `deuda_contraida` (pasivo): su capital
 * pendiente es el saldo de esa cuenta (RN-01, RN-02, RN-08).
 *
 * Montos en unidades menores, `bigint`. La tasa va en centésimas de punto
 * (1 % = 100), entera. Fechas "YYYY-MM-DD" en la zona del perfil.
 */
import type { Ref, TipoMovimiento } from "../movimiento/movimiento.js";

/** Espejo de la lista de tipos de préstamo de la migración `..._prestamos.sql`. */
export const TIPOS_PRESTAMO = ["prestamo_otorgado", "deuda_contraida"] as const;

export type TipoPrestamo = (typeof TIPOS_PRESTAMO)[number];

export function esTipoPrestamo(tipo: string): tipo is TipoPrestamo {
  return (TIPOS_PRESTAMO as readonly string[]).includes(tipo);
}

export type EstadoPrestamo = "te_debe" | "le_debes" | "saldado";

export type ClaseMovimientoPrestamo = "desembolso" | "abono" | "condonacion" | "interes";

export type Prestamo = {
  id: string;
  nombre: string;
  tipo: TipoPrestamo;
  tasaCpb: number;
  fechaAcordada: string | null;
  creadoEn: Date;
};

/**
 * Movimiento que toca la cuenta del préstamo. `cuentaOrigen` y `cuentaDestino`
 * llevan el nombre de cada cuenta para el historial.
 */
export type MovimientoDePrestamo = {
  id: string;
  tipo: TipoMovimiento;
  monto: bigint;
  fecha: string;
  creadoEn: Date;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;
};

/** Interés cobrado o pagado (`prestamos_intereses` + su movimiento). */
export type InteresDePrestamo = {
  movimientoId: string;
  movimientoCapitalId: string | null;
  monto: bigint;
  fecha: string;
  creadoEn: Date;
  cuenta: Ref;
};

export type Cierre = { fecha: string; forma: "pago" | "condonacion" };

export type FilaHistorial = {
  fecha: string;
  clase: ClaseMovimientoPrestamo;
  /** La cuenta propia; null en condonación. */
  cuenta: Ref | null;
  categoria: Ref | null;
  /** Con signo: + desembolso, − abono y condonación; 0 en clase interes. */
  capital: bigint;
  interes: bigint;
  /** Capital corrido tras la fila. */
  saldoCapital: bigint;
  movimientoId: string | null;
  movimientoInteresId: string | null;
};

export type TotalesPrestamo = {
  totalPrestado: bigint;
  /** Abonos a capital + condonaciones. */
  totalAbonado: bigint;
  totalCondonado: bigint;
  interesesCobrados: bigint;
};

export type ResumenPrestamo = {
  id: string;
  nombre: string;
  tipo: TipoPrestamo;
  tasaCpb: number;
  estado: EstadoPrestamo;
  capitalPendiente: bigint;
  desde: string | null;
  fechaAcordada: string | null;
  vencido: boolean;
  cierre: Cierre | null;
  /** A hoy; 0 sin tasa o saldado. */
  interesesCausados: bigint;
};

export type Consolidado = {
  teDeben: { total: bigint; personas: number; interesesCausados: bigint };
  debes: { total: bigint; personas: number; interesesCausados: bigint; conIntereses: boolean };
  /** teDeben.total − debes.total; puede ser negativa. */
  posicionNeta: bigint;
};
