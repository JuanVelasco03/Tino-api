/**
 * Normalización de texto para comparar conceptos y palabras clave: minúsculas,
 * sin tildes ni diacríticos, espacios colapsados. «Almuerzo  Corrientazo» →
 * «almuerzo corrientazo»; «Café» → «cafe».
 */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Palabras del texto normalizado. Separa por cualquier carácter que no sea
 * letra ni dígito, así «almuerzo,» y «almuerzo» son la misma palabra.
 */
export function palabras(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p !== "");
}
