/**
 * Patrimonio a una fecha (SPEC 06). Se reconstruye en cada consulta desde las
 * cuentas, el historial de saldo inicial y los movimientos: nunca se guarda
 * (RN-01). Todas las fechas son días "YYYY-MM-DD" en la zona del usuario.
 */
import { calcularSaldo } from "../cuenta/saldo.js";
import { naturalezaDe } from "../cuenta/naturaleza.js";
import { mesAnterior, mesesAnteriores, ultimoDia } from "../fecha/mes.js";
import type {
  CambioDelMes,
  CambioSaldoInicial,
  CuentaPatrimonio,
  DatosPatrimonio,
  PuntoPatrimonio,
} from "./resumen.js";

/** Meses anteriores al actual que entran en la serie (más el punto de hoy). */
const MESES_SERIE = 11;

/**
 * Saldo inicial de la cuenta vigente en `fecha`:
 * - el `valorNuevo` del último cambio con día ≤ fecha;
 * - si no hay, el `valorAnterior` del primer cambio posterior;
 * - sin cambios, el `saldoInicial` actual.
 *
 * `cambios` puede traer los de otras cuentas: se filtran por `cuenta.id`.
 */
export function saldoInicialVigente(
  cuenta: Pick<CuentaPatrimonio, "id" | "saldoInicial">,
  cambios: readonly CambioSaldoInicial[],
  fecha: string,
): bigint {
  const propios = cambios
    .filter((c) => c.cuentaId === cuenta.id)
    .toSorted((x, y) => x.cambiadoEn.getTime() - y.cambiadoEn.getTime());
  const vigente = propios.findLast((c) => c.fecha <= fecha);
  if (vigente) return vigente.valorNuevo;
  const [primero] = propios;
  return primero ? primero.valorAnterior : cuenta.saldoInicial;
}

/**
 * Patrimonio en `fecha`: cada cuenta creada hasta ese día (archivadas
 * incluidas) aporta su saldo inicial vigente más el efecto de sus movimientos
 * con fecha ≤ `fecha`. Los activos suman y los pasivos restan (RN-02).
 */
export function patrimonioEn(datos: DatosPatrimonio, fecha: string): bigint {
  const hastaLaFecha = datos.movimientos.filter((m) => m.fecha <= fecha);
  let patrimonio = 0n;
  for (const cuenta of datos.cuentas) {
    if (cuenta.creadaEl > fecha) continue;
    const saldo = calcularSaldo(
      {
        id: cuenta.id,
        tipo: cuenta.tipo,
        saldoInicial: saldoInicialVigente(cuenta, datos.cambios, fecha),
      },
      hastaLaFecha,
    );
    patrimonio += naturalezaDe(cuenta.tipo) === "activo" ? saldo : -saldo;
  }
  return patrimonio;
}

/** Día de creación de la cuenta más antigua, archivadas incluidas; `null` sin cuentas. */
export function inicio(cuentas: readonly CuentaPatrimonio[]): string | null {
  let primero: string | null = null;
  for (const c of cuentas) {
    if (primero === null || c.creadaEl < primero) primero = c.creadaEl;
  }
  return primero;
}

/**
 * Patrimonio al último día de cada uno de los 11 meses anteriores al de `hoy`,
 * más el de `hoy`. Omite los puntos anteriores al inicio; ascendente, el
 * último es hoy. Sin cuentas, vacía.
 */
export function seriePatrimonio(datos: DatosPatrimonio, hoy: string): PuntoPatrimonio[] {
  const desde = inicio(datos.cuentas);
  if (desde === null) return [];
  const fechas = [...mesesAnteriores(hoy.slice(0, 7), MESES_SERIE).map(ultimoDia), hoy];
  return fechas
    .filter((fecha) => fecha >= desde)
    .map((fecha) => ({ fecha, patrimonio: patrimonioEn(datos, fecha) }));
}

/**
 * Puente del patrimonio del mes `mes`: del cierre de `M−1` al cierre de `M`.
 * `otrosCambios` es el residuo (cierre − anterior − resultado), así que el
 * puente siempre cuadra: recoge saldos iniciales de cuentas nuevas, ediciones
 * de saldo inicial y movimientos fechados antes de crear su cuenta.
 */
export function cambioDelMes(datos: DatosPatrimonio, mes: string, resultado: bigint): CambioDelMes {
  const fechaAnterior = ultimoDia(mesAnterior(mes));
  const fechaCierre = ultimoDia(mes);
  const patrimonioAnterior = patrimonioEn(datos, fechaAnterior);
  const patrimonioCierre = patrimonioEn(datos, fechaCierre);
  return {
    fechaAnterior,
    fechaCierre,
    patrimonioAnterior,
    resultado,
    otrosCambios: patrimonioCierre - patrimonioAnterior - resultado,
    patrimonioCierre,
  };
}

/** Último − primero de la serie; cero con menos de dos puntos. */
export function variacionDeSerie(serie: readonly PuntoPatrimonio[]): bigint {
  const primero = serie[0];
  const ultimo = serie.at(-1);
  if (!primero || !ultimo || serie.length < 2) return 0n;
  return ultimo.patrimonio - primero.patrimonio;
}
