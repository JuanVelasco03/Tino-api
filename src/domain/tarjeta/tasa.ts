/**
 * Tasa efectiva anual de una tasa mensual vencida (SPEC 14). Es una tasa, no
 * un monto; aun así se calcula con enteros para que el resultado no dependa de
 * la coma flotante.
 */
const ESCALA = 10n ** 12n;

/**
 * `((1 + m ÷ 10000)^12 − 1) × 10000`, truncado, en centésimas de punto, como
 * los demás porcentajes de la API. 198 (1,98 % M.V.) → 2652 (26,526 % E.A.).
 */
export function tasaEfectivaAnual(tasaMensualCpb: number): number {
  const base = ESCALA + BigInt(tasaMensualCpb) * 10n ** 8n;
  let factor = ESCALA;
  for (let i = 0; i < 12; i++) factor = (factor * base) / ESCALA;
  return Number(((factor - ESCALA) * 10_000n) / ESCALA);
}
