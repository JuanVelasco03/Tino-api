/**
 * Patrimonio a una fecha (SPEC 06). Se reconstruye en cada consulta desde las
 * cuentas, el historial de saldo inicial y los movimientos: nunca se guarda
 * (RN-01). Todas las fechas son días "YYYY-MM-DD" en la zona del usuario.
 *
 * Una inversión (SPEC 10) aporta su valor de mercado en COP, con la TRM de la
 * fecha. El puente separa su revaluación del resto de `otrosCambios`.
 */
import { calcularSaldo } from "../cuenta/saldo.js";
import { naturalezaDe } from "../cuenta/naturaleza.js";
import { mesAnterior, mesesAnteriores, ultimoDia } from "../fecha/mes.js";
import { TIPO_INVERSION } from "../inversion/inversion.js";
import { aCop, valorarInversion } from "../inversion/valoracion.js";
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

/** TRM en centavos de peso de `fecha`, o `null` si no se obtuvo. */
function trmEn(datos: DatosPatrimonio, fecha: string): bigint | null {
  return datos.trm?.get(fecha) ?? null;
}

/** Inversiones creadas hasta `fecha`. */
function inversionesEn(datos: DatosPatrimonio, fecha: string): CuentaPatrimonio[] {
  return datos.cuentas.filter((c) => c.tipo === TIPO_INVERSION && c.creadaEl <= fecha);
}

/**
 * Valor de mercado en COP de una inversión en `fecha`, con la TRM de esa
 * fecha. Una inversión USD sin TRM aporta 0. `hastaLaFecha`: los movimientos
 * con fecha ≤ `fecha`.
 */
function valorCopEn(
  datos: DatosPatrimonio,
  cuenta: CuentaPatrimonio,
  hastaLaFecha: DatosPatrimonio["movimientos"],
  fecha: string,
): bigint {
  const saldoCuenta = calcularSaldo(
    {
      id: cuenta.id,
      tipo: cuenta.tipo,
      saldoInicial: saldoInicialVigente(cuenta, datos.cambios, fecha),
    },
    hastaLaFecha,
  );
  const inversion = datos.inversiones?.get(cuenta.id);
  const { valorMercado } = valorarInversion(
    {
      saldoCuenta,
      activos: inversion?.activos ?? [],
      operaciones: inversion?.operaciones ?? [],
      precios: inversion?.precios ?? [],
    },
    fecha,
  );
  return aCop(valorMercado, cuenta.moneda, trmEn(datos, fecha)) ?? 0n;
}

/**
 * Patrimonio en `fecha`: cada cuenta creada hasta ese día (archivadas
 * incluidas) aporta su saldo inicial vigente más el efecto de sus movimientos
 * con fecha ≤ `fecha`. Los activos suman y los pasivos restan (RN-02). Una
 * inversión aporta en su lugar su valor de mercado en COP.
 */
