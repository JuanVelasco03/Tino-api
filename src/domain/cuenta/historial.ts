/**
 * Historial de una cuenta de efectivo o banco (SPEC 14): saldo corrido, rango,
 * entradas y salidas. Funciones puras; los montos llegan descifrados.
 * Unidades menores, `bigint`: sin coma flotante.
 */
import type { Movimiento, Ref } from "../movimiento/movimiento.js";

/** Movimiento con su estado de conciliación por lado (SPEC 14). */
export type MovimientoConciliable = Movimiento & {
  conciliadoOrigen: boolean;
  conciliadoDestino: boolean;
};

/** Cuenta mínima para el historial. Solo efectivo y banco (activos). */
export type CuentaHistorial = { id: string; saldoInicial: bigint };

/** `desde` inclusive; `hasta` inclusive, o `null` sin tope (entran los futuros, N-39). */
export type Rango = { desde: string; hasta: string | null };

export type Contraparte = Ref & { sentido: "desde" | "hacia" };

export type FilaHistorial = {
  movimiento: MovimientoConciliable;
  /** Con signo: + entra a la cuenta, − sale. */
  efecto: bigint;
  /** Saldo corrido tras la fila. */
  saldo: bigint;
  /** Estado del lado de esta cuenta. */
  conciliado: boolean;
  /** La otra cuenta de una transferencia; `null` en los demás tipos. */
  contraparte: Contraparte | null;
};

export type Historial = {
  /** Saldo actual: todos los movimientos, también los futuros (SPEC 03). */
  saldo: bigint;
  /** Saldo con los movimientos de fecha ≤ hoy. */
  saldoHoy: bigint;
  /** Saldo tras los movimientos de fecha < desde. */
  saldoInicioRango: bigint;
  /** Σ efectos positivos del rango. */
  entradas: bigint;
  /** Σ |efectos negativos| del rango, positivo. */
  salidas: bigint;
  /** Las del rango, la más reciente primero. */
  filas: FilaHistorial[];
};

/** Orden cronológico: fecha, luego registro, luego id. */
export function compararCronologico(
  a: Pick<Movimiento, "fecha" | "creadoEn" | "id">,
  b: Pick<Movimiento, "fecha" | "creadoEn" | "id">,
): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const t = a.creadoEn.getTime() - b.creadoEn.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Efecto de un movimiento en una cuenta de activo: + si es destino
 * (`montoDestino ?? monto`), − si es origen. 0 si no la toca.
 */
export function efectoEnCuenta(
  cuentaId: string,
  m: Pick<Movimiento, "monto" | "montoDestino" | "cuentaOrigen" | "cuentaDestino">,
): bigint {
  let efecto = 0n;
  if (m.cuentaDestino?.id === cuentaId) efecto += m.montoDestino ?? m.monto;
  if (m.cuentaOrigen?.id === cuentaId) efecto -= m.monto;
  return efecto;
}

/** Estado de conciliación del lado de la cuenta. */
export function conciliadoEnCuenta(cuentaId: string, m: MovimientoConciliable): boolean {
  if (m.cuentaDestino?.id === cuentaId) return m.conciliadoDestino;
  if (m.cuentaOrigen?.id === cuentaId) return m.conciliadoOrigen;
  return false;
}

function contraparteDe(cuentaId: string, m: Movimiento): Contraparte | null {
  if (m.tipo !== "transferencia") return null;
  if (m.cuentaDestino?.id === cuentaId && m.cuentaOrigen !== null) {
    return { ...m.cuentaOrigen, sentido: "desde" };
  }
  if (m.cuentaOrigen?.id === cuentaId && m.cuentaDestino !== null) {
    return { ...m.cuentaDestino, sentido: "hacia" };
  }
  return null;
}

const enRango = (fecha: string, r: Rango): boolean =>
  fecha >= r.desde && (r.hasta === null || fecha <= r.hasta);

/**
 * Historial de `cuenta` con `movimientos` (los que la tocan, en cualquier
 * orden). `hoy` en la zona del perfil.
 */
export function historialDeCuenta(
  cuenta: CuentaHistorial,
  movimientos: readonly MovimientoConciliable[],
  rango: Rango,
  hoy: string,
): Historial {
  const ordenados = [...movimientos].sort(compararCronologico);
  let saldo = cuenta.saldoInicial;
  let saldoHoy = cuenta.saldoInicial;
  let saldoInicioRango = cuenta.saldoInicial;
  let entradas = 0n;
  let salidas = 0n;
  const filas: FilaHistorial[] = [];

  for (const m of ordenados) {
    const efecto = efectoEnCuenta(cuenta.id, m);
    saldo += efecto;
    if (m.fecha <= hoy) saldoHoy += efecto;
    if (m.fecha < rango.desde) saldoInicioRango += efecto;
    if (!enRango(m.fecha, rango)) continue;
    if (efecto > 0n) entradas += efecto;
    else salidas -= efecto;
    filas.push({
      movimiento: m,
      efecto,
      saldo,
      conciliado: conciliadoEnCuenta(cuenta.id, m),
      contraparte: contraparteDe(cuenta.id, m),
    });
  }

  return { saldo, saldoHoy, saldoInicioRango, entradas, salidas, filas: filas.reverse() };
}
