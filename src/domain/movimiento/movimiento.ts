import type { Moneda } from "../inversion/inversion.js";

export const TIPOS_MOVIMIENTO = ["gasto", "ingreso", "transferencia"] as const;

/** Los que se capturan: gasto, ingreso y transferencia. */
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/**
 * Los que puede haber guardados: además, el ajuste de saldo (RN-14, SPEC 14).
 * Un ajuste no se captura: nace en `POST /cuentas/:id/ajustes` y se edita en
 * `PUT /movimientos/:id`.
 */
export const TIPOS_MOVIMIENTO_GUARDADO = [...TIPOS_MOVIMIENTO, "ajuste"] as const;

export type TipoMovimientoGuardado = (typeof TIPOS_MOVIMIENTO_GUARDADO)[number];

/** Descripción del movimiento que crea un ajuste de saldo. */
export const DESCRIPCION_AJUSTE = "Ajuste de saldo";

/** Montos en unidades menores (COP = pesos), `bigint`: sin coma flotante. */
export type Parte = { categoriaId: string; monto: bigint };

export type MovimientoEntrada = {
  tipo: TipoMovimientoGuardado;
  /** > 0. Siempre positivo: el efecto en el saldo lo da la naturaleza de la cuenta (RN-02). */
  monto: bigint;
  /**
   * Lo que llegó al destino en una transferencia entre monedas distintas, en la
   * moneda del destino (SPEC 10). `null` con la misma moneda.
   */
  montoDestino: bigint | null;
  /** "YYYY-MM-DD"; null = hoy en la zona del usuario. */
  fecha: string | null;
  descripcion: string | null;
  nota: string | null;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
  partes: Parte[] | null;
};

export type Ref = { id: string; nombre: string };

/** Movimiento leído de la base, con nombres de cuenta y categoría. */
export type Movimiento = {
  id: string;
  tipo: TipoMovimientoGuardado;
  monto: bigint;
  /** La de la cuenta de origen, o la del destino en un ingreso. La fija la base. */
  moneda: Moneda;
  /** En la moneda del destino; solo en una transferencia entre monedas (SPEC 10). */
  montoDestino: bigint | null;
  /**
   * Decimal exacto como texto ("1"; la implícita en COP por US$ 1 entre
   * monedas): nunca pasa por number (RN-04).
   */
  tasa: string;
  fecha: string;
  descripcion: string | null;
  nota: string | null;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;
  partes: { categoria: Ref; monto: bigint }[];
  creadoEn: Date;
  actualizadoEn: Date;
};
