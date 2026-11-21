/**
 * Contrato HTTP de recurrentes (SPEC 07). Montos como string de entero en
 * unidades menores; fechas "YYYY-MM-DD" en la zona del usuario. La bandeja y
 * los ingresos esperados referencian la plantilla por `recurrenteId`.
 */
import type { Ref, TipoMovimiento } from "../domain/movimiento/movimiento.js";
import type { Comprometido, Grupo } from "../domain/recurrente/comprometido.js";
import type {
  EstadoOcurrencia,
  Ocurrencia,
  Periodicidad,
} from "../domain/recurrente/recurrente.js";
import type { PlantillaLeida } from "../repositories/supabase/recurrentes.repository.js";

export type OcurrenciaDto = {
  recurrenteId: string;
  vencimiento: string;
  estado: EstadoOcurrencia;
  /** pagada: el del movimiento; si no, fijo o estimado. */
  monto: string;
  /** Variable y no pagada. */
  estimado: boolean;
  /** Solo en pagada. */
  movimientoId: string | null;
};

export type RecurrenteDto = {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  /** El de la plantilla. */
  monto: string;
  variable: boolean;
  periodicidad: Periodicidad;
  primerVencimiento: string;
  ultimoDia: boolean;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;
  pausada: boolean;
  pausadaDesde: string | null;
  ultimoConfirmado: { monto: string; vencimiento: string } | null;
  /** Del mes actual, por vencimiento. */
  ocurrenciasDelMes: OcurrenciaDto[];
  proximoVencimiento: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type GrupoDto = { monto: string; cantidad: number };

export type RecurrentesDto = {
  fechaHoy: string;
  /** "YYYY-MM", mes actual. */
  mes: string;
  ventanaDias: number;
  /** vencida y por_confirmar. */
  bandeja: OcurrenciaDto[];
  comprometido: { total: string; pagado: GrupoDto; porConfirmar: GrupoDto; programado: GrupoDto };
  ingresosEsperados: OcurrenciaDto[];
  recurrentes: RecurrenteDto[];
};

/** Lo que el dominio calculó para una plantilla. */
export type PlantillaCalculada = {
  plantilla: PlantillaLeida;
  ultimoConfirmado: { monto: bigint; vencimiento: string } | null;
  ocurrenciasDelMes: Ocurrencia[];
  proximoVencimiento: string | null;
};

export function aOcurrenciaDto(o: Ocurrencia): OcurrenciaDto {
  return {
    recurrenteId: o.recurrenteId,
    vencimiento: o.vencimiento,
    estado: o.estado,
    monto: o.monto.toString(),
    estimado: o.estimado,
    movimientoId: o.movimientoId,
  };
}

export function aRecurrenteDto(c: PlantillaCalculada): RecurrenteDto {
  const p = c.plantilla;
  return {
    id: p.id,
    tipo: p.tipo,
    concepto: p.concepto,
    monto: p.monto.toString(),
    variable: p.variable,
    periodicidad: p.periodicidad,
    primerVencimiento: p.primerVencimiento,
    ultimoDia: p.ultimoDia,
    cuentaOrigen: p.cuentaOrigen,
    cuentaDestino: p.cuentaDestino,
    categoria: p.categoria,
    pausada: p.pausadaDesde !== null,
    pausadaDesde: p.pausadaDesde,
    ultimoConfirmado:
      c.ultimoConfirmado === null
        ? null
        : {
            monto: c.ultimoConfirmado.monto.toString(),
            vencimiento: c.ultimoConfirmado.vencimiento,
          },
    ocurrenciasDelMes: c.ocurrenciasDelMes.map(aOcurrenciaDto),
    proximoVencimiento: c.proximoVencimiento,
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString(),
  };
}

const aGrupoDto = (g: Grupo): GrupoDto => ({ monto: g.monto.toString(), cantidad: g.cantidad });

export function aComprometidoDto(c: Comprometido): RecurrentesDto["comprometido"] {
  return {
    total: c.total.toString(),
    pagado: aGrupoDto(c.pagado),
    porConfirmar: aGrupoDto(c.porConfirmar),
    programado: aGrupoDto(c.programado),
  };
}
