/**
 * Contrato HTTP de cuentas. Todo monto viaja como string de entero en
 * unidades menores; el saldo de un pasivo va positivo (deuda vigente) y el
 * signo «−» lo pone el cliente.
 *
 * Inversiones (SPEC 10): `saldo` es el valor de mercado en COP; `saldoInicial`
 * y el bloque `inversion`, en la moneda de la cuenta.
 */
import type {
  Cuenta,
  GrupoCuentas,
  ResumenCuentas,
  TipoCuentaVisible,
} from "../domain/cuenta/cuenta.js";
import { cupoDisponible, porcentajeUsado } from "../domain/cuenta/cupo.js";
import { naturalezaDe, type Naturaleza } from "../domain/cuenta/naturaleza.js";
import type { Moneda } from "../domain/inversion/inversion.js";
import type { Ref } from "../domain/movimiento/movimiento.js";
import { tasaEfectivaAnual } from "../domain/tarjeta/tasa.js";
import type { TrmResuelta } from "../domain/trm/trm.js";
import { formatearValor } from "../domain/trm/valor.js";
import { aTrmDto, type TrmDto } from "../trm/dto.js";

export type CuentaDto = {
  id: string;
  nombre: string;
  tipo: TipoCuentaVisible;
  /** "COP" salvo en una inversión en dólares. */
  moneda: Moneda;
  naturaleza: Naturaleza;
  detalle: string | null;
  /** En una inversión, su valor de mercado en COP ("0" si es USD y no hay TRM). */
  saldo: string;
  /** En una inversión, el efectivo inicial en su moneda. */
  saldoInicial: string;
  tarjeta: TarjetaDto | null;
  /** Solo en una inversión, en su moneda. `tasa`: la TRM aplicada, o null en COP o sin TRM. */
  inversion: { efectivo: string; valorMercado: string; tasa: string | null } | null;
  archivadaEn: string | null;
};

/**
 * Tarjeta de crédito: cupo (SPEC 03) y condiciones (SPEC 14). Una tarjeta sin
 * condiciones trae los cinco campos de condiciones en null (N-79).
 */
export type TarjetaDto = {
  cupo: string;
  disponible: string;
  porcentajeUsado: number;
  diaCorte: number | null;
  diaPago: number | null;
  /** Centésimas de punto: 198 = 1,98 % M.V. */
  tasaMensual: number | null;
  /** Centésimas de punto, truncado: 2652 = 26,52 % E.A. */
  tasaEfectivaAnual: number | null;
  cuotaManejo: string | null;
  cuentaPago: Ref | null;
};

export type GrupoCuentasDto = { total: string; cuentas: CuentaDto[] };

export type ListaCuentasDto = {
  fechaSaldos: string;
  activos: GrupoCuentasDto;
  pasivos: GrupoCuentasDto;
  /** Capital pendiente de los préstamos (SPEC 08): no salen en los grupos. */
  prestamos: { teDeben: string; debes: string };
  /** activos − pasivos + prestamos.teDeben − prestamos.debes. */
  patrimonioNeto: string;
  /** TRM de hoy (SPEC 09, N-74); null si nunca se obtuvo. */
  trm: TrmDto | null;
  trmDesactualizada: boolean;
};

export function aCuentaDto(cuenta: Cuenta): CuentaDto {
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    moneda: cuenta.moneda,
    naturaleza: naturalezaDe(cuenta.tipo),
    detalle: cuenta.detalle,
    saldo: cuenta.saldo.toString(),
    saldoInicial: cuenta.saldoInicial.toString(),
    tarjeta: cuenta.cupo === null ? null : aTarjetaDto(cuenta, cuenta.cupo),
    inversion:
      cuenta.inversion === null
        ? null
        : {
            efectivo: cuenta.inversion.efectivo.toString(),
            valorMercado: cuenta.inversion.valorMercado.toString(),
            tasa:
              cuenta.inversion.trmCent === null ? null : formatearValor(cuenta.inversion.trmCent),
          },
    archivadaEn: cuenta.archivadaEn === null ? null : cuenta.archivadaEn.toISOString(),
  };
}

function aTarjetaDto(cuenta: Cuenta, cupo: bigint): TarjetaDto {
  const c = cuenta.condiciones ?? null;
  return {
    cupo: cupo.toString(),
    disponible: cupoDisponible(cupo, cuenta.saldo).toString(),
    porcentajeUsado: porcentajeUsado(cupo, cuenta.saldo),
    diaCorte: c?.diaCorte ?? null,
    diaPago: c?.diaPago ?? null,
    tasaMensual: c?.tasaMensualCpb ?? null,
    tasaEfectivaAnual:
      c === null || c.tasaMensualCpb === null ? null : tasaEfectivaAnual(c.tasaMensualCpb),
    cuotaManejo: c === null || c.cuotaManejo === null ? null : c.cuotaManejo.toString(),
    cuentaPago: c?.cuentaPago ?? null,
  };
}

function aGrupoDto(grupo: GrupoCuentas): GrupoCuentasDto {
  return { total: grupo.total.toString(), cuentas: grupo.cuentas.map(aCuentaDto) };
}

export function aListaCuentasDto(
  resumen: ResumenCuentas,
  fechaSaldos: string,
  trm: TrmResuelta,
): ListaCuentasDto {
  return {
    fechaSaldos,
    activos: aGrupoDto(resumen.activos),
    pasivos: aGrupoDto(resumen.pasivos),
    prestamos: {
      teDeben: resumen.prestamos.teDeben.toString(),
      debes: resumen.prestamos.debes.toString(),
    },
    patrimonioNeto: resumen.patrimonioNeto.toString(),
    trm: trm.trm === null ? null : aTrmDto(trm.trm),
    trmDesactualizada: trm.desactualizada,
  };
}
