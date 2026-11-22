/**
 * Contrato HTTP de inversiones (SPEC 10). Montos como string entero en
 * unidades menores de la moneda de la cuenta (COP = pesos, USD = centavos);
 * cantidades como string decimal con hasta 8 decimales; precios por unidad en
 * unidades menores. Excepción documentada: los porcentajes son enteros en
 * centésimas (1248 = 12,48 %), pueden ser negativos y son null sin base.
 * En una inversión COP, todo campo `…Cop` es null: el monto ya está en pesos.
 */
import { formatearCantidad } from "../domain/inversion/cantidad.js";
import type { Activo, Moneda } from "../domain/inversion/inversion.js";
import { precioUnitario } from "../domain/inversion/posiciones.js";
import type { OperacionLeida } from "../repositories/supabase/inversiones.repository.js";
import {
  aCop,
  type InversionValorada,
  type PosicionValorada,
} from "../domain/inversion/valoracion.js";
import type { TrmResuelta } from "../domain/trm/trm.js";
import { aTrmDto, type TrmDto } from "../trm/dto.js";

export type InversionResumenDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  /** En su moneda. */
  valorMercado: string;
  /** null en COP o sin TRM. */
  valorMercadoCop: string | null;
  rendimiento: string;
  /** Centésimas. */
  rendimientoPorcentaje: number | null;
};

export type InversionesDto = {
  fechaHoy: string;
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  /** No archivadas, en el orden de Cuentas. */
  inversiones: InversionResumenDto[];
};

export type PosicionDto = {
  activoId: string;
  simbolo: string;
  nombre: string;
  /** "0.0125". */
  cantidad: string;
  costo: string;
  /** Por unidad. */
  costoPromedio: string;
  /** Último, por unidad. */
  precio: string;
  precioFecha: string;
  precioOrigen: "manual";
  precioAnterior: { precio: string; fecha: string } | null;
  valor: string;
  valorCop: string | null;
  rendimiento: string;
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;
};

export type InversionDetalleDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  naturaleza: "activo";
  fechaHoy: string;
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  /** Efectivo + posiciones. */
  valorMercado: string;
  valorMercadoCop: string | null;
  /** Posiciones abiertas. */
  costo: string;
  costoCop: string | null;
  rendimiento: string;
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;
  efectivo: string;
  efectivoCop: string | null;
  /** Solo abiertas, por su primera operación. */
  posiciones: PosicionDto[];
  archivadaEn: string | null;
};

export type OperacionDto = {
  id: string;
  activo: { id: string; simbolo: string; nombre: string };
  clase: "inicial" | "compra" | "venta";
  cantidad: string;
  monto: string;
  /** monto ÷ cantidad, redondeado. */
  precioUnitario: string;
  fecha: string;
  /** Solo en venta; puede ser negativa. */
  gananciaRealizada: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type OperacionesDto = { operaciones: OperacionDto[] };

/** Lo mínimo de la cuenta para armar las respuestas. */
export type CuentaDeInversion = {
  id: string;
  nombre: string;
  moneda: Moneda;
  archivadaEn: Date | null;
};

/** Convierte a COP con la TRM resuelta; null en una cuenta COP o sin TRM. */
function enCop(monto: bigint, moneda: Moneda, trm: TrmResuelta): string | null {
  if (moneda === "COP" || trm.trm === null) return null;
  return aCop(monto, moneda, trm.trm.valorCent)?.toString() ?? null;
}

const porcentaje = (p: bigint | null): number | null => (p === null ? null : Number(p));

export function aInversionResumenDto(
  cuenta: CuentaDeInversion,
  valorada: InversionValorada,
  trm: TrmResuelta,
): InversionResumenDto {
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    moneda: cuenta.moneda,
    valorMercado: valorada.valorMercado.toString(),
    valorMercadoCop: enCop(valorada.valorMercado, cuenta.moneda, trm),
    rendimiento: valorada.rendimiento.toString(),
    rendimientoPorcentaje: porcentaje(valorada.rendimientoPorcentaje),
  };
}

function aPosicionDto(
  p: PosicionValorada,
  moneda: Moneda,
  trm: TrmResuelta,
  fechaHoy: string,
): PosicionDto {
  return {
    activoId: p.activo.id,
    simbolo: p.activo.simbolo,
    nombre: p.activo.nombre,
    cantidad: formatearCantidad(p.cantidad),
    costo: p.costo.toString(),
    costoPromedio: (p.costoPromedio ?? 0n).toString(),
    precio: (p.precio?.precio ?? 0n).toString(),
    precioFecha: p.precio?.fecha ?? fechaHoy,
    precioOrigen: p.precio?.origen ?? "manual",
    precioAnterior:
      p.precioAnterior === null
        ? null
        : { precio: p.precioAnterior.precio.toString(), fecha: p.precioAnterior.fecha },
    valor: p.valor.toString(),
    valorCop: enCop(p.valor, moneda, trm),
    rendimiento: p.rendimiento.toString(),
    rendimientoCop: enCop(p.rendimiento, moneda, trm),
    rendimientoPorcentaje: porcentaje(p.rendimientoPorcentaje),
  };
}

export function aInversionDetalleDto(
  cuenta: CuentaDeInversion,
  valorada: InversionValorada,
  trm: TrmResuelta,
  fechaHoy: string,
): InversionDetalleDto {
  const { moneda } = cuenta;
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    moneda,
    naturaleza: "activo",
    fechaHoy,
    trm: trm.trm === null ? null : aTrmDto(trm.trm),
    trmDesactualizada: trm.desactualizada,
    valorMercado: valorada.valorMercado.toString(),
    valorMercadoCop: enCop(valorada.valorMercado, moneda, trm),
    costo: valorada.costo.toString(),
    costoCop: enCop(valorada.costo, moneda, trm),
    rendimiento: valorada.rendimiento.toString(),
    rendimientoCop: enCop(valorada.rendimiento, moneda, trm),
    rendimientoPorcentaje: porcentaje(valorada.rendimientoPorcentaje),
    efectivo: valorada.efectivo.toString(),
    efectivoCop: enCop(valorada.efectivo, moneda, trm),
    posiciones: valorada.posiciones.map((p) => aPosicionDto(p, moneda, trm, fechaHoy)),
    archivadaEn: cuenta.archivadaEn === null ? null : cuenta.archivadaEn.toISOString(),
  };
}

export function aOperacionDto(
  op: OperacionLeida,
  activo: Activo,
  gananciaRealizada: bigint | undefined,
): OperacionDto {
  return {
    id: op.id,
    activo: { id: activo.id, simbolo: activo.simbolo, nombre: activo.nombre },
    clase: op.clase,
    cantidad: formatearCantidad(op.cantidad),
    monto: op.monto.toString(),
    precioUnitario: precioUnitario(op.monto, op.cantidad).toString(),
    fecha: op.fecha,
    gananciaRealizada:
      op.clase === "venta" && gananciaRealizada !== undefined ? gananciaRealizada.toString() : null,
    creadoEn: op.creadoEn.toISOString(),
    actualizadoEn: op.actualizadoEn.toISOString(),
  };
}
