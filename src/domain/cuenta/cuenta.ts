import { TIPO_INVERSION, type Moneda } from "../inversion/inversion.js";
import { TIPOS_PRESTAMO, type TipoPrestamo } from "../prestamo/prestamo.js";
import type { TipoCuenta } from "./naturaleza.js";

/** Tipos de las cuentas propias, visibles en Cuentas (SPEC 03). Subconjunto de `TipoCuenta`. */
export type TipoCuentaEnAlcance = Extract<TipoCuenta, "efectivo" | "banco" | "tarjeta_credito">;

export const TIPOS_EN_ALCANCE = [
  "efectivo",
  "banco",
  "tarjeta_credito",
] as const satisfies readonly TipoCuentaEnAlcance[];

/** Todos los tipos que existen en la base: cuentas propias y préstamos (SPEC 08). */
export type TipoCuentaConPrestamo = TipoCuentaEnAlcance | TipoPrestamo;

export const TIPOS_CON_PRESTAMO = [
  ...TIPOS_EN_ALCANCE,
  ...TIPOS_PRESTAMO,
] as const satisfies readonly TipoCuentaConPrestamo[];

/** Todos los tipos que existen en la base: los anteriores e inversiones (SPEC 10). */
export type TipoCuentaGuardada = TipoCuentaConPrestamo | typeof TIPO_INVERSION;

export const TIPOS_GUARDADOS = [
  ...TIPOS_CON_PRESTAMO,
  TIPO_INVERSION,
] as const satisfies readonly TipoCuentaGuardada[];

/** Tipos visibles en Cuentas: las propias e inversiones (SPEC 10). Los préstamos no. */
export type TipoCuentaVisible = TipoCuentaEnAlcance | typeof TIPO_INVERSION;

export const TIPOS_VISIBLES = [
  ...TIPOS_EN_ALCANCE,
  TIPO_INVERSION,
] as const satisfies readonly TipoCuentaVisible[];

/** Efectivo y valor de mercado de una inversión, en su moneda (SPEC 10). */
export type DetalleInversion = {
  efectivo: bigint;
  valorMercado: bigint;
  /** TRM con que se convirtió a COP; `null` en COP o si no hay TRM. */
  trmCent: bigint | null;
};

/**
 * Montos en unidades menores de `moneda` (COP = pesos, USD = centavos),
 * `bigint`: sin coma flotante. Solo una inversión puede estar en USD.
 */
export type Cuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuentaVisible;
  moneda: Moneda;
  detalle: string | null;
  saldoInicial: bigint;
  /**
   * RN-01: calculado, nunca almacenado. En un pasivo, la deuda vigente
   * (positiva). En una inversión, su valor de mercado en COP (SPEC 10).
   */
  saldo: bigint;
  cupo: bigint | null;
  posicion: number;
  archivadaEn: Date | null;
  /** Solo en una inversión. */
  inversion: DetalleInversion | null;
};

/** Cuenta tal como se guarda: sin saldo, que se calcula con `conSaldos` (RN-01). */
export type CuentaGuardada = Omit<Cuenta, "saldo" | "inversion">;

export type GrupoCuentas = { total: bigint; cuentas: Cuenta[] };

/** Capital pendiente de los préstamos (SPEC 08): no salen en los grupos, sí en el patrimonio. */
export type TotalesPrestamos = { teDeben: bigint; debes: bigint };

/** Cuenta de préstamo con su saldo (capital pendiente, RN-01). */
export type SaldoPrestamo = { tipo: TipoPrestamo; saldo: bigint };

export type ResumenCuentas = {
  activos: GrupoCuentas;
  pasivos: GrupoCuentas;
  prestamos: TotalesPrestamos;
  /** activos.total − pasivos.total + prestamos.teDeben − prestamos.debes; puede ser negativo. */
  patrimonioNeto: bigint;
};
