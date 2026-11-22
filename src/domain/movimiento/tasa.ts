/**
 * Tasa implícita de una transferencia entre monedas (SPEC 10, RN-04): pesos
 * colombianos por US$ 1, congelada en `movimientos.tasa`. Se calcula en el
 * dominio porque los montos llegan cifrados a la base.
 */
import { dividirRedondeando } from "../inversion/inversion.js";

const DECIMALES = 6;
const ESCALA = 10n ** BigInt(DECIMALES);

/** Tasa de un movimiento con la misma moneda en origen y destino. */
export const TASA_UNITARIA = "1";

/**
 * `pesos × 100 ÷ centavos` con 6 decimales y half-up, como texto decimal
 * exacto: `tasaImplicita(8240000n, 200000n)` → "4120.000000". Ambos > 0.
 */
export function tasaImplicita(pesos: bigint, centavos: bigint): string {
  if (pesos <= 0n || centavos <= 0n) throw new Error("tasaImplicita requiere montos positivos");
  const escalada = dividirRedondeando(pesos * 100n * ESCALA, centavos);
  const enteros = escalada / ESCALA;
  const decimales = (escalada % ESCALA).toString().padStart(DECIMALES, "0");
  return `${enteros}.${decimales}`;
}

/**
 * Tasa de una transferencia: la implícita si las monedas difieren y llegó
 * `montoDestino` (el lado COP son los pesos, el USD los centavos); si no, "1".
 */
export function tasaDeTransferencia(
  monto: bigint,
  montoDestino: bigint | null,
  monedaOrigen: "COP" | "USD",
): string {
  if (montoDestino === null) return TASA_UNITARIA;
  return monedaOrigen === "COP"
    ? tasaImplicita(monto, montoDestino)
    : tasaImplicita(montoDestino, monto);
}
