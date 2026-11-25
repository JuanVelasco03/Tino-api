/**
 * Tipos del resumen del mes (SPEC 06). Montos en unidades menores, `bigint`.
 * Los porcentajes son enteros en décimas (274 = 27,4 %), sin coma flotante.
 */
import type { TipoCuentaGuardada } from "../cuenta/cuenta.js";
import type { Activo, Moneda, Operacion, Precio } from "../inversion/inversion.js";
import type { TipoMovimientoGuardado } from "../movimiento/movimiento.js";

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

/**
 * Lo mínimo de un movimiento para el resumen. `monto` siempre positivo; `fecha`
 * "YYYY-MM-DD". `montoDestino`: lo que llegó al destino en una transferencia
 * entre monedas (SPEC 10), o `null`.
 */
export type MovimientoResumen = {
  id: string;
  /** Un ajuste (SPEC 14) mueve saldos y patrimonio, pero no es ingreso ni gasto (RN-14). */
  tipo: TipoMovimientoGuardado;
  monto: bigint;
  montoDestino: bigint | null;
  fecha: string;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
};

export type ParteResumen = { movimientoId: string; categoriaId: string; monto: bigint };

/**
 * Cuenta para el patrimonio, archivadas, préstamos (SPEC 08) e inversiones
 * (SPEC 10) incluidos. `creadaEl`: inicio de la cuenta (ver el campo). Montos en la
 * moneda de la cuenta.
 */
export type CuentaPatrimonio = {
  id: string;
  tipo: TipoCuentaGuardada;
  moneda: Moneda;
  saldoInicial: bigint;
  /**
   * Día desde el que la cuenta entra en el patrimonio. Llega como el día local
   * del alta; `conInicioEfectivo` lo adelanta a su primer movimiento u
   * operación si es anterior (SPEC 06).
   */
  creadaEl: string;
};

/** Activos, operaciones y precios de una cuenta de inversión (SPEC 10). */
export type InversionPatrimonio = {
  activos: readonly Activo[];
  operaciones: readonly Operacion[];
  precios: readonly Precio[];
};

/** Cambio de saldo inicial (`cuentas_cambios`). `fecha`: día local de `cambiado_en`. */
export type CambioSaldoInicial = {
  cuentaId: string;
  valorAnterior: bigint;
  valorNuevo: bigint;
  cambiadoEn: Date;
  fecha: string;
};

/**
 * Todo lo que necesita el cálculo del patrimonio a una fecha.
 * `inversiones`: por id de cuenta; ausente = sin inversiones (SPEC 10).
 * `trm`: fecha → TRM en centavos de peso, o `null` si no se obtuvo; la llena
 * `TrmService.enFechas` con las fechas de `fechasConTrm`.
 */
export type DatosPatrimonio = {
  cuentas: readonly CuentaPatrimonio[];
  cambios: readonly CambioSaldoInicial[];
  movimientos: readonly MovimientoResumen[];
  inversiones?: ReadonlyMap<string, InversionPatrimonio>;
  trm?: ReadonlyMap<string, bigint | null>;
};

export type CambioDelMes = {
  fechaAnterior: string;
  fechaCierre: string;
  patrimonioAnterior: bigint;
  resultado: bigint;
  /** Revaluación de las inversiones (SPEC 10): precio, dólar y ganancia realizada. */
  revaluacion: bigint;
  otrosCambios: bigint;
  patrimonioCierre: bigint;
};
