/**
 * Contrato HTTP de metas de ahorro (SPEC 13). Montos como string entero en
 * pesos; los que pueden ser negativos (`variacion`, `libre`) llevan `-`. El
 * porcentaje es un entero en centésimas, truncado (2533 = 25,33 %). Fechas
 * "YYYY-MM-DD" en la zona del usuario; `fechaMeta` puede ser "YYYY-MM". El
 * cliente arma las frases del ritmo, del uso y de las notas con estas cifras.
 */
import type { Trm } from "../domain/trm/trm.js";
import type { NotaApartados } from "../domain/meta/apartados.js";
import { falta, porcentaje } from "../domain/meta/avance.js";
import type { FilaAporte, FilaValor } from "../domain/meta/historial.js";
import type {
  Aporte,
  CuentaDeMeta,
  Cumplimiento,
  Meta,
  ModoMeta,
  Ritmo,
  TipoAporte,
  TipoCuentaMeta,
} from "../domain/meta/meta.js";
import { formatearFechaMeta } from "../domain/meta/validar.js";
import type { Moneda } from "../domain/inversion/inversion.js";
import { aTrmDto, type TrmDto } from "../trm/dto.js";

export type CuentaMetaDto = { id: string; nombre: string; tipo: TipoCuentaMeta; moneda: Moneda };

export type RitmoDto =
  | { tipo: "dias"; falta: string; dias: number; vencida: boolean }
  | { tipo: "meses"; falta: string; meses: number; cuotaMensual: string; vencida: boolean }
  | { tipo: "promedio"; promedioMensual: string | null; mesEstimado: string | null };

export type MetaDto = {
  id: string;
  nombre: string;
  modo: ModoMeta;
  cuenta: CuentaMetaDto;
  objetivo: string;
  /** null: inversión USD sin TRM. En una cumplida, el avance del día en que se cumplió. */
  avance: string | null;
  falta: string | null;
  /** Centésimas, truncado. */
  porcentaje: number | null;
  /** "YYYY-MM-DD" o "YYYY-MM". */
  fechaMeta: string | null;
  cumplidaEl: string | null;
  uso: { fecha: string; motivo: string | null } | null;
  /** null en cumplidas o sin avance. */
  ritmo: RitmoDto | null;
  creadaEl: string;
  /** ISO 8601 UTC. */
  archivadaEn: string | null;
};

export type MetasDto = {
  fechaHoy: string;
  trm: TrmDto | null;
  totales: { avance: string; objetivo: string; incompleto: boolean };
  activas: MetaDto[];
  cumplidas: MetaDto[];
};

export type FilaAporteDto = {
  id: string;
  tipo: TipoAporte;
  fecha: string;
  monto: string;
  acumulado: string;
  inicial: boolean;
  motivo: string | null;
  cuentaOrigen: { id: string; nombre: string } | null;
  movimientoId: string | null;
};

export type FilaValorDto = {
  tipo: "cierre" | "hoy";
  fecha: string;
  valor: string | null;
  variacion: string | null;
  /** Solo en "hoy" de una cuenta USD. */
  trm: TrmDto | null;
};

export type ApartadosDto = {
  saldoCuenta: string;
  apartadoAqui: string;
  otras: { metaId: string; nombre: string; apartado: string }[];
  libre: string;
  excedido: boolean;
};

export type MetaDetalleDto = MetaDto & {
  historial: FilaAporteDto[] | FilaValorDto[];
  /** Solo en "apartado". */
  apartados: ApartadosDto | null;
  /** Solo sobre una inversión: valor en su moneda y TRM de hoy (USD). */
  inversion: { valorMercado: string; moneda: Moneda; trm: TrmDto | null } | null;
};

/** Meta con lo que el dominio calculó. */
export type MetaEvaluada = {
  meta: Meta;
  cuenta: CuentaDeMeta;
  creadaEl: string;
  aportes: Aporte[];
  /** El de hoy; null en una inversión USD sin TRM. */
  avance: bigint | null;
  cumplida: Cumplimiento | null;
  uso: { fecha: string; motivo: string | null } | null;
  ritmo: Ritmo | null;
};

function aRitmoDto(r: Ritmo): RitmoDto {
  switch (r.tipo) {
    case "dias":
      return { tipo: "dias", falta: r.falta.toString(), dias: r.dias, vencida: r.vencida };
    case "meses":
      return {
        tipo: "meses",
        falta: r.falta.toString(),
        meses: r.meses,
        cuotaMensual: r.cuotaMensual.toString(),
        vencida: r.vencida,
      };
    case "promedio":
      return {
        tipo: "promedio",
        promedioMensual: r.promedioMensual?.toString() ?? null,
        mesEstimado: r.mesEstimado,
      };
  }
}

/** Avance que muestra la meta: el del cumplimiento en una cumplida (N-23). */
export function avanceMostrado(e: MetaEvaluada): bigint | null {
  return e.cumplida?.avance ?? e.avance;
}

export function aMetaDto(e: MetaEvaluada): MetaDto {
  const avance = avanceMostrado(e);
  return {
    id: e.meta.id,
    nombre: e.meta.nombre,
    modo: e.meta.modo,
    cuenta: {
      id: e.cuenta.id,
      nombre: e.cuenta.nombre,
      tipo: e.cuenta.tipo as TipoCuentaMeta,
      moneda: e.cuenta.moneda,
    },
    objetivo: e.meta.objetivo.toString(),
    avance: avance?.toString() ?? null,
    falta: avance === null ? null : falta(e.meta.objetivo, avance).toString(),
    porcentaje: avance === null ? null : porcentaje(avance, e.meta.objetivo),
    fechaMeta: formatearFechaMeta(e.meta.fechaMeta, e.meta.fechaMetaEsMes),
    cumplidaEl: e.cumplida?.fecha ?? null,
    uso: e.uso,
    ritmo: e.ritmo === null ? null : aRitmoDto(e.ritmo),
    creadaEl: e.creadaEl,
    archivadaEn: e.meta.archivadaEn?.toISOString() ?? null,
  };
}

export function aFilaAporteDto(f: FilaAporte): FilaAporteDto {
  return {
    id: f.id,
    tipo: f.tipo,
    fecha: f.fecha,
    monto: f.monto.toString(),
    acumulado: f.acumulado.toString(),
    inicial: f.inicial,
    motivo: f.motivo,
    cuentaOrigen: f.cuentaOrigen,
    movimientoId: f.movimientoId,
  };
}

export function aFilaValorDto(f: FilaValor, trmHoy: Trm | null): FilaValorDto {
  return {
    tipo: f.tipo,
    fecha: f.fecha,
    valor: f.valor?.toString() ?? null,
    variacion: f.variacion?.toString() ?? null,
    trm: f.tipo === "hoy" && trmHoy !== null ? aTrmDto(trmHoy) : null,
  };
}

export function aApartadosDto(n: NotaApartados): ApartadosDto {
  return {
    saldoCuenta: n.saldoCuenta.toString(),
    apartadoAqui: n.apartadoAqui.toString(),
    otras: n.otras.map((o) => ({
      metaId: o.metaId,
      nombre: o.nombre,
      apartado: o.apartado.toString(),
    })),
    libre: n.libre.toString(),
    excedido: n.excedido,
  };
}