export function patrimonioEn(datos: DatosPatrimonio, fecha: string): bigint {
  const hastaLaFecha = datos.movimientos.filter((m) => m.fecha <= fecha);
  let patrimonio = 0n;
  for (const cuenta of datos.cuentas) {
    if (cuenta.creadaEl > fecha) continue;
    if (cuenta.tipo === TIPO_INVERSION) {
      patrimonio += valorCopEn(datos, cuenta, hastaLaFecha, fecha);
      continue;
    }
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

/** V(F): suma del valor de mercado en COP de las inversiones en `fecha`. */
export function valorInversionesEn(datos: DatosPatrimonio, fecha: string): bigint {
  const hastaLaFecha = datos.movimientos.filter((m) => m.fecha <= fecha);
  return inversionesEn(datos, fecha).reduce(
    (suma, cuenta) => suma + valorCopEn(datos, cuenta, hastaLaFecha, fecha),
    0n,
  );
}

/**
 * Aportes a `fecha`: lo que ya se tenía al empezar a usar Tino. Por cada
 * inversión creada hasta ese día, su saldo inicial vigente a la TRM de su
 * creación, más sus operaciones `inicial` con fecha ≤ F, cada una a la TRM de
 * su fecha. Sin TRM, 0.
 */
export function aportesEn(datos: DatosPatrimonio, fecha: string): bigint {
  let aportes = 0n;
  for (const cuenta of inversionesEn(datos, fecha)) {
    const inicial = saldoInicialVigente(cuenta, datos.cambios, fecha);
    aportes += aCop(inicial, cuenta.moneda, trmEn(datos, cuenta.creadaEl)) ?? 0n;
    for (const op of datos.inversiones?.get(cuenta.id)?.operaciones ?? []) {
      if (op.clase !== "inicial" || op.fecha > fecha) continue;
      aportes += aCop(op.monto, cuenta.moneda, trmEn(datos, op.fecha)) ?? 0n;
    }
  }
  return aportes;
}

/**
 * Flujos entre dos fechas: transferencias con fecha en `(desde, hasta]` entre
 * una inversión y una cuenta que no lo es, por su lado COP. Hacia la inversión
 * `+monto` (el origen es COP); desde la inversión `−(montoDestino ?? monto)`.
 * Entre dos inversiones son internas y no cuentan.
 */
export function flujosEntre(datos: DatosPatrimonio, desde: string, hasta: string): bigint {
  const inversiones = new Set(
    datos.cuentas.filter((c) => c.tipo === TIPO_INVERSION).map((c) => c.id),
  );
  const esInversion = (id: string | null) => id !== null && inversiones.has(id);
  let flujos = 0n;
  for (const m of datos.movimientos) {
    if (m.tipo !== "transferencia" || m.fecha <= desde || m.fecha > hasta) continue;
    const haciaInversion = esInversion(m.cuentaDestinoId);
    const desdeInversion = esInversion(m.cuentaOrigenId);
    if (haciaInversion && !desdeInversion) flujos += m.monto;
    if (desdeInversion && !haciaInversion) flujos -= m.montoDestino ?? m.monto;
  }
  return flujos;
}

/**
 * Revaluación de las inversiones entre dos fechas:
 * `[V(hasta) − V(desde)] − [aportes(hasta) − aportes(desde)] − flujos`.
 * Incluye la variación de precio, la del dólar y la ganancia realizada.
 */
export function revaluacionEntre(datos: DatosPatrimonio, desde: string, hasta: string): bigint {
  const valor = valorInversionesEn(datos, hasta) - valorInversionesEn(datos, desde);
  const aportes = aportesEn(datos, hasta) - aportesEn(datos, desde);
  return valor - aportes - flujosEntre(datos, desde, hasta);
}

/**
 * Fechas cuya TRM necesita el patrimonio de las inversiones USD: las de la
 * serie, los cierres de `M−1` y de `mes`, la creación de cada inversión USD y
 * la fecha de sus operaciones `inicial`. Vacío sin inversiones USD: entonces
 * no se consulta la TRM.
 */
export function fechasConTrm(datos: DatosPatrimonio, hoy: string, mes: string): string[] {
  const usd = datos.cuentas.filter((c) => c.tipo === TIPO_INVERSION && c.moneda === "USD");
  if (usd.length === 0) return [];
  const fechas = new Set([
    ...mesesAnteriores(hoy.slice(0, 7), MESES_SERIE).map(ultimoDia),
    hoy,
    ultimoDia(mesAnterior(mes)),
    ultimoDia(mes),
  ]);
  for (const cuenta of usd) {
    fechas.add(cuenta.creadaEl);
    for (const op of datos.inversiones?.get(cuenta.id)?.operaciones ?? []) {
      if (op.clase === "inicial") fechas.add(op.fecha);
    }
  }
  return [...fechas].toSorted();
}

/**
 * Fechas en que el patrimonio valora las inversiones: los cierres de la serie
 * y del puente de `mes`, y hoy. Solo las que no son futuras: ahí los precios
 * automáticos pasados que hay que completar (SPEC 11).
 */
export function fechasDePrecios(hoy: string, mes: string): string[] {
  const fechas = new Set([
    ...mesesAnteriores(hoy.slice(0, 7), MESES_SERIE).map(ultimoDia),
    hoy,
    ultimoDia(mesAnterior(mes)),
    ultimoDia(mes),
  ]);
  return [...fechas].filter((f) => f <= hoy).toSorted();
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
 * `revaluacion` es la de las inversiones (SPEC 10). `otrosCambios` es el
 * residuo (cierre − anterior − resultado − revaluacion), así que el puente
 * siempre cuadra: recoge saldos iniciales de cuentas nuevas, ediciones de
 * saldo inicial y movimientos fechados antes de crear su cuenta.
 */
export function cambioDelMes(datos: DatosPatrimonio, mes: string, resultado: bigint): CambioDelMes {
  const fechaAnterior = ultimoDia(mesAnterior(mes));
  const fechaCierre = ultimoDia(mes);
  const patrimonioAnterior = patrimonioEn(datos, fechaAnterior);
  const patrimonioCierre = patrimonioEn(datos, fechaCierre);
  const revaluacion = revaluacionEntre(datos, fechaAnterior, fechaCierre);
  return {
    fechaAnterior,
    fechaCierre,
    patrimonioAnterior,
    resultado,
    revaluacion,
    otrosCambios: patrimonioCierre - patrimonioAnterior - resultado - revaluacion,
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
