/** Datos de apoyo de las pruebas de avisos (SPEC 12). Hoy es 2026-11-11 en Bogotá. */
import type { Contexto } from "./aviso.js";

export const ZONA = "America/Bogota";
export const HOY = "2026-11-11";

/** Las `hora` locales de `fecha` en Bogotá (UTC−5). */
export function local(fecha: string, hora = "08:00"): Date {
  const [h, m] = hora.split(":").map(Number) as [number, number];
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, dia, h + 5, m));
}

/** Hoy a las 10:00 locales, salvo que se diga otra hora. */
export function contexto(hora = "10:00", hoy = HOY): Contexto {
  return { ahora: local(hoy, hora), zona: ZONA, hoy };
}
