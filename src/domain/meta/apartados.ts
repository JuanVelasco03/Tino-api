/**
 * Saldo libre de una cuenta con metas por apartado (SPEC 13, N-24, N-25).
 * Un gasto nunca se bloquea por lo apartado (RN-16): el saldo libre puede
 * quedar negativo y entonces la meta lo indica.
 */

/** Apartado vigente de una meta por apartado de la cuenta. */
export type ApartadoDeMeta = { metaId: string; nombre: string; apartado: bigint };

/** `saldo − Σ apartado vigente` de las metas por apartado de la cuenta. */
export function saldoLibre(saldoCuenta: bigint, apartados: readonly ApartadoDeMeta[]): bigint {
  return apartados.reduce((libre, a) => libre - a.apartado, saldoCuenta);
}

export type NotaApartados = {
  saldoCuenta: bigint;
  apartadoAqui: bigint;
  otras: ApartadoDeMeta[];
  libre: bigint;
  excedido: boolean;
};

/**
 * Nota de una meta por apartado: el saldo de su cuenta, lo apartado aquí, en
 * cada otra meta de la cuenta y lo libre. `apartados` trae todas las metas
 * por apartado de la cuenta, esta incluida.
 */
export function notaApartados(
  metaId: string,
  saldoCuenta: bigint,
  apartados: readonly ApartadoDeMeta[],
): NotaApartados {
  const libre = saldoLibre(saldoCuenta, apartados);
  return {
    saldoCuenta,
    apartadoAqui: apartados.find((a) => a.metaId === metaId)?.apartado ?? 0n,
    otras: apartados.filter((a) => a.metaId !== metaId),
    libre,
    excedido: libre < 0n,
  };
}
