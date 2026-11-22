/**
 * Movimientos de capital de un préstamo (SPEC 08): clase, capital corrido,
 * totales, `desde`, `cierre`, último abono e historial. Todo se deriva en
 * cada lectura (RN-01).
 *
 * Capital = saldo de la cuenta del préstamo (`calcularSaldo`), siempre con su
 * naturaleza: en un otorgado (activo) una entrada lo aumenta; en una
 * contraída (pasivo), una salida.
 */
import { efectoEnSaldo } from "../cuenta/naturaleza.js";
import { calcularSaldo } from "../cuenta/saldo.js";
import type { Ref } from "../movimiento/movimiento.js";
import type {
  Cierre,
  ClaseMovimientoPrestamo,
  FilaHistorial,
  InteresDePrestamo,
  MovimientoDePrestamo,
  Prestamo,
  TotalesPrestamo,
} from "./prestamo.js";

type PrestamoBase = Pick<Prestamo, "id" | "tipo">;
type Ordenable = { fecha: string; creadoEn: Date };

/** Por `fecha` asc y luego por `creado_en` asc. */
export function porFecha<T extends Ordenable>(x: T, y: T): number {
  if (x.fecha !== y.fecha) return x.fecha < y.fecha ? -1 : 1;
  return x.creadoEn.getTime() - y.creadoEn.getTime();
}

type EfectoDeCapital = Pick<MovimientoDePrestamo, "monto" | "cuentaOrigenId" | "cuentaDestinoId">;

/** Efecto con signo del movimiento sobre el capital del préstamo. */
export function efectoEnCapital(prestamo: PrestamoBase, m: EfectoDeCapital): bigint {
  let efecto = 0n;
  if (m.cuentaDestinoId === prestamo.id) efecto += efectoEnSaldo(prestamo.tipo, "entrada", m.monto);
  if (m.cuentaOrigenId === prestamo.id) efecto += efectoEnSaldo(prestamo.tipo, "salida", m.monto);
  return efecto;
}

/**
 * - `condonacion`: gasto con origen = préstamo, en un otorgado.
 * - `desembolso`: aumenta el capital (otorgado: destino = préstamo; contraída:
 *   origen = préstamo).
 * - `abono`: lo reduce.
 *
 * Un movimiento atípico (creado fuera de la API) se clasifica por su efecto.
 */
export function clasificar(
  prestamo: PrestamoBase,
  m: Pick<MovimientoDePrestamo, "tipo" | "monto" | "cuentaOrigenId" | "cuentaDestinoId">,
): Exclude<ClaseMovimientoPrestamo, "interes"> {
  if (
    m.tipo === "gasto" &&
    m.cuentaOrigenId === prestamo.id &&
    prestamo.tipo === "prestamo_otorgado"
  ) {
    return "condonacion";
  }
  return efectoEnCapital(prestamo, m) > 0n ? "desembolso" : "abono";
}

/** Capital pendiente: saldo de la cuenta con todos sus movimientos (RN-01). */
export function capitalPendiente(
  prestamo: PrestamoBase,
  movimientos: readonly EfectoDeCapital[],
): bigint {
  return calcularSaldo({ id: prestamo.id, tipo: prestamo.tipo, saldoInicial: 0n }, movimientos);
}

/**
 * Fecha del primer movimiento de capital posterior a la última vez que el
 * capital corrido quedó en 0. `null` si el préstamo está saldado.
 */
export function desde(
  prestamo: PrestamoBase,
  movimientos: readonly MovimientoDePrestamo[],
): string | null {
  const ordenados = movimientos.toSorted(porFecha);
  let corrido = 0n;
  let inicio: string | null = null;
  for (const m of ordenados) {
    if (corrido === 0n) inicio = m.fecha;
    corrido += efectoEnCapital(prestamo, m);
  }
  return corrido === 0n ? null : inicio;
}

/**
 * Solo en un préstamo saldado con movimientos: fecha del último movimiento de
 * capital y su forma (`pago` si fue abono, `condonacion` si fue condonación).
 */
export function cierre(
  prestamo: PrestamoBase,
  movimientos: readonly MovimientoDePrestamo[],
): Cierre | null {
  if (movimientos.length === 0 || capitalPendiente(prestamo, movimientos) !== 0n) return null;
  const ultimo = movimientos.toSorted(porFecha).at(-1)!;
  return {
    fecha: ultimo.fecha,
    forma: clasificar(prestamo, ultimo) === "condonacion" ? "condonacion" : "pago",
  };
}

