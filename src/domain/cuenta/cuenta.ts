import type { TipoCuenta } from "./naturaleza.js";

/** Tipos que existen hoy en la base (SPEC 03). Subconjunto de `TipoCuenta`. */
export type TipoCuentaEnAlcance = Extract<TipoCuenta, "efectivo" | "banco" | "tarjeta_credito">;

export const TIPOS_EN_ALCANCE = [
  "efectivo",
  "banco",
  "tarjeta_credito",
] as const satisfies readonly TipoCuentaEnAlcance[];

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

export type GrupoCuentas = { total: bigint; cuentas: Cuenta[] };

export type ResumenCuentas = {
  activos: GrupoCuentas;
  pasivos: GrupoCuentas;
  /** activos.total − pasivos.total; puede ser negativo. */
  patrimonioNeto: bigint;
};
