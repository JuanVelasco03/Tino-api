/**
 * Ritmo de una meta activa (SPEC 13, N-19 a N-21). La API da cifras; el
 * cliente arma las frases.
 */
import { diasEntre, mesAnterior, mesesEntre, sumarMeses, ultimoDia } from "../fecha/mes.js";
import { dividirRedondeando } from "../inversion/inversion.js";
import { VENTANA_RITMO_MESES, type Ritmo } from "./meta.js";

/** ceil(a ÷ b) con enteros positivos. */
function dividirHaciaArriba(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export type DatosRitmo = {
  /** Guardada: un mes es su último día. */
  fechaMeta: string | null;
  fechaMetaEsMes: boolean;
  falta: bigint;
  hoy: string;
  creadaEl: string;
  /** Avance al cierre de una fecha ≥ `creadaEl` (el ritmo pone 0 antes de la creación). */
  avanceEn: (fecha: string) => bigint;
};

/** Fecha cuyo avance pide el ritmo promedio, además de hoy: el fin del mes anterior a la ventana. */
export function inicioDeVentana(hoy: string, creadaEl: string): { meses: number; base: string } {
  const mesActual = hoy.slice(0, 7);
  const desdeCreacion = mesesEntre(creadaEl.slice(0, 7), mesActual) + 1;
  const meses = Math.max(1, Math.min(VENTANA_RITMO_MESES, desdeCreacion));
  const primerMes = sumarMeses(mesActual, -(meses - 1));
  return { meses, base: ultimoDia(mesAnterior(primerMes)) };
}

/**
 * - Fecha de día: lo que falta y los días que quedan (`max(0, F − hoy)`).
 * - Fecha de mes: lo que falta, los meses calendario que quedan y la cuota
 *   `ceil(falta ÷ meses)`, o `falta` si quedan 0.
 * - Sin fecha: el avance neto promedio de la ventana, redondeado, y el mes
 *   estimado `mes actual + ceil(falta ÷ promedio)` si el promedio es > 0.
 */
export function calcularRitmo(d: DatosRitmo): Ritmo {
  if (d.fechaMeta !== null) {
    const vencida = d.fechaMeta < d.hoy;
    if (d.fechaMetaEsMes) {
      const meses = Math.max(0, mesesEntre(d.hoy.slice(0, 7), d.fechaMeta.slice(0, 7)));
      const cuotaMensual = meses === 0 ? d.falta : dividirHaciaArriba(d.falta, BigInt(meses));
      return { tipo: "meses", falta: d.falta, meses, cuotaMensual, vencida };
    }
    return {
      tipo: "dias",
      falta: d.falta,
      dias: Math.max(0, diasEntre(d.hoy, d.fechaMeta)),
      vencida,
    };
  }

  const { meses, base } = inicioDeVentana(d.hoy, d.creadaEl);
  const anterior = base < d.creadaEl ? 0n : d.avanceEn(base);
  const promedio = dividirRedondeando(d.avanceEn(d.hoy) - anterior, BigInt(meses));
  if (promedio <= 0n) return { tipo: "promedio", promedioMensual: null, mesEstimado: null };
  const mesEstimado = sumarMeses(d.hoy.slice(0, 7), Number(dividirHaciaArriba(d.falta, promedio)));
  return { tipo: "promedio", promedioMensual: promedio, mesEstimado };
}
