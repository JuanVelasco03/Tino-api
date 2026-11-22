/**
 * Cantidad de un activo en el contrato: string decimal con hasta 10 enteros y
 * 8 decimales, mayor que cero. En el dominio, `bigint` en 10⁻⁸ unidades:
 * "0.0125" ↔ 1250000n. Solo aritmética de enteros (REGLAS §6).
 */
import { UNIDAD } from "./inversion.js";

const FORMATO = /^(\d{1,10})(?:\.(\d{1,8}))?$/;

/** "0.0125" → 1250000n, "6.25" → 625000000n, "1" → 100000000n. Inválida o cero → `null`. */
export function parsearCantidad(texto: string): bigint | null {
  const partes = FORMATO.exec(texto);
  if (partes === null) return null;
  const [, enteros, decimales = ""] = partes;
  const cantidad = BigInt(enteros!) * UNIDAD + BigInt(decimales.padEnd(8, "0"));
  return cantidad > 0n ? cantidad : null;
}

/** 1250000n → "0.0125", 625000000n → "6.25", 100000000n → "1": sin ceros finales. */
export function formatearCantidad(cantidad: bigint): string {
  const negativo = cantidad < 0n;
  const absoluta = negativo ? -cantidad : cantidad;
  const enteros = absoluta / UNIDAD;
  const decimales = (absoluta % UNIDAD).toString().padStart(8, "0").replace(/0+$/, "");
  const texto = decimales === "" ? `${enteros}` : `${enteros}.${decimales}`;
  return negativo ? `-${texto}` : texto;
}
