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
export function resolverTrm(guardada: Trm | null, obtenida: Trm | null, fecha: string): TrmResuelta {
  if (guardada !== null && cubre(guardada, fecha)) return { trm: guardada, desactualizada: false };
  if (obtenida !== null) return { trm: obtenida, desactualizada: false };
  if (guardada !== null) return { trm: guardada, desactualizada: true };
  return { trm: null, desactualizada: false };
}
