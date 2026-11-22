/**
 * Validaciones de préstamos (SPEC 08). Cada función devuelve el primer error o
 * `null`. Que la cuenta propia exista, sea del usuario, no sea un préstamo y no
 * esté archivada lo garantizan `crear_prestamo`, `registrar_abono` y
 * `registrar_movimiento` en la base.
 */
import { calcularSaldo, type EfectoMovimiento } from "../cuenta/saldo.js";
import { esFechaValida } from "../fecha/mes.js";
import type { TipoMovimiento } from "../movimiento/movimiento.js";
import { esTipoPrestamo, type Prestamo, type TipoPrestamo } from "./prestamo.js";
import { tasaACpb } from "./tasa.js";

export const NOMBRE_MAXIMO = 60;

export type CodigoErrorPrestamo =
  | "TIPO_INVALIDO"
  | "NOMBRE_REQUERIDO"
  | "NOMBRE_LARGO"
  | "MONTO_REQUERIDO"
  | "FECHA_INVALIDA"
  | "TASA_INVALIDA"
  | "FECHA_ACORDADA_ANTERIOR"
  | "ABONO_VACIO"
  | "ABONO_EXCEDE_CAPITAL"
  | "FECHA_ANTERIOR_AL_PRESTAMO"
  | "PRESTAMO_SALDADO"
  | "CONDONACION_NO_PERMITIDA"
  | "CONDONACION_EXCEDE_CAPITAL"
  | "SIN_CAMBIOS"
  | "CUENTA_DE_PRESTAMO"
  | "MOVIMIENTO_DE_PRESTAMO"
  | "CAPITAL_NEGATIVO";

export type ErrorPrestamo = { codigo: CodigoErrorPrestamo; campo?: string };

const error = (codigo: CodigoErrorPrestamo, campo?: string): ErrorPrestamo =>
  campo === undefined ? { codigo } : { codigo, campo };

function validarNombre(nombre: string): ErrorPrestamo | null {
  const recortado = nombre.trim();
  if (recortado === "") return error("NOMBRE_REQUERIDO", "nombre");
  if (recortado.length > NOMBRE_MAXIMO) return error("NOMBRE_LARGO", "nombre");
  return null;
}

export type DesembolsoEntrada = { monto: bigint; fecha: string };

export type AltaEntrada = DesembolsoEntrada & {
  tipo: string;
  nombre: string;
  tasaMensual: string;
  fechaAcordada: string | null;
};

/** Monto > 0 y fecha válida. */
export function validarDesembolso(e: DesembolsoEntrada): ErrorPrestamo | null {
  if (e.monto <= 0n) return error("MONTO_REQUERIDO", "monto");
  if (!esFechaValida(e.fecha)) return error("FECHA_INVALIDA", "fecha");
  return null;
}

/** Tipo, nombre de 1 a 60, desembolso, tasa y fecha acordada ≥ fecha. */
export function validarAlta(e: AltaEntrada): ErrorPrestamo | null {
  if (!esTipoPrestamo(e.tipo)) return error("TIPO_INVALIDO", "tipo");
  const nombre = validarNombre(e.nombre);
  if (nombre) return nombre;
  const desembolso = validarDesembolso(e);
  if (desembolso) return desembolso;
  if (tasaACpb(e.tasaMensual) === null) return error("TASA_INVALIDA", "tasaMensual");
  if (e.fechaAcordada !== null) {
    if (!esFechaValida(e.fechaAcordada)) return error("FECHA_INVALIDA", "fechaAcordada");
    if (e.fechaAcordada < e.fecha) return error("FECHA_ACORDADA_ANTERIOR", "fechaAcordada");
  }
  return null;
}

export type AbonoEntrada = { capital: bigint; interes: bigint; fecha: string };

/** Estado del préstamo leído en fresco antes de abonar o condonar. */
export type EstadoCapital = {
  capitalPendiente: bigint;
  /** Fecha del primer movimiento de capital; null sin movimientos. */
  primeraFecha: string | null;
};

export function validarAbono(e: AbonoEntrada, estado: EstadoCapital): ErrorPrestamo | null {
  if (estado.capitalPendiente === 0n) return error("PRESTAMO_SALDADO");
  if (e.capital < 0n || e.interes < 0n || e.capital + e.interes === 0n) {
    return error("ABONO_VACIO", "capital");
  }
  if (!esFechaValida(e.fecha)) return error("FECHA_INVALIDA", "fecha");
  if (estado.primeraFecha !== null && e.fecha < estado.primeraFecha) {
    return error("FECHA_ANTERIOR_AL_PRESTAMO", "fecha");
  }
  if (e.capital > estado.capitalPendiente) return error("ABONO_EXCEDE_CAPITAL", "capital");
  return null;
}

