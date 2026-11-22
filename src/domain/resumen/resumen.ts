/**
 * Tipos del resumen del mes (SPEC 06). Montos en unidades menores, `bigint`.
 * Los porcentajes son enteros en décimas (274 = 27,4 %), sin coma flotante.
 */
import type { TipoCuentaConPrestamo } from "../cuenta/cuenta.js";
import type { TipoMovimiento } from "../movimiento/movimiento.js";

export type Comparacion = {
  actual: bigint;
  anterior: bigint;
  variacion: bigint;
  variacionPorcentaje: number | null;
};

export type CategoriaDelMes = {
  categoriaId: string;
  monto: bigint;
  anterior: bigint;
  variacion: bigint;
  porcentaje: number | null;
};

export type ResumenMes = {
  cantidadMovimientos: number;
  ingresos: Comparacion;
  gastos: Comparacion;
  resultado: Comparacion;
  categorias: CategoriaDelMes[];
  sinCategoria: Omit<CategoriaDelMes, "categoriaId"> & { cantidad: number };
};

export type PuntoPatrimonio = { fecha: string; patrimonio: bigint };

/** Lo mínimo de un movimiento para el resumen. `monto` siempre positivo; `fecha` "YYYY-MM-DD". */
export type MovimientoResumen = {
  id: string;
  tipo: TipoMovimiento;
  monto: bigint;
  fecha: string;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
};

export type ParteResumen = { movimientoId: string; categoriaId: string; monto: bigint };

/**
 * Cuenta para el patrimonio, archivadas y préstamos incluidos (SPEC 08).
 * `creadaEl`: día local de `creado_en`.
 */
export type CuentaPatrimonio = {
  id: string;
  tipo: TipoCuentaConPrestamo;
  saldoInicial: bigint;
  creadaEl: string;
};

/** Cambio de saldo inicial (`cuentas_cambios`). `fecha`: día local de `cambiado_en`. */
export type CambioSaldoInicial = {
  cuentaId: string;
  valorAnterior: bigint;
  valorNuevo: bigint;
  cambiadoEn: Date;
  fecha: string;
};

/** Todo lo que necesita el cálculo del patrimonio a una fecha. */
export type DatosPatrimonio = {
  cuentas: readonly CuentaPatrimonio[];
  cambios: readonly CambioSaldoInicial[];
  movimientos: readonly MovimientoResumen[];
};

export type CambioDelMes = {
  fechaAnterior: string;
  fechaCierre: string;
  patrimonioAnterior: bigint;
  resultado: bigint;
  otrosCambios: bigint;
  patrimonioCierre: bigint;
};
