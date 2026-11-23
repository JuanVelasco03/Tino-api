/**
 * Historial de una meta (SPEC 13, N-27 a N-31): filas de aportes con su
 * acumulado (apartado) o valores al cierre de cada mes (modo `cuenta`).
 */
import { mesAnterior, sumarMeses, ultimoDia } from "../fecha/mes.js";
import { enOrden } from "./avance.js";
import type { Aporte } from "./meta.js";

export type FilaAporte = Aporte & { acumulado: bigint };

/** Sus filas, la más reciente primero, con el acumulado tras cada una. */
export function historialAportes(aportes: readonly Aporte[]): FilaAporte[] {
  let acumulado = 0n;
  return enOrden(aportes)
    .map((a) => {
      acumulado += a.tipo === "aporte" ? a.monto : -a.monto;
      return { ...a, acumulado };
    })
    .reverse();
}

/**
 * Fechas de cierre del historial de valor: la de creación si no es fin de
 * mes y cada fin de mes desde el mes de creación hasta el anterior a hoy.
 * Ascendentes; ninguna ≥ hoy (la de hoy va en su propia fila).
 */
export function fechasDeCierre(creadaEl: string, hoy: string): string[] {
  const fechas: string[] = [];
  if (creadaEl < hoy && creadaEl !== ultimoDia(creadaEl.slice(0, 7))) fechas.push(creadaEl);
  const ultimoMes = mesAnterior(hoy.slice(0, 7));
  for (let mes = creadaEl.slice(0, 7); mes <= ultimoMes; mes = sumarMeses(mes, 1)) {
    const cierre = ultimoDia(mes);
    if (cierre >= creadaEl && cierre < hoy) fechas.push(cierre);
  }
  return fechas;
}

export type FilaValor = {
  tipo: "cierre" | "hoy";
  fecha: string;
  valor: bigint | null;
  variacion: bigint | null;
};

/**
 * Una fila `cierre` por cada fecha de `fechasDeCierre` y una fila `hoy`.
 * `variacion`: valor − valor de la fila anterior; nula en la primera o si
 * alguno de los dos es nulo.
 */
export function historialValor(
  creadaEl: string,
  hoy: string,
  valorEn: (fecha: string) => bigint | null,
): FilaValor[] {
  const filas: FilaValor[] = [];
  const fechas = [
    ...fechasDeCierre(creadaEl, hoy).map((fecha) => ({ tipo: "cierre" as const, fecha })),
    { tipo: "hoy" as const, fecha: hoy },
  ];
  let anterior: bigint | null | undefined;
  for (const { tipo, fecha } of fechas) {
    const valor = valorEn(fecha);
    const variacion =
      anterior === undefined || anterior === null || valor === null ? null : valor - anterior;
    filas.push({ tipo, fecha, valor, variacion });
    anterior = valor;
  }
  return filas;
}
