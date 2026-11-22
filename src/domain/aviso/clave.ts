/**
 * Clave de un aviso: `<tipo>:<id de la fuente>:<YYYY-MM-DD>`. Es estable
 * mientras la fuente no cambie. No apunta a ninguna fila: si la fuente
 * desaparece, su marca queda huérfana e inofensiva.
 */
import { esFechaValida } from "../fecha/mes.js";
import type { TipoAviso } from "./aviso.js";

/** Espejo de `avisos_leidos_clave_check`. */
const FORMATO_CLAVE = /^(recurrente|cobro|deuda|precio_manual):[0-9a-f-]{36}:(\d{4}-\d{2}-\d{2})$/;

export function armarClave(tipo: TipoAviso, fuenteId: string, fecha: string): string {
  return `${tipo}:${fuenteId}:${fecha}`;
}

/** Bien formada y con una fecha que existe en el calendario. */
export function esClaveValida(clave: string): boolean {
  const m = FORMATO_CLAVE.exec(clave);
  return m !== null && esFechaValida(m[2]!);
}
