/**
 * Errores lanzados por las funciones de Postgres como `raise exception
 * '<CODIGO>'` o `'<CODIGO>:<campo>'` (SQLSTATE P0001). Si el código está en el
 * catálogo, se convierte en ErrorApi con su campo; si no, `null`.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { ErrorApi, esCodigoError } from "../../comun/error-api.js";

export function desdeFuncion(error: PostgrestError): ErrorApi | null {
  if (error.code !== "P0001") return null;
  const [codigo, campo] = error.message.split(":");
  return esCodigoError(codigo) ? new ErrorApi(codigo, campo) : null;
}

/** Fallo sin traducción: el filtro lo convierte en ERROR_INTERNO y el detalle solo va al log. */
export function errorInterno(error: PostgrestError): Error {
  return new Error(`Postgres ${error.code}: ${error.message}`);
}
