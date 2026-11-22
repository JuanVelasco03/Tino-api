/**
 * Conversión del valor de la TRM entre texto decimal y centavos de peso,
 * solo con aritmética de enteros: nunca `Number` ni `parseFloat` (REGLAS §6).
 */

const FORMATO = /^(\d{1,6})(?:\.(\d{1,2}))?$/;

/**
 * "3461.92" → 346192n, "3415.1" → 341510n, "3316" → 331600n. Cualquier otra
 * forma, o cero, → `null`.
 */
export function parsearValor(texto: string): bigint | null {
  const partes = FORMATO.exec(texto);
  if (partes === null) return null;
  const [, enteros, decimales = ""] = partes;
  const cent = BigInt(enteros!) * 100n + BigInt(decimales.padEnd(2, "0"));
  return cent > 0n ? cent : null;
}

/** Siempre con dos decimales: 346192n → "3461.92", 341510n → "3415.10". */
export function formatearValor(cent: bigint): string {
  const enteros = cent / 100n;
  const decimales = (cent % 100n).toString().padStart(2, "0");
  return `${enteros}.${decimales}`;
}
