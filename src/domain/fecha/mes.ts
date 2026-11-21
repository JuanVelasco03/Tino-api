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

/** Días del mes ("YYYY-MM"). Lanza si el mes no es válido. */
export function diasDe(mes: string): number {
  if (!esMesValido(mes)) throw new Error(`Mes inválido: ${mes}`);
  const [anio, numero] = mes.split("-").map(Number) as [number, number];
  return diasDelMes(anio, numero);
}

/** Fecha `dias` días después de `fecha` ("YYYY-MM-DD"). */
export function sumarDias(fecha: string, dias: number): string {
  return restarDias(fecha, -dias);
}

/** Mes `meses` meses después de `mes` ("YYYY-MM"); admite negativos. */
export function sumarMeses(mes: string, meses: number): string {
  if (!esMesValido(mes)) throw new Error(`Mes inválido: ${mes}`);
  const [anio, numero] = mes.split("-").map(Number) as [number, number];
  const indice = anio * 12 + (numero - 1) + meses;
  return `${Math.floor(indice / 12)}-${dosDigitos((indice % 12) + 1)}`;
}

/** Meses de `desde` a `hasta` ("YYYY-MM"); negativo si `hasta` es anterior. */
export function mesesEntre(desde: string, hasta: string): number {
  if (!esMesValido(desde) || !esMesValido(hasta))
    throw new Error(`Mes inválido: ${desde}, ${hasta}`);
  const [a1, m1] = desde.split("-").map(Number) as [number, number];
  const [a2, m2] = hasta.split("-").map(Number) as [number, number];
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Días de `desde` a `hasta` ("YYYY-MM-DD"); negativo si `hasta` es anterior. */
export function diasEntre(desde: string, hasta: string): number {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new Error(`Fecha inválida: ${desde}, ${hasta}`);
  }
  const utc = (f: string) => {
    const [anio, mes, dia] = f.split("-").map(Number) as [number, number, number];
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
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

/** Mes anterior: "2026-01" → "2025-12". Lanza si el mes no es válido. */
export function mesAnterior(mes: string): string {
  if (!esMesValido(mes)) throw new Error(`Mes inválido: ${mes}`);
  const [anio, numero] = mes.split("-").map(Number) as [number, number];
  return numero === 1 ? `${anio - 1}-12` : `${anio}-${dosDigitos(numero - 1)}`;
}

/** Último día del mes ("YYYY-MM-DD"). Lanza si el mes no es válido. */
export function ultimoDia(mes: string): string {
  return rangoDelMes(mes).hasta;
}

/** Los `cantidad` meses anteriores a `mes`, en orden ascendente (sin incluir `mes`). */
export function mesesAnteriores(mes: string, cantidad: number): string[] {
  const meses: string[] = [];
  let actual = mes;
  for (let i = 0; i < cantidad; i++) {
    actual = mesAnterior(actual);
    meses.unshift(actual);
  }
  return meses;
}
