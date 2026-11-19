/**
 * Contrato HTTP de cuentas. Todo monto viaja como string de entero en
 * unidades menores; el saldo de un pasivo va positivo (deuda vigente) y el
 * signo «−» lo pone el cliente.
 */
import type { Cuenta, GrupoCuentas, ResumenCuentas } from "../domain/cuenta/cuenta.js";
import { cupoDisponible, porcentajeUsado } from "../domain/cuenta/cupo.js";
import { naturalezaDe, type Naturaleza } from "../domain/cuenta/naturaleza.js";

export type CuentaDto = {
  id: string;
  nombre: string;
  tipo: "efectivo" | "banco" | "tarjeta_credito";
  naturaleza: Naturaleza;
  detalle: string | null;
  saldo: string;
  saldoInicial: string;
  tarjeta: { cupo: string; disponible: string; porcentajeUsado: number } | null;
  archivadaEn: string | null;
};

export type GrupoCuentasDto = { total: string; cuentas: CuentaDto[] };

export type ListaCuentasDto = {
  fechaSaldos: string;
  activos: GrupoCuentasDto;
  pasivos: GrupoCuentasDto;
  patrimonioNeto: string;
};

export function aCuentaDto(cuenta: Cuenta): CuentaDto {
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    naturaleza: naturalezaDe(cuenta.tipo),
    detalle: cuenta.detalle,
    saldo: cuenta.saldo.toString(),
    saldoInicial: cuenta.saldoInicial.toString(),
    tarjeta:
      cuenta.cupo === null
        ? null
        : {
            cupo: cuenta.cupo.toString(),
            disponible: cupoDisponible(cuenta.cupo, cuenta.saldo).toString(),
            porcentajeUsado: porcentajeUsado(cuenta.cupo, cuenta.saldo),
          },
    archivadaEn: cuenta.archivadaEn === null ? null : cuenta.archivadaEn.toISOString(),
  };
}

function aGrupoDto(grupo: GrupoCuentas): GrupoCuentasDto {
  return { total: grupo.total.toString(), cuentas: grupo.cuentas.map(aCuentaDto) };
}

export function aListaCuentasDto(resumen: ResumenCuentas, fechaSaldos: string): ListaCuentasDto {
  return {
    fechaSaldos,
    activos: aGrupoDto(resumen.activos),
    pasivos: aGrupoDto(resumen.pasivos),
    patrimonioNeto: resumen.patrimonioNeto.toString(),
  };
}
