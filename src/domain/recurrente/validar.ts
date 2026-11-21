/**
 * Validación de plantillas y cierres (SPEC 07). Devuelve el primer error o
 * `null`. Que las cuentas y la categoría existan, sean del usuario y del tipo
 * lo garantiza la base (FK compuestas); las cuentas archivadas las comprueba el
 * servicio.
 */
import { esFechaValida } from "../fecha/mes.js";
import { validarMovimiento, type CodigoErrorMovimiento } from "../movimiento/validar.js";
import { estaEnBandeja } from "./ocurrencias.js";
import {
  MESES_POR_PERIODICIDAD,
  esPeriodicidad,
  type Calendario,
  type Ocurrencia,
  type RecurrenteEntrada,
} from "./recurrente.js";

export const CONCEPTO_MAXIMO = 80;

export type CodigoErrorRecurrente =
  | CodigoErrorMovimiento
  | "CONCEPTO_REQUERIDO"
  | "CONCEPTO_LARGO"
  | "PERIODICIDAD_INVALIDA"
  | "FECHA_INVALIDA"
  | "PRIMER_VENCIMIENTO_PASADO"
  | "ULTIMO_DIA_NO_PERMITIDO";

export type ErrorRecurrente = { codigo: CodigoErrorRecurrente; campo: string };

export type CodigoErrorCierre = "OCURRENCIA_INVALIDA" | "OCURRENCIA_CERRADA";

const error = (codigo: CodigoErrorRecurrente, campo: string): ErrorRecurrente => ({
  codigo,
  campo,
});

type ClaveCalendario = Pick<Calendario, "periodicidad" | "primerVencimiento" | "ultimoDia">;

/** Si un PUT cambia periodicidad, primer vencimiento o «último día», se reinicia el calendario. */
export function cambiaCalendario(actual: ClaveCalendario, nueva: ClaveCalendario): boolean {
  return (
    actual.periodicidad !== nueva.periodicidad ||
    actual.primerVencimiento !== nueva.primerVencimiento ||
    actual.ultimoDia !== nueva.ultimoDia
  );
}

/**
 * Plantilla nueva (`actual` ausente) o reemplazo de `actual`. El primer
 * vencimiento no puede ser anterior a `hoy` al crear ni al cambiar el
 * calendario. La forma de cuentas y categoría por tipo es la de un movimiento
 * (RN-03, RN-05).
 */
export function validarRecurrente(
  e: RecurrenteEntrada,
  hoy: string,
  actual?: ClaveCalendario,
): ErrorRecurrente | null {
  const concepto = e.concepto.trim();
  if (concepto === "") return error("CONCEPTO_REQUERIDO", "concepto");
  if (concepto.length > CONCEPTO_MAXIMO) return error("CONCEPTO_LARGO", "concepto");

  if (!esPeriodicidad(e.periodicidad)) return error("PERIODICIDAD_INVALIDA", "periodicidad");
  if (!esFechaValida(e.primerVencimiento)) return error("FECHA_INVALIDA", "primerVencimiento");
  if (e.ultimoDia && !(e.periodicidad in MESES_POR_PERIODICIDAD)) {
    return error("ULTIMO_DIA_NO_PERMITIDO", "ultimoDia");
  }
  if ((actual === undefined || cambiaCalendario(actual, e)) && e.primerVencimiento < hoy) {
    return error("PRIMER_VENCIMIENTO_PASADO", "primerVencimiento");
  }

  return validarMovimiento({
    tipo: e.tipo,
    monto: e.monto,
    fecha: null,
    descripcion: concepto,
    nota: null,
    cuentaOrigenId: e.cuentaOrigenId,
    cuentaDestinoId: e.cuentaDestinoId,
    categoriaId: e.categoriaId,
    partes: null,
  });
}

/**
 * Confirmar u omitir exige una ocurrencia sin cierre en estado vencida o por
 * confirmar. Una ya cerrada → OCURRENCIA_CERRADA; una que no existe o está
 * programada → OCURRENCIA_INVALIDA.
 */
export function validarCierre(ocurrencia: Ocurrencia | null): CodigoErrorCierre | null {
  if (ocurrencia === null) return "OCURRENCIA_INVALIDA";
  if (ocurrencia.estado === "pagada" || ocurrencia.estado === "omitida") {
    return "OCURRENCIA_CERRADA";
  }
  return estaEnBandeja(ocurrencia) ? null : "OCURRENCIA_INVALIDA";
}
