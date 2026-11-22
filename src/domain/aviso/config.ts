/**
 * Configuración de los avisos por tipo (SPEC 12): la efectiva (filas guardadas
 * más los valores por defecto) y la validación de un cambio.
 */
import {
  CONFIG_POR_DEFECTO,
  OPCIONES_DIAS,
  TIPOS_AVISO,
  type ConfigAviso,
  type TipoAviso,
} from "./aviso.js";

export type CambioConfig = { activo?: boolean; dias?: number };

export type ErrorConfig = { codigo: "ANTELACION_INVALIDA" | "SIN_CAMBIOS"; campo?: string };

export type ResultadoCambio = { ok: true; config: ConfigAviso } | { ok: false; error: ErrorConfig };

export function porDefecto(tipo: TipoAviso): ConfigAviso {
  return { tipo, ...CONFIG_POR_DEFECTO[tipo] };
}

/** Un tipo por cada uno de `TIPOS_AVISO`, en ese orden: su fila o, sin fila, el valor por defecto. */
export function configEfectiva(filas: readonly ConfigAviso[]): ConfigAviso[] {
  const porTipo = new Map(filas.map((f) => [f.tipo, f]));
  return TIPOS_AVISO.map((tipo) => {
    const fila = porTipo.get(tipo);
    return fila ? { tipo, activo: fila.activo, dias: fila.dias } : porDefecto(tipo);
  });
}

export function opcionesDe(tipo: TipoAviso): readonly number[] {
  return OPCIONES_DIAS[tipo];
}

/**
 * - `dias`, si viene, está en las opciones del tipo (ANTELACION_INVALIDA);
 * - si viene `dias` sin `activo`, el tipo queda activo (N-33);
 * - sin campos, SIN_CAMBIOS.
 */
export function validarCambioConfig(actual: ConfigAviso, cambio: CambioConfig): ResultadoCambio {
  if (cambio.activo === undefined && cambio.dias === undefined) {
    return { ok: false, error: { codigo: "SIN_CAMBIOS" } };
  }
  if (cambio.dias !== undefined && !opcionesDe(actual.tipo).includes(cambio.dias)) {
    return { ok: false, error: { codigo: "ANTELACION_INVALIDA", campo: "dias" } };
  }
  return {
    ok: true,
    config: {
      tipo: actual.tipo,
      activo: cambio.activo ?? (cambio.dias !== undefined ? true : actual.activo),
      dias: cambio.dias ?? actual.dias,
    },
  };
}
