/**
 * Intereses causados (SPEC 08): interés simple, mes de 30 días, sobre los
 * tramos de capital, desde el último interés cobrado. Se derivan en cada
 * lectura; solo se guarda el interés cobrado o pagado.
 */
import { diasEntre } from "../fecha/mes.js";
import { capitalPendiente, efectoEnCapital } from "./historial.js";
import type { InteresDePrestamo, MovimientoDePrestamo, Prestamo } from "./prestamo.js";

/** 30 días × 10000 (centésimas de punto por unidad). */
const DIVISOR = 300000n;

type PrestamoTasa = Pick<Prestamo, "id" | "tipo" | "tasaCpb">;
type Capital = Pick<MovimientoDePrestamo, "fecha" | "monto" | "cuentaOrigenId" | "cuentaDestinoId">;

/** División entera con redondeo al peso, mitad hacia arriba (n ≥ 0). */
function redondear(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (2n * d);
}

/**
 * Causados a la fecha F:
 * - 0 si el capital corrido a F es 0 (N-69) o si la tasa es 0.
 * - Ancla A: el último interés cobrado con fecha ≤ F; sin ninguno, el primer
 *   movimiento de capital.
 * - Σ_{d ∈ [A, F)} capital(d) × tasa / 300000, con capital(d) = Σ efectos con
 *   fecha ≤ d. Se acumula por tramos (capital × días) y se divide una sola vez.
 *
 * Un interés cobrado salda todo lo causado hasta su fecha. Una condonación
 * no mueve el ancla: los causados siguen sobre el capital que queda (N-70).
 */
export function causadosEn(
  prestamo: PrestamoTasa,
  movimientos: readonly Capital[],
  intereses: readonly Pick<InteresDePrestamo, "fecha">[],
  fecha: string,
): bigint {
  if (prestamo.tasaCpb === 0) return 0n;
  const hastaF = movimientos.filter((m) => m.fecha <= fecha);
  if (hastaF.length === 0 || capitalPendiente(prestamo, hastaF) <= 0n) return 0n;

  let ancla: string | null = null;
  for (const i of intereses) {
    if (i.fecha <= fecha && (ancla === null || i.fecha > ancla)) ancla = i.fecha;
  }
  if (ancla === null) {
    ancla = hastaF.reduce((min, m) => (m.fecha < min ? m.fecha : min), hastaF[0]!.fecha);
  }

  // Capital al inicio del ancla y cambios posteriores, agrupados por día.
  let capital = 0n;
  const cambios = new Map<string, bigint>();
  for (const m of hastaF) {
    const efecto = efectoEnCapital(prestamo, m);
    if (m.fecha <= ancla) capital += efecto;
    else cambios.set(m.fecha, (cambios.get(m.fecha) ?? 0n) + efecto);
  }

  let acumulado = 0n;
  let tramo = ancla;
  for (const dia of [...cambios.keys()].toSorted()) {
    if (dia >= fecha) break;
    acumulado += capital * BigInt(diasEntre(tramo, dia));
    capital += cambios.get(dia)!;
    tramo = dia;
  }
  acumulado += capital * BigInt(diasEntre(tramo, fecha));

  const numerador = acumulado * BigInt(prestamo.tasaCpb);
  return numerador <= 0n ? 0n : redondear(numerador, DIVISOR);
}

export type PropuestaAbono = {
  interes: bigint;
  capital: bigint;
  interesesCausados: bigint;
  capitalPendiente: bigint;
};

/**
 * Reparte el monto M de un abono en la fecha F: primero los causados a F,
 * el resto a capital. Si el capital supera lo pendiente, `ABONO_EXCEDE_CAPITAL`.
 */
export function propuestaAbono(
  prestamo: PrestamoTasa,
  movimientos: readonly Capital[],
  intereses: readonly Pick<InteresDePrestamo, "fecha">[],
  fecha: string,
  monto: bigint,
): PropuestaAbono | { error: "ABONO_EXCEDE_CAPITAL" } {
  const interesesCausados = causadosEn(prestamo, movimientos, intereses, fecha);
  const pendiente = capitalPendiente(prestamo, movimientos);
  const interes = monto < interesesCausados ? monto : interesesCausados;
  const capital = monto - interes;
  if (capital > pendiente) return { error: "ABONO_EXCEDE_CAPITAL" };
  return { interes, capital, interesesCausados, capitalPendiente: pendiente };
}