/** Solo en un otorgado no saldado; monto > 0 y ≤ capital pendiente. */
export function validarCondonacion(
  tipo: TipoPrestamo,
  capitalPendiente: bigint,
  monto: bigint,
): ErrorPrestamo | null {
  if (tipo !== "prestamo_otorgado") return error("CONDONACION_NO_PERMITIDA");
  if (capitalPendiente === 0n) return error("PRESTAMO_SALDADO");
  if (monto <= 0n) return error("MONTO_REQUERIDO", "monto");
  if (monto > capitalPendiente) return error("CONDONACION_EXCEDE_CAPITAL", "monto");
  return null;
}

export type CambioPrestamo = { nombre?: string; fechaAcordada?: string | null };

/** Al menos un campo; nombre como en el alta; `fechaAcordada` válida o null. */
export function validarCambio(c: CambioPrestamo): ErrorPrestamo | null {
  if (c.nombre === undefined && c.fechaAcordada === undefined) return error("SIN_CAMBIOS");
  if (c.nombre !== undefined) {
    const nombre = validarNombre(c.nombre);
    if (nombre) return nombre;
  }
  if (c.fechaAcordada !== undefined && c.fechaAcordada !== null) {
    if (!esFechaValida(c.fechaAcordada)) return error("FECHA_INVALIDA", "fechaAcordada");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Movimientos desde /movimientos y /recurrentes (N-95, N-96).
// ---------------------------------------------------------------------------

export type CuentasDeMovimiento = {
  tipo: TipoMovimiento;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
};

type EsPrestamo = (cuentaId: string) => boolean;

/** Un movimiento o recurrente nuevo no toca cuentas de préstamo: nacen en Deudas. */
export function validarSinCuentaDePrestamo(
  m: Omit<CuentasDeMovimiento, "tipo">,
  esPrestamo: EsPrestamo,
): ErrorPrestamo | null {
  if (m.cuentaOrigenId !== null && esPrestamo(m.cuentaOrigenId)) {
    return error("CUENTA_DE_PRESTAMO", "cuentaOrigenId");
  }
  if (m.cuentaDestinoId !== null && esPrestamo(m.cuentaDestinoId)) {
    return error("CUENTA_DE_PRESTAMO", "cuentaDestinoId");
  }
  return null;
}

/**
 * Reemplazo de un movimiento (PUT):
 * - Si toca un préstamo, no cambia de tipo ni saca el préstamo de su campo
 *   (`MOVIMIENTO_DE_PRESTAMO`); la cuenta propia puede cambiar, pero no a otra
 *   de préstamo (`CUENTA_DE_PRESTAMO`).
 * - Un interés de préstamo no cambia de tipo.
 * - Un movimiento ordinario no pasa a tocar un préstamo.
 */
export function validarCambioMovimiento(
  actual: CuentasDeMovimiento,
  nuevo: CuentasDeMovimiento,
  contexto: { esPrestamo: EsPrestamo; esInteres: boolean },
): ErrorPrestamo | null {
  const { esPrestamo, esInteres } = contexto;
  const origenPrestamo = actual.cuentaOrigenId !== null && esPrestamo(actual.cuentaOrigenId);
  const destinoPrestamo = actual.cuentaDestinoId !== null && esPrestamo(actual.cuentaDestinoId);

  if ((origenPrestamo || destinoPrestamo || esInteres) && nuevo.tipo !== actual.tipo) {
    return error("MOVIMIENTO_DE_PRESTAMO", "tipo");
  }
  if (origenPrestamo && nuevo.cuentaOrigenId !== actual.cuentaOrigenId) {
    return error("MOVIMIENTO_DE_PRESTAMO", "tipo");
  }
  if (destinoPrestamo && nuevo.cuentaDestinoId !== actual.cuentaDestinoId) {
    return error("MOVIMIENTO_DE_PRESTAMO", "tipo");
  }

  return validarSinCuentaDePrestamo(
    {
      cuentaOrigenId: origenPrestamo ? null : nuevo.cuentaOrigenId,
      cuentaDestinoId: destinoPrestamo ? null : nuevo.cuentaDestinoId,
    },
    esPrestamo,
  );
}

export type MovimientoConId = EfectoMovimiento & { id: string };

/**
 * Tras reemplazar (`nuevo`) o borrar (`nuevo` null) el movimiento `id`, ningún
 * préstamo de `prestamos` queda con capital final negativo. `movimientos`
 * son los movimientos actuales de esos préstamos.
 */
export function validarCapitalTrasCambio(
  prestamos: readonly Pick<Prestamo, "id" | "tipo">[],
  movimientos: readonly MovimientoConId[],
  id: string,
  nuevo: EfectoMovimiento | null,
): ErrorPrestamo | null {
  const despues: EfectoMovimiento[] = movimientos.filter((m) => m.id !== id);
  if (nuevo !== null) despues.push(nuevo);
  for (const p of prestamos) {
    if (calcularSaldo({ id: p.id, tipo: p.tipo, saldoInicial: 0n }, despues) < 0n) {
      return error("CAPITAL_NEGATIVO");
    }
  }
  return null;
}
