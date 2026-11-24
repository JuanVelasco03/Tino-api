/**
 * Contrato HTTP de movimientos. El monto viaja positivo como string de entero
 * en unidades menores; el signo por tipo lo pone el cliente.
 */
import type { Moneda } from "../domain/inversion/inversion.js";
import type { Movimiento, Ref, TipoMovimientoGuardado } from "../domain/movimiento/movimiento.js";

export type MovimientoDto = {
  id: string;
  /** "ajuste" (SPEC 14): una sola cuenta; + con cuentaDestino, − con cuentaOrigen. */
  tipo: TipoMovimientoGuardado;
  monto: string;
  /** La del origen, o la del destino en un ingreso (SPEC 10). */
  moneda: Moneda;
  /** Lo que llegó al destino en una transferencia entre monedas, en su moneda; si no, null. */
  montoDestino: string | null;
  /** La implícita (COP por US$ 1) entre monedas, o "1". */
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
    montoDestino: m.montoDestino === null ? null : m.montoDestino.toString(),
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
