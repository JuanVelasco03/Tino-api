/**
 * TRM: pesos colombianos por US$ 1, tal como la publica la Superintendencia
 * Financiera (SPEC 09). Una TRM cubre una vigencia de uno o más días: la del
 * sábado vale hasta el lunes.
 */

/** Valor en centavos de peso por US$ 1. Fechas "YYYY-MM-DD". */
export type Trm = { valorCent: bigint; vigenteDesde: string; vigenteHasta: string };

/** `desactualizada`: la fuente falló y `trm` es la última conocida, que no cubre la fecha. */
export type TrmResuelta = { trm: Trm | null; desactualizada: boolean };
