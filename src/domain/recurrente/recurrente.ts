/**
 * Recurrentes (SPEC 07). Las ocurrencias no se guardan: se derivan del
 * calendario de la plantilla. Solo se guarda el cierre de una ocurrencia
 * (confirmada, con su movimiento, u omitida). Nada toca saldos sin el
 * usuario (RN-10).
 *
 * Fechas: días "YYYY-MM-DD" en la zona del perfil. Montos: `bigint` en
 * unidades menores.
 */
import type { TipoMovimiento } from "../movimiento/movimiento.js";

export const PERIODICIDADES = [
  "semanal",
  "quincenal",
  "mensual",
  "bimestral",
  "trimestral",
  "anual",
] as const;

export type Periodicidad = (typeof PERIODICIDADES)[number];

/** Periodicidades de un mes o más: admiten «último día». */
export const MESES_POR_PERIODICIDAD = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  anual: 12,
} as const satisfies Partial<Record<Periodicidad, number>>;

export type Calendario = {
  periodicidad: Periodicidad;
  /** Ancla del calendario. */
  primerVencimiento: string;
  ultimoDia: boolean;
  /** Primera fecha que genera ocurrencias. */
  generarDesde: string;
  /** null = activa; si no, no hay ocurrencias desde esta fecha. */
  pausadaDesde: string | null;
};

export type Recurrente = Calendario & {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  monto: bigint;
  variable: boolean;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
};

export type Cierre = {
  recurrenteId: string;
  vencimiento: string;
  estado: "confirmada" | "omitida";
  movimientoId: string | null;
  /** Monto actual del movimiento confirmado; null en una omitida. */
  montoMovimiento: bigint | null;
};

export type EstadoOcurrencia = "pagada" | "omitida" | "vencida" | "por_confirmar" | "programada";

export type Ocurrencia = {
  recurrenteId: string;
  vencimiento: string;
  estado: EstadoOcurrencia;
  monto: bigint;
  estimado: boolean;
  movimientoId: string | null;
};

/** Lo que escribe el usuario al crear o reemplazar (PUT) una plantilla. */
export type RecurrenteEntrada = {
  tipo: TipoMovimiento;
  concepto: string;
  monto: bigint;
  variable: boolean;
  periodicidad: Periodicidad;
  primerVencimiento: string;
  ultimoDia: boolean;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
};

export function esPeriodicidad(valor: string): valor is Periodicidad {
  return (PERIODICIDADES as readonly string[]).includes(valor);
}

/** Salidas: lo que suma al comprometido (RN-05: la transferencia es salida, no gasto). */
export const esSalida = (tipo: TipoMovimiento): boolean =>
  tipo === "gasto" || tipo === "transferencia";
