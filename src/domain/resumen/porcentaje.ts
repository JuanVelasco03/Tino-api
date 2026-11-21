/**
 * Porcentajes en décimas (SPEC 06): enteros, 274 = 27,4 %. Se calculan con
 * `bigint` y redondeo half-up lejos de cero; nunca pasan por coma flotante.
 */

/** round(n / d), con la mitad lejos de cero. `d` distinto de cero. */
function dividirRedondeando(n: bigint, d: bigint): bigint {
  const negativo = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const cociente = (2n * a + b) / (2n * b);
  return negativo ? -cociente : cociente;
}

/** round(1000 × parte / total). `null` si el total es cero. */
export function porcentajeEnDecimas(parte: bigint, total: bigint): number | null {
  if (total === 0n) return null;
  return Number(dividirRedondeando(1000n * parte, total));
}

/**
 * round(1000 × (actual − anterior) / |anterior|). Se divide por el valor
 * absoluto para que una cifra que empeora salga negativa aunque el anterior lo
 * sea. `null` si el anterior es cero.
 */
export function variacionPorcentual(actual: bigint, anterior: bigint): number | null {
  if (anterior === 0n) return null;
  return Number(
    dividirRedondeando(1000n * (actual - anterior), anterior < 0n ? -anterior : anterior),
  );
}
