/**
 * Avisos de recurrentes por confirmar (SPEC 12, N-36). Uno por ocurrencia
 * (SPEC 07) de cada plantilla no pausada, `dias` antes de su vencimiento.
 */
import { fechaLocal } from "../fecha/fecha-local.js";
import { restarDias, sumarDias } from "../fecha/mes.js";
import { ocurrenciasEntre } from "../recurrente/ocurrencias.js";
import type { Cierre, Recurrente } from "../recurrente/recurrente.js";
import { HISTORIAL_DIAS, type AvisoRecurrente, type Contexto } from "./aviso.js";
import { armarClave } from "./clave.js";
import { disparo } from "./lista.js";

export type PlantillaConFecha = Recurrente & { creadoEn: Date };
export type CierreConFecha = Cierre & { creadoEn: Date };

/**
 * - Solo plantillas no pausadas.
 * - Ocurrencias con vencimiento V en `[hoy − HISTORIAL_DIAS, hoy + dias]`; el
 *   día del aviso es `V − dias`.
 * - Resuelto si la ocurrencia está pagada u omitida; la resolución lleva la
 *   forma y la fecha local del cierre.
 * - Monto: el importe mostrado, con su `estimado`.
 */
export function avisosDeRecurrentes(
  plantillas: readonly PlantillaConFecha[],
  cierres: readonly CierreConFecha[],
  dias: number,
  ctx: Contexto,
): AvisoRecurrente[] {
  const desde = restarDias(ctx.hoy, HISTORIAL_DIAS);
  const hasta = sumarDias(ctx.hoy, dias);
  const cierrePorClave = new Map(cierres.map((c) => [`${c.recurrenteId}|${c.vencimiento}`, c]));

  return plantillas
    .filter((p) => p.pausadaDesde === null)
    .flatMap((p) =>
      ocurrenciasEntre(p, cierres, ctx.hoy, desde, hasta).map((o): AvisoRecurrente => {
        const cierre = cierrePorClave.get(`${p.id}|${o.vencimiento}`);
        const resuelto = o.estado === "pagada" || o.estado === "omitida";
        return {
          clave: armarClave("recurrente", p.id, o.vencimiento),
          tipo: "recurrente",
          instante: disparo(restarDias(o.vencimiento, dias), p.creadoEn, ctx.zona),
          resuelto,
          recurrenteId: p.id,
          vencimiento: o.vencimiento,
          monto: o.monto,
          estimado: o.estimado,
          resolucion:
            resuelto && cierre
              ? {
                  forma: o.estado === "pagada" ? "confirmada" : "omitida",
                  fecha: fechaLocal(cierre.creadoEn, ctx.zona),
                }
              : null,
        };
      }),
    );
}
