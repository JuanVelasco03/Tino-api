/**
 * RN-18: el cupo disponible es cupo total menos deuda vigente. No se almacena.
 * Unidades menores, `bigint`: sin coma flotante.
 */
export function cupoDisponible(cupoTotal: bigint, deudaVigente: bigint): bigint {
  return cupoTotal - deudaVigente;
}

/** Porcentaje entero del cupo usado, acotado a 0–100. Trunca: 21,13 % → 21. */
export function porcentajeUsado(cupoTotal: bigint, deudaVigente: bigint): number {
  if (cupoTotal <= 0n || deudaVigente <= 0n) return 0;
  if (deudaVigente >= cupoTotal) return 100;
  return Number((deudaVigente * 100n) / cupoTotal);
}
