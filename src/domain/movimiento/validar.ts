export type TipoMovimiento = "gasto" | "ingreso" | "transferencia";

export type MovimientoEntrada = {
  tipo: TipoMovimiento;
  /** Unidades menores, positivo. */
  monto: bigint;
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  categoriaId?: string | null;
};

export type CodigoError =
  | "ORIGEN_REQUERIDO"
  | "DESTINO_REQUERIDO"
  | "CUENTAS_IGUALES"
  | "CATEGORIA_REQUERIDA"
  | "CATEGORIA_NO_PERMITIDA";

export type ResultadoValidacion = {
  valido: boolean;
  errores: CodigoError[];
};

/**
 * RN-03: transferencia exige origen y destino, informados y distintos.
 * RN-05: transferencia no lleva categoría.
 * Ingreso: destino + categoría. Gasto: origen + categoría.
 * Una cadena vacía cuenta como no informada.
 */
export function validarMovimiento(_movimiento: MovimientoEntrada): ResultadoValidacion {
  throw new Error("No implementado: validarMovimiento");
}
