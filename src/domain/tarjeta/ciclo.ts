/**
 * Ciclo de facturación de una tarjeta (SPEC 14). Fechas "YYYY-MM-DD" en la
 * zona del perfil. La deuda es la de un pasivo (RN-02): una salida la sube, una
 * entrada la baja.
 */
import { compararCronologico } from "../cuenta/historial.js";
import { diasDe, diasEntre, sumarDias, sumarMeses } from "../fecha/mes.js";
import type { Movimiento } from "../movimiento/movimiento.js";
import type { ClaseCargo } from "./tarjeta.js";

const dosDigitos = (n: number): string => String(n).padStart(2, "0");

const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** Fecha del día `dia` en `mes` ("YYYY-MM"); en un mes más corto, su último día (N-76). */
export function fechaDeDia(mes: string, dia: number): string {
  return `${mes}-${dosDigitos(Math.min(dia, diasDe(mes)))}`;
}

/** Primer corte ≥ hoy: un consumo del día del corte entra en ese ciclo (N-78). */
export function proximoCorte(hoy: string, diaCorte: number): string {
  const esteMes = fechaDeDia(mesDe(hoy), diaCorte);
  return esteMes >= hoy ? esteMes : fechaDeDia(sumarMeses(mesDe(hoy), 1), diaCorte);
}

/** Pago límite de un corte: el día de pago posterior al corte, ese mes o el siguiente (N-77). */
export function pagoLimite(corte: string, diaPago: number): string {
  const esteMes = fechaDeDia(mesDe(corte), diaPago);
  return esteMes > corte ? esteMes : fechaDeDia(sumarMeses(mesDe(corte), 1), diaPago);
}

export type FechasCiclo = {
  inicio: string;
  corte: string;
  corteAnterior: string;
  pagoLimite: string;
  diasHastaCorte: number;
  diasHastaPago: number;
};

export function fechasDelCiclo(
  condiciones: { diaCorte: number; diaPago: number },
  hoy: string,
): FechasCiclo {
  const corte = proximoCorte(hoy, condiciones.diaCorte);
  const corteAnterior = fechaDeDia(sumarMeses(mesDe(corte), -1), condiciones.diaCorte);
  const pago = pagoLimite(corte, condiciones.diaPago);
  return {
    inicio: sumarDias(corteAnterior, 1),
    corte,
    corteAnterior,
    pagoLimite: pago,
    diasHastaCorte: diasEntre(hoy, corte),
    diasHastaPago: diasEntre(hoy, pago),
  };
}

export type CargoCiclo = { movimiento: Movimiento; clase: ClaseCargo };

export type CicloTarjeta = FechasCiclo & {
  saldoCorteAnterior: bigint;
  abonos: Movimiento[];
  saldoAnteriorPendiente: bigint;
  pagoSugerido: bigint;
  consumos: Movimiento[];
  totalConsumos: bigint;
  cargos: CargoCiclo[];
  totalCargos: bigint;
  deudaAlCorte: bigint;
};

/** Lo que entra a la tarjeta (baja la deuda). */
const entrada = (cuentaId: string, m: Movimiento): bigint =>
  m.cuentaDestino?.id === cuentaId ? (m.montoDestino ?? m.monto) : 0n;

/** Lo que sale de la tarjeta (sube la deuda). */
const salida = (cuentaId: string, m: Movimiento): bigint =>
  m.cuentaOrigen?.id === cuentaId ? m.monto : 0n;

/**
 * Ciclo en curso de la tarjeta `cuenta` con sus `movimientos` (los que la
 * tocan). `clases`: categorías de cargo por id (`clasesDeCargo`).
 */
export function cicloDeTarjeta(
  cuenta: { id: string; saldoInicial: bigint },
  movimientos: readonly Movimiento[],
  condiciones: { diaCorte: number; diaPago: number },
  hoy: string,
  clases: ReadonlyMap<string, ClaseCargo>,
): CicloTarjeta {
  const fechas = fechasDelCiclo(condiciones, hoy);
  const ordenados = [...movimientos].sort(compararCronologico);

  // En el primer ciclo es el saldo inicial (N-80).
  let saldoCorteAnterior = cuenta.saldoInicial;
  const abonos: Movimiento[] = [];
  const consumos: Movimiento[] = [];
  const cargos: CargoCiclo[] = [];
  let totalAbonos = 0n;
  let totalConsumos = 0n;
  let totalCargos = 0n;

  for (const m of ordenados) {
    const entra = entrada(cuenta.id, m);
    const sale = salida(cuenta.id, m);
    if (m.fecha <= fechas.corteAnterior) {
      saldoCorteAnterior += sale - entra;
      continue;
    }
    if (m.fecha > fechas.corte) continue;
    if (entra > 0n) {
      abonos.push(m);
      totalAbonos += entra;
    }
    if (sale > 0n) {
      // Un gasto dividido no es cargo.
      const clase =
        m.tipo === "gasto" && m.categoria !== null ? clases.get(m.categoria.id) : undefined;
      if (clase === undefined) {
        // Incluye los avances: transferencias que salen de la tarjeta.
        consumos.push(m);
        totalConsumos += sale;
      } else {
        cargos.push({ movimiento: m, clase });
        totalCargos += sale;
      }
    }
  }

  const saldoAnteriorPendiente = saldoCorteAnterior - totalAbonos;
  return {
    ...fechas,
    saldoCorteAnterior,
    abonos,
    saldoAnteriorPendiente,
    pagoSugerido: saldoAnteriorPendiente > 0n ? saldoAnteriorPendiente : 0n,
    consumos,
    totalConsumos,
    cargos,
    totalCargos,
    deudaAlCorte: saldoAnteriorPendiente + totalConsumos + totalCargos,
  };
}
