/**
 * Contrato HTTP de la TRM (SPEC 09). El valor va como string con dos
 * decimales (COP por US$ 1), nunca `number`. Fechas "YYYY-MM-DD".
 */
import type { Trm, TrmResuelta } from "../domain/trm/trm.js";
import { formatearValor } from "../domain/trm/valor.js";

/** Hoy hay una sola fuente: la Superfinanciera certifica la TRM. */
export const FUENTE_TRM = "Superintendencia Financiera de Colombia";

export type TrmDto = {
  /** "3461.92": COP por US$ 1, siempre con dos decimales. */
  valor: string;
  vigenteDesde: string;
  /** Puede ser posterior a `vigenteDesde` (fin de semana). */
  vigenteHasta: string;
  fuente: string;
};

export type TrmVigenteDto = {
  /** "YYYY-MM-DD" en la zona del usuario. */
  fechaHoy: string;
  /** `null` si nunca se obtuvo ninguna. */
  trm: TrmDto | null;
  /** `true`: la fuente falló y `trm` es la última conocida, que no cubre hoy. */
  desactualizada: boolean;
};

export function aTrmDto(trm: Trm): TrmDto {
  return {
    valor: formatearValor(trm.valorCent),
    vigenteDesde: trm.vigenteDesde,
    vigenteHasta: trm.vigenteHasta,
    fuente: FUENTE_TRM,
  };
}

export function aTrmVigenteDto(fechaHoy: string, resuelta: TrmResuelta): TrmVigenteDto {
  return {
    fechaHoy,
    trm: resuelta.trm === null ? null : aTrmDto(resuelta.trm),
    desactualizada: resuelta.desactualizada,
  };
}
