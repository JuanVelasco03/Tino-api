/**
 * Ocurrencias de una plantilla (SPEC 07): estado, importe mostrado, último
 * confirmado, bandeja y próximo vencimiento.
 *
 * Una ocurrencia es `recurrenteId` + `vencimiento`. Las abiertas salen del
 * calendario y reflejan siempre la plantilla actual. Las cerradas salen de su
 * cierre: si se edita el calendario o se reanuda la plantilla, las abiertas
 * anteriores desaparecen y los cierres se quedan.
 */
import { sumarDias } from "../fecha/mes.js";
import { vencimientos } from "./calendario.js";
import type { Cierre, EstadoOcurrencia, Ocurrencia, Recurrente } from "./recurrente.js";

/** Ventana fija de la bandeja (N-07). */
export const VENTANA_DIAS = 7;

/** Horizonte para buscar el próximo vencimiento: más de un año (anual) más la ventana. */
const HORIZONTE_DIAS = 800;

const ABIERTAS: readonly EstadoOcurrencia[] = ["vencida", "por_confirmar", "programada"];
const EN_BANDEJA: readonly EstadoOcurrencia[] = ["vencida", "por_confirmar"];

export const esAbierta = (o: Ocurrencia): boolean => ABIERTAS.includes(o.estado);
export const estaEnBandeja = (o: Ocurrencia): boolean => EN_BANDEJA.includes(o.estado);

const compararTexto = (a: string, b: string) => a.localeCompare(b, "es");

export function estadoDe(
  vencimiento: string,
  cierre: Cierre | undefined,
  hoy: string,
): EstadoOcurrencia {
  if (cierre?.estado === "confirmada") return "pagada";
  if (cierre?.estado === "omitida") return "omitida";
  if (vencimiento < hoy) return "vencida";
  if (vencimiento <= sumarDias(hoy, VENTANA_DIAS)) return "por_confirmar";
  return "programada";
}

/** El cierre confirmado con mayor vencimiento, con el monto actual de su movimiento. */
export function ultimoConfirmado(
  recurrenteId: string,
  cierres: readonly Cierre[],
): { monto: bigint; vencimiento: string } | null {
  let ultimo: Cierre | null = null;
  for (const c of cierres) {
    if (c.recurrenteId !== recurrenteId || c.estado !== "confirmada") continue;
    if (c.montoMovimiento === null) continue;
    if (ultimo === null || c.vencimiento > ultimo.vencimiento) ultimo = c;
  }
  return ultimo === null
    ? null
    : { monto: ultimo.montoMovimiento!, vencimiento: ultimo.vencimiento };
}

/**
 * Importe mostrado: una pagada muestra el monto de su movimiento. El resto, el
 * de la plantilla si es fija; si es variable, el del último confirmado o, sin
 * ninguno, el de la plantilla (estimado).
 */
function ocurrencia(
  r: Recurrente,
  vencimiento: string,
  cierre: Cierre | undefined,
  hoy: string,
  estimadoVariable: bigint,
): Ocurrencia {
  const estado = estadoDe(vencimiento, cierre, hoy);
  const pagada = estado === "pagada";
  return {
    recurrenteId: r.id,
    vencimiento,
    estado,
    monto: pagada ? cierre!.montoMovimiento! : r.variable ? estimadoVariable : r.monto,
    estimado: r.variable && !pagada,
    movimientoId: pagada ? cierre!.movimientoId : null,
  };
}

/** Ocurrencias de la plantilla entre `desde` y `hasta` (inclusive), por vencimiento. */
export function ocurrenciasEntre(
  r: Recurrente,
  cierres: readonly Cierre[],
  hoy: string,
  desde: string,
  hasta: string,
): Ocurrencia[] {
  const propios = cierres.filter((c) => c.recurrenteId === r.id);
  const porFecha = new Map(propios.map((c) => [c.vencimiento, c]));
  const estimado = ultimoConfirmado(r.id, propios)?.monto ?? r.monto;

  const fechas = new Set(vencimientos(r, desde, hasta));
  for (const c of propios) {
    if (c.vencimiento >= desde && c.vencimiento <= hasta) fechas.add(c.vencimiento);
  }
  return [...fechas].sort().map((v) => ocurrencia(r, v, porFecha.get(v), hoy, estimado));
}

/** La ocurrencia de la plantilla en `vencimiento`, si existe (abierta o cerrada). */
export function ocurrenciaEn(
  r: Recurrente,
  cierres: readonly Cierre[],
  hoy: string,
  vencimiento: string,
): Ocurrencia | null {
  return ocurrenciasEntre(r, cierres, hoy, vencimiento, vencimiento)[0] ?? null;
}

/** Ordena por vencimiento ascendente y luego por concepto de la plantilla. */
function porVencimientoYConcepto(
  recurrentes: readonly Recurrente[],
): (a: Ocurrencia, b: Ocurrencia) => number {
  const conceptos = new Map(recurrentes.map((r) => [r.id, r.concepto]));
  return (a, b) =>
    a.vencimiento.localeCompare(b.vencimiento) ||
    compararTexto(conceptos.get(a.recurrenteId) ?? "", conceptos.get(b.recurrenteId) ?? "");
}

/** Bandeja: ocurrencias vencidas y por confirmar de cualquier mes, por vencimiento y concepto. */
export function bandeja(
  recurrentes: readonly Recurrente[],
  cierres: readonly Cierre[],
  hoy: string,
): Ocurrencia[] {
  const hasta = sumarDias(hoy, VENTANA_DIAS);
  return recurrentes
    .flatMap((r) => ocurrenciasEntre(r, cierres, hoy, r.generarDesde, hasta))
    .filter(estaEnBandeja)
    .sort(porVencimientoYConcepto(recurrentes));
}

/** La primera ocurrencia sin cierre con vencimiento >= hoy; null si no hay. */
export function proximoVencimiento(
  r: Recurrente,
  cierres: readonly Cierre[],
  hoy: string,
): string | null {
  const cerrados = new Set(
    cierres.filter((c) => c.recurrenteId === r.id).map((c) => c.vencimiento),
  );
  return vencimientos(r, hoy, sumarDias(hoy, HORIZONTE_DIAS)).find((v) => !cerrados.has(v)) ?? null;
}

export type ClaveOrden = { concepto: string; primeraDelMes: string | null; proximo: string | null };

/**
 * Orden de las plantillas: por el vencimiento de su primera ocurrencia del mes;
 * después las que no tienen ocurrencias en el mes, por próximo vencimiento
 * (null al final). Desempate por concepto.
 */
export function compararPlantillas(a: ClaveOrden, b: ClaveOrden): number {
  const grupo = (x: ClaveOrden) => (x.primeraDelMes !== null ? 0 : x.proximo !== null ? 1 : 2);
  const fecha = (x: ClaveOrden) => x.primeraDelMes ?? x.proximo ?? "";
  return (
    grupo(a) - grupo(b) || fecha(a).localeCompare(fecha(b)) || compararTexto(a.concepto, b.concepto)
  );
}
