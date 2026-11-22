/**
 * Cuándo se consulta al proveedor y cuándo un precio automático está vencido
 * (SPEC 11). El vencimiento se cuenta desde la última consulta, haya
 * respondido o no, y no desde la fecha del precio: así un fin de semana o una
 * fuente caída no consultan en cada lectura.
 */
import type { Activo, Precio } from "../inversion/inversion.js";
import { LOTE_MAXIMO, VENCIMIENTO_MINUTOS, VENTANA_DIAS } from "./precio.js";

export type ActivoConsultable = Pick<Activo, "cotizacion" | "clase" | "consultadoEn">;

const MINUTO = 60_000;

/** Ventana de vencimiento del activo; sin clase, la más corta. */
function ventanaMinutos(activo: ActivoConsultable): number {
  return activo.clase === null ? VENCIMIENTO_MINUTOS.cripto : VENCIMIENTO_MINUTOS[activo.clase];
}

/**
 * Un activo manual nunca se consulta; uno automático sin consulta previa,
 * siempre. Si no, cuando pasaron 60 min (acción o ETF) o 15 min (cripto)
 * desde la última consulta.
 */
export function debeConsultar(activo: ActivoConsultable, ahora: Date): boolean {
  if (activo.cotizacion !== "automatica") return false;
  if (activo.consultadoEn === null) return true;
  return ahora.getTime() - activo.consultadoEn.getTime() >= ventanaMinutos(activo) * MINUTO;
}

/**
 * De los activos que hay que consultar, los `LOTE_MAXIMO` con la consulta más
 * antigua, los nunca consultados primero. El resto espera a la siguiente lectura.
 */
export function loteAConsultar<T extends ActivoConsultable>(
  activos: readonly T[],
  ahora: Date,
): T[] {
  const antiguedad = (a: T) => a.consultadoEn?.getTime() ?? Number.NEGATIVE_INFINITY;
  return activos
    .filter((a) => debeConsultar(a, ahora))
    .toSorted((x, y) => antiguedad(x) - antiguedad(y))
    .slice(0, LOTE_MAXIMO);
}

/**
 * Tolerancia entre la última consulta y el instante del precio vigente para
 * darlo por traído en esa consulta. Un intradía de cripto es de minutos: la
 * ventana de 15 min. Un cierre puede tener días si hubo fin de semana o
 * festivo: la ventana de 7 días del histórico.
 */
const TOLERANCIA_MS = {
  intradia: VENCIMIENTO_MINUTOS.cripto * MINUTO,
  cierre: VENTANA_DIAS * 24 * 60 * MINUTO,
} as const;

/**
 * El activo es automático y la última consulta no trajo precio: el vigente
 * es el primer precio manual, o es anterior a la última consulta en más de su
 * tolerancia. Sin consulta todavía (recién creado o recién pasado a
 * automático), no está vencido: la siguiente lectura lo trae.
 */
export function precioVencido(
  activo: Pick<Activo, "cotizacion" | "consultadoEn">,
  vigente: Pick<Precio, "origen" | "cotizadoEn"> | null,
): boolean {
  if (activo.cotizacion !== "automatica" || activo.consultadoEn === null) return false;
  if (vigente === null || vigente.origen === "manual") return true;
  const distancia = activo.consultadoEn.getTime() - vigente.cotizadoEn.getTime();
  return distancia > TOLERANCIA_MS[vigente.origen];
}
