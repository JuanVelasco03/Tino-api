/**
 * Ajuste de saldo (RN-14, SPEC 14). El usuario cuenta lo que tiene y TINO
 * registra la diferencia como un movimiento aparte: no reescribe el saldo
 * inicial (RN-16). Se compara contra el saldo a hoy, sin movimientos futuros.
 */
export type Ajuste = {
  /** `true`: el saldo sube (el ajuste va en destino); `false`: baja (en origen). */
  sube: boolean;
  /** |diferencia|, > 0. */
  monto: bigint;
};

/** `null` si no hay diferencia (SIN_DIFERENCIA). */
export function calcularAjuste(saldoReal: bigint, saldoHoy: bigint): Ajuste | null {
  const diferencia = saldoReal - saldoHoy;
  if (diferencia === 0n) return null;
  return { sube: diferencia > 0n, monto: diferencia > 0n ? diferencia : -diferencia };
}
