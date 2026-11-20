/**
 * Contrato HTTP de movimientos. El monto viaja positivo como string de entero
 * en unidades menores; el signo por tipo lo pone el cliente.
 */
import type { Movimiento, Ref, TipoMovimiento } from "../domain/movimiento/movimiento.js";

export type MovimientoDto = {
  id: string;
  tipo: TipoMovimiento;
  monto: string;
  moneda: "COP";
  tasa: string;
  fecha: string;
  descripcion: string | null;
  nota: string | null;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  /** null y partes vacío = sin clasificar. */
  categoria: Ref | null;
  partes: { categoria: Ref; monto: string }[];
  creadoEn: string;
  actualizadoEn: string;
};

export type ListaMovimientosDto = { mes: string; movimientos: MovimientoDto[] };

export function aMovimientoDto(m: Movimiento): MovimientoDto {
  return {
    id: m.id,
    tipo: m.tipo,
    monto: m.monto.toString(),
    moneda: m.moneda,
    tasa: m.tasa,
    fecha: m.fecha,
    descripcion: m.descripcion,
    nota: m.nota,
    cuentaOrigen: m.cuentaOrigen,
    cuentaDestino: m.cuentaDestino,
    categoria: m.categoria,
    partes: m.partes.map((p) => ({ categoria: p.categoria, monto: p.monto.toString() })),
    creadoEn: m.creadoEn.toISOString(),
    actualizadoEn: m.actualizadoEn.toISOString(),
  };
}
