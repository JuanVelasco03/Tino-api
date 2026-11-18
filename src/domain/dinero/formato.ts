/**
 * Dinero: `bigint` en unidades menores (COP = pesos; USD = centavos).
 * Nunca `number` con decimales (REGLAS §6). Aquí tampoco se usa `Intl`:
 * formatea con aritmética entera para no pasar nunca por coma flotante.
 */
export type Moneda = "COP" | "USD";

export type Dinero = {
  monto: bigint;
  moneda: Moneda;
};

export type OpcionesFormato = {
  /** Omite «COP» cuando toda la columna está en pesos. No afecta a USD. */
  omitirCOP?: boolean;
  /** Antepone «+» a los importes positivos (entradas en lista general). */
  signoMas?: boolean;
};

/** Signo menos tipográfico (U+2212). Nunca el guion. */
export const SIGNO_MENOS = "−";

/** Punto de miles: 1234567 → "1.234.567". */
function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function signoDe(monto: bigint, signoMas: boolean): string {
  if (monto < 0n) return SIGNO_MENOS;
  if (monto > 0n && signoMas) return "+";
  return "";
}

/** Formato colombiano: `1.234.567 COP`, `US$ 7.750,00`, negativo con U+2212. */
export function formatearDinero(dinero: Dinero, opciones: OpcionesFormato = {}): string {
  const { monto, moneda } = dinero;
  const signo = signoDe(monto, opciones.signoMas ?? false);
  const absoluto = monto < 0n ? -monto : monto;

  if (moneda === "COP") {
    const cifra = `${signo}${agruparMiles(absoluto.toString())}`;
    return opciones.omitirCOP ? cifra : `${cifra} COP`;
  }

  const enteros = absoluto / 100n;
  const centavos = (absoluto % 100n).toString().padStart(2, "0");
  return `${signo}US$ ${agruparMiles(enteros.toString())},${centavos}`;
}

/**
 * Tasa de cambio en centésimas de peso por dólar: `410_000n` = 4.100,00.
 * Se usa solo para mostrar; la conversión y el congelado de la tasa
 * pertenecen a RN-04 y no están aquí.
 */
export function formatearTasa(tasa: bigint): string {
  const enteros = tasa / 100n;
  const centesimas = (tasa % 100n).toString().padStart(2, "0");
  return `${agruparMiles(enteros.toString())},${centesimas}`;
}

/** Equivalencia en pesos con su tasa: `≈ 31.775.000 COP · TRM 4.100,00`. */
export function formatearEquivalencia(equivalenteCOP: bigint, tasa: bigint): string {
  return `≈ ${formatearDinero({ monto: equivalenteCOP, moneda: "COP" })} · TRM ${formatearTasa(tasa)}`;
}