/** Fecha del último abono, o del último interés si es posterior; `null` si no hay. */
export function ultimoAbono(
  prestamo: PrestamoBase,
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly Pick<InteresDePrestamo, "fecha">[],
): string | null {
  let ultima: string | null = null;
  for (const m of movimientos) {
    if (clasificar(prestamo, m) === "abono" && (ultima === null || m.fecha > ultima)) {
      ultima = m.fecha;
    }
  }
  for (const i of intereses) {
    if (ultima === null || i.fecha > ultima) ultima = i.fecha;
  }
  return ultima;
}

export function totales(
  prestamo: PrestamoBase,
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly Pick<InteresDePrestamo, "monto">[],
): TotalesPrestamo {
  let totalPrestado = 0n;
  let abonos = 0n;
  let totalCondonado = 0n;
  for (const m of movimientos) {
    const efecto = efectoEnCapital(prestamo, m);
    const magnitud = efecto < 0n ? -efecto : efecto;
    switch (clasificar(prestamo, m)) {
      case "desembolso":
        totalPrestado += magnitud;
        break;
      case "abono":
        abonos += magnitud;
        break;
      case "condonacion":
        totalCondonado += magnitud;
        break;
    }
  }
  const interesesCobrados = intereses.reduce((suma, i) => suma + i.monto, 0n);
  return {
    totalPrestado,
    totalAbonado: abonos + totalCondonado,
    totalCondonado,
    interesesCobrados,
  };
}

/** La cuenta propia de un movimiento de capital: la que no es el préstamo. */
function cuentaPropia(prestamo: PrestamoBase, m: MovimientoDePrestamo): Ref | null {
  if (m.cuentaOrigenId !== null && m.cuentaOrigenId !== prestamo.id) return m.cuentaOrigen;
  if (m.cuentaDestinoId !== null && m.cuentaDestinoId !== prestamo.id) return m.cuentaDestino;
  return null;
}

/**
 * Una fila por movimiento de capital. Cada interés se une a la fila de su
 * `movimientoCapitalId`; sin capital (o si el capital ya no está), va como
 * fila propia de clase `interes`. Por fecha y luego `creadoEn`; `saldoCapital`
 * es el capital corrido tras la fila.
 */
export function historial(
  prestamo: PrestamoBase,
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly InteresDePrestamo[],
): FilaHistorial[] {
  const idsCapital = new Set(movimientos.map((m) => m.id));
  const unidos = new Map<string, InteresDePrestamo>();
  const sueltos: InteresDePrestamo[] = [];
  for (const i of intereses) {
    if (i.movimientoCapitalId !== null && idsCapital.has(i.movimientoCapitalId)) {
      unidos.set(i.movimientoCapitalId, i);
    } else {
      sueltos.push(i);
    }
  }

  type Entrada =
    | { fecha: string; creadoEn: Date; capital: MovimientoDePrestamo }
    | { fecha: string; creadoEn: Date; interes: InteresDePrestamo };
  const entradas: Entrada[] = [
    ...movimientos.map((m) => ({ fecha: m.fecha, creadoEn: m.creadoEn, capital: m })),
    ...sueltos.map((i) => ({ fecha: i.fecha, creadoEn: i.creadoEn, interes: i })),
  ].toSorted(porFecha);

  let corrido = 0n;
  return entradas.map((e): FilaHistorial => {
    if ("interes" in e) {
      return {
        fecha: e.fecha,
        clase: "interes",
        cuenta: e.interes.cuenta,
        categoria: null,
        capital: 0n,
        interes: e.interes.monto,
        saldoCapital: corrido,
        movimientoId: null,
        movimientoInteresId: e.interes.movimientoId,
      };
    }
    const m = e.capital;
    const efecto = efectoEnCapital(prestamo, m);
    corrido += efecto;
    const interes = unidos.get(m.id);
    const clase = clasificar(prestamo, m);
    return {
      fecha: m.fecha,
      clase,
      cuenta: clase === "condonacion" ? null : cuentaPropia(prestamo, m),
      categoria: m.categoria,
      capital: efecto,
      interes: interes?.monto ?? 0n,
      saldoCapital: corrido,
      movimientoId: m.id,
      movimientoInteresId: interes?.movimientoId ?? null,
    };
  });
}
