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

/** Montos en unidades menores (COP = pesos), `bigint`: sin coma flotante. */
export type Cuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuentaEnAlcance;
  detalle: string | null;
  saldoInicial: bigint;
  /** RN-01: calculado, nunca almacenado. En un pasivo, la deuda vigente (positiva). */
  saldo: bigint;
  cupo: bigint | null;
  posicion: number;
  archivadaEn: Date | null;
};

/** Cuenta tal como se guarda: sin saldo, que se calcula con `conSaldos` (RN-01). */
export type CuentaGuardada = Omit<Cuenta, "saldo">;

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
