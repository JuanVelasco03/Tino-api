/**
 * Qué TRM rige en una fecha y la regla de respaldo cuando la fuente falla
 * (SPEC 09). Las fechas "YYYY-MM-DD" ordenan igual como texto que como fecha.
 */
import type { Trm, TrmResuelta } from "./trm.js";

/** `vigenteDesde ≤ fecha ≤ vigenteHasta`. */
export function cubre(trm: Trm, fecha: string): boolean {
  return trm.vigenteDesde <= fecha && fecha <= trm.vigenteHasta;
}

/**
 * `guardada`: la fila en caché con mayor `vigenteDesde ≤ fecha`, o `null`.
 * `obtenida`: la que trajo la fuente, o `null` si no se consultó o falló.
 *
 * 1. `guardada` cubre `fecha` → esa, al día.
 * 2. Si no, `obtenida` → esa, al día.
 * 3. Si no, `guardada` → la última conocida, desactualizada.
 * 4. Si no, ninguna.
 */
export function resolverTrm(
  guardada: Trm | null,
  obtenida: Trm | null,
  fecha: string,
): TrmResuelta {
  if (guardada !== null && cubre(guardada, fecha)) return { trm: guardada, desactualizada: false };
  if (obtenida !== null) return { trm: obtenida, desactualizada: false };
  if (guardada !== null) return { trm: guardada, desactualizada: true };
  return { trm: null, desactualizada: false };
}

/** La de mayor `vigenteDesde ≤ fecha`, o `null`. */
export function ultimaHasta(trms: readonly Trm[], fecha: string): Trm | null {
  let ultima: Trm | null = null;
  for (const t of trms) {
    if (t.vigenteDesde <= fecha && (ultima === null || t.vigenteDesde > ultima.vigenteDesde)) {
      ultima = t;
    }
  }
  return ultima;
}

/** Fechas que ninguna fila de `trms` cubre. */
export function sinCubrir(trms: readonly Trm[], fechas: readonly string[]): string[] {
  return fechas.filter((f) => !trms.some((t) => cubre(t, f)));
}

/**
 * Resuelve varias fechas a la vez (SPEC 10) con la regla de `resolverTrm`.
 * `guardadas`: las filas en caché; `obtenidas`: las que trajo la fuente en una
 * sola consulta por rango, o `null` si no se consultó o falló. Las obtenidas
 * cuentan como guardadas: se guardan antes de responder, así que la siguiente
 * lectura las verá igual.
 */
export function resolverEnFechas(
  guardadas: readonly Trm[],
  obtenidas: readonly Trm[] | null,
  fechas: readonly string[],
): Map<string, TrmResuelta> {
  const conocidas = [...guardadas, ...(obtenidas ?? [])];
  return new Map(
    fechas.map((fecha) => {
      const obtenida = obtenidas?.find((t) => cubre(t, fecha)) ?? null;
      return [fecha, resolverTrm(ultimaHasta(conocidas, fecha), obtenida, fecha)];
    }),
  );
}
