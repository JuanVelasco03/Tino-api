/**
 * Tasa mensual en el contrato: string decimal con hasta dos decimales, entre
 * "0" y "100". En la base y el dominio, centésimas de punto: "1.5" ↔ 150.
 * Solo aritmética de enteros: nada pasa por `Number()` ni `parseFloat`.
 */

export const TASA_MAXIMA_CPB = 10000;

const FORMATO_TASA = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/;

/** Valor entero de una cadena de dígitos, dígito a dígito. */
function digitos(texto: string): number {
  let valor = 0;
  for (const c of texto) valor = valor * 10 + (c.charCodeAt(0) - 48);
  return valor;
}

/** "1.5" → 150. `null` si no es una tasa válida. */
export function tasaACpb(texto: string): number | null {
  const m = FORMATO_TASA.exec(texto);
  if (!m) return null;
  const enteros = digitos(m[1]!);
  const decimales = digitos((m[2] ?? "").padEnd(2, "0"));
  const cpb = enteros * 100 + decimales;
  return cpb <= TASA_MAXIMA_CPB ? cpb : null;
}

/** 150 → "1.5"; 100 → "1"; 25 → "0.25". */
export function cpbATasa(cpb: number): string {
  const decimales = cpb % 100;
  const enteros = (cpb - decimales) / 100;
  if (decimales === 0) return String(enteros);
  return `${enteros}.${String(decimales).padStart(2, "0").replace(/0$/, "")}`;
}
