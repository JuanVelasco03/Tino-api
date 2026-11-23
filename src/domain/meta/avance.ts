/**
 * Avance, cumplimiento y uso de una meta (SPEC 13). Nada se guarda (RN-01),
 * salvo el cumplimiento de una meta sobre inversión, que se guarda la primera
 * vez que una lectura lo detecta (`debeGuardarCumplimiento`).
 */
import { calcularSaldo, type EfectoMovimiento } from "../cuenta/saldo.js";
import type { TipoCuenta } from "../cuenta/naturaleza.js";
import type {
  Aporte,
  AporteEnLinea,
  CuentaDeMeta,
  Cumplimiento,
  Meta,
  TipoAporte,
} from "./meta.js";

/**
 * Monto y fecha de un aporte: los propios o, si tiene transferencia, los de
 * ella. `transferencia` es la del aporte (`movimientoId`), si existe.
 */
export function resolverAporte(
  guardado: Omit<Aporte, "monto" | "fecha" | "cuentaOrigen"> & {
    monto: bigint | null;
    fecha: string | null;
  },
  transferencia: {
    monto: bigint;
    fecha: string;
    cuentaOrigen: { id: string; nombre: string } | null;
  } | null,
): Aporte {
  const monto = transferencia?.monto ?? guardado.monto;
  const fecha = transferencia?.fecha ?? guardado.fecha;
  if (monto === null || fecha === null) {
    throw new Error(`Aporte ${guardado.id} sin monto o fecha.`);
  }
  return { ...guardado, monto, fecha, cuentaOrigen: transferencia?.cuentaOrigen ?? null };
}

/** Orden del acumulado: `fecha` asc y luego `creadoEn` asc. */
export function enOrden<T extends AporteEnLinea>(aportes: readonly T[]): T[] {
  return aportes.toSorted((x, y) =>
    x.fecha !== y.fecha
      ? x.fecha < y.fecha
        ? -1
        : 1
      : x.creadoEn.getTime() - y.creadoEn.getTime(),
  );
}

const signo = (tipo: TipoAporte, monto: bigint) => (tipo === "aporte" ? monto : -monto);

/** Σ aportes − Σ retiros con fecha ≤ `fecha`; sin fecha, todas las filas (apartado vigente). */
export function acumuladoA(aportes: readonly AporteEnLinea[], fecha?: string): bigint {
  let total = 0n;
  for (const a of aportes) {
    if (fecha === undefined || a.fecha <= fecha) total += signo(a.tipo, a.monto);
  }
  return total;
}

/** Acumulado al cierre de cada día con filas, ascendente. */
export function acumuladosAlCierre(
  aportes: readonly AporteEnLinea[],
): { fecha: string; acumulado: bigint }[] {
  const dias: { fecha: string; acumulado: bigint }[] = [];
  let total = 0n;
  for (const a of enOrden(aportes)) {
    total += signo(a.tipo, a.monto);
    const ultimo = dias.at(-1);
    if (ultimo?.fecha === a.fecha) ultimo.acumulado = total;
    else dias.push({ fecha: a.fecha, acumulado: total });
  }
  return dias;
}

/** Apartado: el primer día en que el acumulado al cierre llega al objetivo. */
export function cumplimientoApartado(
  aportes: readonly AporteEnLinea[],
  objetivo: bigint,
): Cumplimiento | null {
  const dia = acumuladosAlCierre(aportes).find((d) => d.acumulado >= objetivo);
  return dia === undefined ? null : { fecha: dia.fecha, avance: dia.acumulado };
}

/** Efecto de un movimiento con su fecha. */
export type EfectoConFecha = EfectoMovimiento & { fecha: string };

type CuentaConSaldo = { id: string; tipo: TipoCuenta; saldoInicial: bigint };

/** Saldo de la cuenta al cierre de `fecha`: saldo inicial + movimientos con fecha ≤ F. */
export function saldoEn(
  cuenta: CuentaConSaldo,
  efectos: readonly EfectoConFecha[],
  fecha: string,
): bigint {
  return calcularSaldo(
    cuenta,
    efectos.filter((m) => m.fecha <= fecha),
  );
}

/**
 * Modo `cuenta` en efectivo o banco: el primer día, desde `creadaEl` y hasta
 * `hoy`, en que el saldo al cierre llega al objetivo. Se recorre por día una
 * sola vez: solo cambian los días con movimientos.
 */
export function cumplimientoPorSaldo(
  cuenta: CuentaConSaldo,
  efectos: readonly EfectoConFecha[],
  creadaEl: string,
  hoy: string,
  objetivo: bigint,
): Cumplimiento | null {
  const propios = efectos.filter(
    (m) => m.cuentaOrigenId === cuenta.id || m.cuentaDestinoId === cuenta.id,
  );
  const inicio = saldoEn(cuenta, propios, creadaEl);
  if (inicio >= objetivo) return { fecha: creadaEl, avance: inicio };
  const dias = [...new Set(propios.map((m) => m.fecha))]
    .filter((f) => f > creadaEl && f <= hoy)
    .toSorted();
  for (const dia of dias) {
    const saldo = saldoEn(cuenta, propios, dia);
    if (saldo >= objetivo) return { fecha: dia, avance: saldo };
  }
  return null;
}

/**
 * Inversión: el cumplimiento se guarda la primera vez que una lectura lo
 * detecta (N-58). Sin guardar, no archivada y con el avance de hoy en el
 * objetivo o más.
 */
export function debeGuardarCumplimiento(
  meta: Pick<Meta, "cumplidaEn" | "archivadaEn" | "objetivo">,
  avance: bigint | null,
): boolean {
  return (
    meta.cumplidaEn === null &&
    meta.archivadaEn === null &&
    avance !== null &&
    avance >= meta.objetivo
  );
}

/** Uso de una cumplida (N-22): el primer retiro con fecha ≥ el cumplimiento. */
export function usoDeCumplida(
  aportes: readonly Aporte[],
  cumplidaEl: string,
): { fecha: string; motivo: string | null } | null {
  const retiro = enOrden(aportes).find((a) => a.tipo === "retiro" && a.fecha >= cumplidaEl);
  return retiro === undefined ? null : { fecha: retiro.fecha, motivo: retiro.motivo };
}

/** `max(0, objetivo − avance)`. */
export function falta(objetivo: bigint, avance: bigint): bigint {
  const diferencia = objetivo - avance;
  return diferencia > 0n ? diferencia : 0n;
}

/**
 * `floor(avance × 10000 ÷ objetivo)` en centésimas; avance negativo cuenta
 * como 0. 1.900.000 de 7.500.000 → 2533.
 */
export function porcentaje(avance: bigint, objetivo: bigint): number {
  if (avance <= 0n) return 0;
  return Number((avance * 10_000n) / objetivo);
}

/** Σ avance y Σ objetivo de las activas. Un avance nulo no suma y deja `incompleto`. */
export function totales(activas: readonly { avance: bigint | null; objetivo: bigint }[]): {
  avance: bigint;
  objetivo: bigint;
  incompleto: boolean;
} {
  let avance = 0n;
  let objetivo = 0n;
  let incompleto = false;
  for (const m of activas) {
    objetivo += m.objetivo;
    if (m.avance === null) incompleto = true;
    else avance += m.avance;
  }
  return { avance, objetivo, incompleto };
}

/** Cuenta de la meta en la forma de `calcularSaldo`. */
export function cuentaConSaldo(cuenta: CuentaDeMeta): CuentaConSaldo {
  return { id: cuenta.id, tipo: cuenta.tipo as TipoCuenta, saldoInicial: cuenta.saldoInicial };
}
