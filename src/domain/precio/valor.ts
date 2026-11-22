/**
 * Precio del proveedor (string decimal) a unidades menores, solo con
 * aritmética de enteros: nunca `Number` ni `parseFloat` (REGLAS §6).
 */

const FORMATO = /^(\d{1,15})(?:\.(\d{1,20}))?$/;

/**
 * Half-up a centavos: "562.4" → 56240n, "71400.12345" → 7140012n,
 * "0.005" → 1n. Si da 0 o el texto no es un decimal positivo, `null`
 * (falla de ese activo).
 */
export function parsearPrecio(texto: string): bigint | null {
  const partes = FORMATO.exec(texto.trim());
  if (partes === null) return null;
  const [, enteros, decimales = ""] = partes;
  const relleno = decimales.padEnd(3, "0");
  let cent = BigInt(enteros!) * 100n + BigInt(relleno.slice(0, 2));
  if (relleno[2]! >= "5") cent += 1n;
  return cent > 0n ? cent : null;
}
