export const TIPOS_MOVIMIENTO = ["gasto", "ingreso", "transferencia"] as const;

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Montos en unidades menores (COP = pesos), `bigint`: sin coma flotante. */
export type Parte = { categoriaId: string; monto: bigint };

export type MovimientoEntrada = {
  tipo: TipoMovimiento;
  /** > 0. Siempre positivo: el efecto en el saldo lo da la naturaleza de la cuenta (RN-02). */
  monto: bigint;
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
  tipo: TipoMovimiento;
  monto: bigint;
  moneda: "COP";
  /** Decimal exacto como texto ("1"): nunca pasa por number (RN-04). */
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
