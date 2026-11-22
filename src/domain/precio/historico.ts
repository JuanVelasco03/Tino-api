/**
 * Cierres pasados que pide el patrimonio (SPEC 11, N-54). Solo se guardan los
 * de las fechas que se usan, con una consulta por activo y rango: nada de
 * backfill desde la primera operación.
 */
import { restarDias } from "../fecha/mes.js";
import type { Activo, Operacion, Precio } from "../inversion/inversion.js";
import { posicionEn } from "../inversion/posiciones.js";
import { VENTANA_DIAS, type CierreHistorico, type PrecioObtenido } from "./precio.js";

/**
 * Fechas de `fechas` en que el activo, automático, tuvo cantidad > 0 y no
 * tiene ningún precio con fecha en `[F − 7, F]`. Ascendentes y sin repetir.
 * `operaciones` y `precios` pueden traer los de otros activos: se filtran.
 */
export function fechasFaltantes(
  activo: Activo,
  fechas: readonly string[],
  operaciones: readonly Operacion[],
  precios: readonly Precio[],
): string[] {
  if (activo.cotizacion !== "automatica") return [];
  const propios = precios.filter((p) => p.activoId === activo.id);
  const faltantes = new Set<string>();
  for (const fecha of fechas) {
    if (posicionEn(activo, operaciones, fecha).cantidad <= 0n) continue;
    const desde = restarDias(fecha, VENTANA_DIAS);
    if (!propios.some((p) => p.fecha >= desde && p.fecha <= fecha)) faltantes.add(fecha);
  }
  return [...faltantes].toSorted();
}

export type RangoHistorico = { desde: string; hasta: string };

/** Un solo rango por activo: `[min(F) − 7, max(F)]`. `null` sin faltantes. */
export function rangoHistorico(faltantes: readonly string[]): RangoHistorico | null {
  if (faltantes.length === 0) return null;
  const ordenadas = faltantes.toSorted();
  return { desde: restarDias(ordenadas[0]!, VENTANA_DIAS), hasta: ordenadas.at(-1)! };
}

/**
 * De la serie que llegó, el último cierre ≤ F de cada F faltante, como
 * `cierre` con su propia fecha. Dos F con el mismo cierre lo guardan una vez.
 */
export function cierresAGuardar(
  activoId: string,
  faltantes: readonly string[],
  serie: readonly CierreHistorico[],
): PrecioObtenido[] {
  const ordenada = serie.toSorted((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
  const elegidos = new Map<string, CierreHistorico>();
  for (const fecha of faltantes) {
    const cierre = ordenada.findLast((c) => c.fecha <= fecha);
    if (cierre) elegidos.set(cierre.fecha, cierre);
  }
  return [...elegidos.values()]
    .toSorted((x, y) => (x.fecha < y.fecha ? -1 : 1))
    .map((c) => ({
      activoId,
      precio: c.precio,
      fecha: c.fecha,
      origen: "cierre" as const,
      cotizadoEn: c.cotizadoEn,
    }));
}
