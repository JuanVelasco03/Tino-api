/**
 * Categorización automática por reglas de texto (RN-11): propone, el usuario
 * dispone. Las reglas se evalúan aquí, no en el cliente ni en SQL.
 */
import type { TipoMovimiento } from "../movimiento/movimiento.js";
import { palabras } from "../texto/normalizar.js";

export type TipoCategoria = "gasto" | "ingreso";

export type Regla = { id: string; palabraClave: string; categoriaId: string; creadoEn: Date };

/** Regla con el tipo de su categoría: solo aplica a movimientos de ese tipo. */
export type ReglaEvaluable = Regla & { tipoCategoria: TipoCategoria };

/** La palabra clave aparece en el texto como palabras completas y contiguas. */
function coincide(textoPalabras: string[], clave: string[]): boolean {
  if (clave.length === 0 || clave.length > textoPalabras.length) return false;
  for (let i = 0; i + clave.length <= textoPalabras.length; i++) {
    if (clave.every((p, j) => textoPalabras[i + j] === p)) return true;
  }
  return false;
}

/**
 * Regla que propone la categoría para `texto` en un movimiento de `tipo`, o
 * `null`. Una transferencia no lleva categoría (RN-05). Si coinciden varias,
 * gana la palabra clave más larga; en empate, la regla más reciente.
 */
export function proponerCategoria<R extends ReglaEvaluable>(
  texto: string,
  tipo: TipoMovimiento,
  reglas: readonly R[],
): R | null {
  if (tipo === "transferencia") return null;
  const textoPalabras = palabras(texto);
  if (textoPalabras.length === 0) return null;

  let mejor: R | null = null;
  for (const regla of reglas) {
    if (regla.tipoCategoria !== tipo) continue;
    if (!coincide(textoPalabras, palabras(regla.palabraClave))) continue;
    if (
      mejor === null ||
      regla.palabraClave.length > mejor.palabraClave.length ||
      (regla.palabraClave.length === mejor.palabraClave.length &&
        regla.creadoEn.getTime() > mejor.creadoEn.getTime())
    ) {
      mejor = regla;
    }
  }
  return mejor;
}
