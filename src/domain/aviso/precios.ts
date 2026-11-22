/**
 * Avisos de precios manuales sin actualizar (SPEC 12, N-39). Solo activos
 * manuales con posición abierta hoy (SPEC 10) en una cuenta no archivada.
 * Uno por cada precio que se quedó más de `dias` días sin uno nuevo.
 */
import { sumarDias } from "../fecha/mes.js";
import type { Activo, Operacion, Precio } from "../inversion/inversion.js";
import { estaAbierta, posicionEn } from "../inversion/posiciones.js";
import { precioVigente } from "../inversion/valoracion.js";
import type { AvisoPrecio, Contexto } from "./aviso.js";
import { armarClave } from "./clave.js";
import { disparo } from "./lista.js";

export type CuentaDeAvisos = { id: string; archivadaEn: Date | null };

/** Por `fecha` y `cotizadoEn` ascendentes. */
function porFechaYCotizacion(x: Precio, y: Precio): number {
  if (x.fecha !== y.fecha) return x.fecha < y.fecha ? -1 : 1;
  return x.cotizadoEn.getTime() - y.cotizadoEn.getTime();
}

/**
 * Serie del activo: sus precios manuales, más el vigente si no es manual, en
 * orden y con uno por fecha (el último).
 */
export function serieManual(activoId: string, precios: readonly Precio[], hoy: string): Precio[] {
  const propios = precios.filter((p) => p.activoId === activoId);
  const serie = propios.filter((p) => p.origen === "manual");
  const vigente = precioVigente(activoId, propios, hoy, "manual")?.vigente;
  if (vigente && vigente.origen !== "manual") serie.push(vigente);
  const porFecha = new Map<string, Precio>();
  for (const p of serie.toSorted(porFechaYCotizacion)) porFecha.set(p.fecha, p);
  return [...porFecha.values()];
}

/**
 * Para cada precio Pᵢ de la serie, el día del aviso es `Pᵢ.fecha + dias`. Hay
 * aviso si no hay Pᵢ₊₁ o si llegó ese día o después; Pᵢ₊₁ lo resuelve. La
 * fuente nace con `cotizadoEn` de Pᵢ. Sin monto.
 */
export function avisosDePrecios(
  cuentas: readonly CuentaDeAvisos[],
  activos: readonly Activo[],
  operaciones: readonly Operacion[],
  precios: readonly Precio[],
  dias: number,
  ctx: Contexto,
): AvisoPrecio[] {
  const vivas = new Set(cuentas.filter((c) => c.archivadaEn === null).map((c) => c.id));
  return activos
    .filter(
      (a) =>
        a.cotizacion === "manual" &&
        vivas.has(a.cuentaId) &&
        estaAbierta(posicionEn(a, operaciones, ctx.hoy)),
    )
    .flatMap((activo) => {
      const serie = serieManual(activo.id, precios, ctx.hoy);
      return serie.flatMap((p, i): AvisoPrecio[] => {
        const siguiente = serie[i + 1];
        const dia = sumarDias(p.fecha, dias);
        if (siguiente && siguiente.fecha < dia) return [];
        return [
          {
            clave: armarClave("precio_manual", activo.id, p.fecha),
            tipo: "precio_manual",
            instante: disparo(dia, p.cotizadoEn, ctx.zona),
            resuelto: siguiente !== undefined,
            activoId: activo.id,
            cuentaId: activo.cuentaId,
            precioFecha: p.fecha,
            resolucion: siguiente ? { fecha: siguiente.fecha } : null,
          },
        ];
      });
    });
}
