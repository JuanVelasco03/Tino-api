/**
 * Contrato HTTP del detalle de cuenta y del ciclo de tarjeta (SPEC 14). Montos
 * en string entero de pesos; los que pueden ser negativos llevan "-".
 */
import type { CompraSimulada } from "../domain/tarjeta/compra.js";
import type { FilaHistorial } from "../domain/cuenta/historial.js";
import type { Movimiento, Ref, TipoMovimientoGuardado } from "../domain/movimiento/movimiento.js";
import type { ClaseCargo } from "../domain/tarjeta/tarjeta.js";
import type { ResultadoCiclo, ResultadoHistorial } from "./detalle-cuenta.service.js";

type PartesDto = { categoria: Ref; monto: string }[];

export type FilaHistorialDto = {
  movimientoId: string;
  tipo: TipoMovimientoGuardado;
  fecha: string;
  descripcion: string | null;
  /** Con signo: + entra, − sale. */
  efecto: string;
  /** Saldo corrido tras la fila. */
  saldo: string;
  /** En esta cuenta. */
  conciliado: boolean;
  /** En un ajuste, «Ajuste». */
  categoria: Ref | null;
  partes: PartesDto;
  /** Solo en transferencias: la otra cuenta. */
  contraparte: (Ref & { sentido: "desde" | "hacia" }) | null;
};

export type HistorialDto = {
  fechaHoy: string;
  desde: string;
  hasta: string | null;
  /** Actual, con futuros (SPEC 03). */
  saldo: string;
  /** Sin futuros: el del panel de ajuste. */
  saldoHoy: string;
  conciliacion: { saldo: string | null; al: string | null; pendientes: number };
  entradas: string;
  /** Positivo; el «−» lo pone el cliente. */
  salidas: string;
  saldoInicioRango: string;
  /** La más reciente primero. */
  filas: FilaHistorialDto[];
};

export type FilaCicloDto = {
  movimientoId: string;
  tipo: TipoMovimientoGuardado;
  fecha: string;
  descripcion: string | null;
  monto: string;
  categoria: Ref | null;
  partes: PartesDto;
  /** La otra cuenta de una transferencia. */
  contraparte: Ref | null;
};

export type CicloDto = {
  fechaHoy: string;
  /** null: tarjeta sin condiciones (N-79). */
  ciclo: {
    inicio: string;
    corte: string;
    pagoLimite: string;
    diasHastaCorte: number;
    diasHastaPago: number;
    corteAnterior: { fecha: string; saldo: string };
    abonos: FilaCicloDto[];
    saldoAnteriorPendiente: string;
    pagoSugerido: string;
    consumos: FilaCicloDto[];
    totalConsumos: string;
    cargos: (FilaCicloDto & { clase: ClaseCargo })[];
    totalCargos: string;
    deudaAlCorte: string;
  } | null;
  /** Solo con ?compra=. */
  compra: {
    monto: string;
    cabe: boolean;
    disponibleTras: string | null;
    porcentajeTras: number | null;
    falta: string | null;
  } | null;
};

const partesDto = (m: Movimiento): PartesDto =>
  m.partes.map((p) => ({ categoria: p.categoria, monto: p.monto.toString() }));

function aFilaHistorialDto(f: FilaHistorial): FilaHistorialDto {
  const m = f.movimiento;
  return {
    movimientoId: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    efecto: f.efecto.toString(),
    saldo: f.saldo.toString(),
    conciliado: f.conciliado,
    categoria: m.categoria,
    partes: partesDto(m),
    contraparte: f.contraparte,
  };
}

export function aHistorialDto(r: ResultadoHistorial): HistorialDto {
  const h = r.historial;
  return {
    fechaHoy: r.fechaHoy,
    desde: r.desde,
    hasta: r.hasta,
    saldo: h.saldo.toString(),
    saldoHoy: h.saldoHoy.toString(),
    conciliacion: {
      saldo: r.conciliacion.saldo === null ? null : r.conciliacion.saldo.toString(),
      al: r.conciliacion.al,
      pendientes: r.conciliacion.pendientes,
    },
    entradas: h.entradas.toString(),
    salidas: h.salidas.toString(),
    saldoInicioRango: h.saldoInicioRango.toString(),
    filas: h.filas.map(aFilaHistorialDto),
  };
}

/** Fila del ciclo; la contraparte es la otra cuenta de una transferencia. */
function aFilaCicloDto(tarjetaId: string, m: Movimiento): FilaCicloDto {
  const contraparte =
    m.tipo !== "transferencia"
      ? null
      : m.cuentaOrigen?.id === tarjetaId
        ? m.cuentaDestino
        : m.cuentaOrigen;
  return {
    movimientoId: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    monto: (m.cuentaDestino?.id === tarjetaId ? (m.montoDestino ?? m.monto) : m.monto).toString(),
    categoria: m.categoria,
    partes: partesDto(m),
    contraparte,
  };
}

function aCompraDto(c: CompraSimulada): NonNullable<CicloDto["compra"]> {
  return {
    monto: c.monto.toString(),
    cabe: c.cabe,
    disponibleTras: c.disponibleTras === null ? null : c.disponibleTras.toString(),
    porcentajeTras: c.porcentajeTras,
    falta: c.falta === null ? null : c.falta.toString(),
  };
}

export function aCicloDto(tarjetaId: string, r: ResultadoCiclo): CicloDto {
  const c = r.ciclo;
  const fila = (m: Movimiento) => aFilaCicloDto(tarjetaId, m);
  return {
    fechaHoy: r.fechaHoy,
    ciclo:
      c === null
        ? null
        : {
            inicio: c.inicio,
            corte: c.corte,
            pagoLimite: c.pagoLimite,
            diasHastaCorte: c.diasHastaCorte,
            diasHastaPago: c.diasHastaPago,
            corteAnterior: { fecha: c.corteAnterior, saldo: c.saldoCorteAnterior.toString() },
            abonos: c.abonos.map(fila),
            saldoAnteriorPendiente: c.saldoAnteriorPendiente.toString(),
            pagoSugerido: c.pagoSugerido.toString(),
            consumos: c.consumos.map(fila),
            totalConsumos: c.totalConsumos.toString(),
            cargos: c.cargos.map((k) => ({ ...fila(k.movimiento), clase: k.clase })),
            totalCargos: c.totalCargos.toString(),
            deudaAlCorte: c.deudaAlCorte.toString(),
          },
    compra: r.compra === null ? null : aCompraDto(r.compra),
  };
}
