/**
 * Meses y días calendario. Una fecha "YYYY-MM-DD" es el día contable del
 * usuario y no tiene zona; un mes es "YYYY-MM".
 */
import { fechaLocal } from "./fecha-local.js";

const FORMATO_MES = /^(\d{4})-(\d{2})$/;
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Días del mes (`mes` de 1 a 12). */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Mes ("YYYY-MM") de un instante en una zona horaria IANA. */
export function mesLocal(ahora: Date, zonaHoraria: string): string {
  return fechaLocal(ahora, zonaHoraria).slice(0, 7);
}

export function esMesValido(mes: string): boolean {
  const m = FORMATO_MES.exec(mes);
  if (!m) return false;
  const numero = Number(m[2]);
  return numero >= 1 && numero <= 12;
}

/** "YYYY-MM-DD" que existe en el calendario (sin 2026-02-30). */
export function esFechaValida(fecha: string): boolean {
  const m = FORMATO_FECHA.exec(fecha);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes);
}

/** Primer y último día del mes, inclusive. Lanza si el mes no es válido. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  if (!esMesValido(mes)) throw new Error(`Mes inválido: ${mes}`);
  const [anio, numero] = mes.split("-").map(Number) as [number, number];
  return { desde: `${mes}-01`, hasta: `${mes}-${dosDigitos(diasDelMes(anio, numero))}` };
}

/** Fecha `dias` días antes de `fecha` ("YYYY-MM-DD"). */
export function restarDias(fecha: string, dias: number): string {
  if (!esFechaValida(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  const resultado = new Date(Date.UTC(anio, mes - 1, dia - dias));
  return [
    resultado.getUTCFullYear(),
    dosDigitos(resultado.getUTCMonth() + 1),
    dosDigitos(resultado.getUTCDate()),
  ].join("-");
}
