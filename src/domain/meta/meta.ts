/**
 * Metas de ahorro (SPEC 13). Una meta vive sobre una cuenta real: en modo
 * `apartado` separa parte del saldo de una cuenta de efectivo o banco; en modo
 * `cuenta` toma la cuenta entera (su saldo, o su valor de mercado en COP si es
 * inversión). El avance no se guarda (RN-01): se deriva aquí.
 *
 * Montos en pesos, `bigint`: el objetivo es siempre COP (N-57). Fechas
 * "YYYY-MM-DD" en la zona del perfil.
 */
import type { Moneda } from "../inversion/inversion.js";

/** Espejo del `check` de `metas.modo`. */
export const MODOS_META = ["apartado", "cuenta"] as const;

export type ModoMeta = (typeof MODOS_META)[number];

/** Espejo del `check` de `metas_movimientos.tipo`. */
export const TIPOS_APORTE = ["aporte", "retiro"] as const;

export type TipoAporte = (typeof TIPOS_APORTE)[number];

/** Tipos de cuenta que admite el modo `apartado` (espejo de `validar_meta`). */
export const TIPOS_CUENTA_APARTADO = ["efectivo", "banco"] as const;

/** Tipos de cuenta que admite el modo `cuenta` (espejo de `validar_meta`). */
export const TIPOS_CUENTA_MODO_CUENTA = ["efectivo", "banco", "inversion"] as const;

export type TipoCuentaMeta = (typeof TIPOS_CUENTA_MODO_CUENTA)[number];

/** Meses calendario, el actual incluido, del ritmo promedio (N-21). */
export const VENTANA_RITMO_MESES = 6;

export const NOMBRE_MAXIMO = 60;
export const MOTIVO_MAXIMO = 80;
/** Largo máximo de la descripción de un movimiento. */
export const DESCRIPCION_MAXIMA = 80;

export function esModoMeta(valor: string): valor is ModoMeta {
  return (MODOS_META as readonly string[]).includes(valor);
}

export function esTipoAporte(valor: string): valor is TipoAporte {
  return (TIPOS_APORTE as readonly string[]).includes(valor);
}

export function esTipoCuentaMeta(valor: string): valor is TipoCuentaMeta {
  return (TIPOS_CUENTA_MODO_CUENTA as readonly string[]).includes(valor);
}

/** Si `modo` admite una cuenta de tipo `tipo`. */
export function admiteCuenta(modo: ModoMeta, tipo: string): boolean {
  const admitidos: readonly string[] =
    modo === "apartado" ? TIPOS_CUENTA_APARTADO : TIPOS_CUENTA_MODO_CUENTA;
  return admitidos.includes(tipo);
}

/** Meta tal como se guarda, con los montos descifrados. */
export type Meta = {
  id: string;
  nombre: string;
  cuentaId: string;
  modo: ModoMeta;
  objetivo: bigint;
  /** Un mes se guarda como su último día (`fechaMetaEsMes`). */
  fechaMeta: string | null;
  fechaMetaEsMes: boolean;
  /** Solo en metas sobre inversión: el cumplimiento guardado. */
  cumplidaEn: string | null;
  avanceCumplida: bigint | null;
  archivadaEn: Date | null;
  creadoEn: Date;
};

/** Cuenta de una meta, sin saldo: lo calcula el dominio (RN-01). */
export type CuentaDeMeta = {
  id: string;
  nombre: string;
  tipo: string;
  moneda: Moneda;
  saldoInicial: bigint;
  archivadaEn: Date | null;
};

/**
 * Aporte o retiro leído, con monto y fecha ya resueltos: los propios o, si
 * tiene transferencia, los de ella (la única fuente).
 */
export type Aporte = {
  id: string;
  metaId: string;
  tipo: TipoAporte;
  monto: bigint;
  fecha: string;
  motivo: string | null;
  inicial: boolean;
  movimientoId: string | null;
  cuentaOrigen: { id: string; nombre: string } | null;
  creadoEn: Date;
};

/** Lo mínimo de un aporte para el acumulado. */
export type AporteEnLinea = Pick<Aporte, "tipo" | "monto" | "fecha" | "creadoEn">;

/** Cumplimiento: el día en que llegó al objetivo y el avance de ese día (N-23). */
export type Cumplimiento = { fecha: string; avance: bigint };

export type Ritmo =
  | { tipo: "dias"; falta: bigint; dias: number; vencida: boolean }
  | { tipo: "meses"; falta: bigint; meses: number; cuotaMensual: bigint; vencida: boolean }
  | { tipo: "promedio"; promedioMensual: bigint | null; mesEstimado: string | null };
