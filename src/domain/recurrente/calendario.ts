/**
 * Calendario de una plantilla (SPEC 07). Único lugar que sabe qué
 * vencimientos existen: la base solo garantiza unicidad y pertenencia de los
 * cierres.
 *
 * - semanal: primerVencimiento + 7k.
 * - quincenal: el día 15 y el último día de cada mes, desde primerVencimiento.
 * - mensual, bimestral, trimestral, anual: cada 1, 2, 3 o 12 meses desde el mes
 *   de primerVencimiento. El día es el último del mes si `ultimoDia`; si no,
 *   min(día del ancla, último día del mes) (N-73). Siempre desde el ancla, no
 *   desde el vencimiento anterior: 31 → 28 → 31.
 *
 * Ocurrencias: los vencimientos con v >= generarDesde y, si está pausada,
 * v < pausadaDesde.
 */
import { diasDe, diasEntre, mesesEntre, sumarDias, sumarMeses } from "../fecha/mes.js";
import { MESES_POR_PERIODICIDAD, type Calendario } from "./recurrente.js";

const dosDigitos = (n: number) => String(n).padStart(2, "0");

const mayor = (a: string, b: string) => (a > b ? a : b);

/** Meses ("YYYY-MM") de `desde` a `hasta`, inclusive. */
function meses(desde: string, hasta: string): string[] {
  const lista: string[] = [];
  for (let mes = desde; mes <= hasta; mes = sumarMeses(mes, 1)) lista.push(mes);
  return lista;
}

function semanales(c: Calendario, desde: string, hasta: string): string[] {
  // Primer k con primerVencimiento + 7k >= desde (desde >= primerVencimiento).
  const k = Math.ceil(diasEntre(c.primerVencimiento, desde) / 7);
  const lista: string[] = [];
  for (let v = sumarDias(c.primerVencimiento, 7 * k); v <= hasta; v = sumarDias(v, 7)) {
    lista.push(v);
  }
  return lista;
}

function quincenales(desde: string, hasta: string): string[] {
  return meses(desde.slice(0, 7), hasta.slice(0, 7))
    .flatMap((mes) => [`${mes}-15`, `${mes}-${dosDigitos(diasDe(mes))}`])
    .filter((v) => v >= desde && v <= hasta);
}

function cadaMeses(c: Calendario, paso: number, desde: string, hasta: string): string[] {
  const mesAncla = c.primerVencimiento.slice(0, 7);
  const diaAncla = Number(c.primerVencimiento.slice(8, 10));
  return meses(desde.slice(0, 7), hasta.slice(0, 7))
    .filter((mes) => mesesEntre(mesAncla, mes) % paso === 0)
    .map((mes) => {
      const dias = diasDe(mes);
      return `${mes}-${dosDigitos(c.ultimoDia ? dias : Math.min(diaAncla, dias))}`;
    })
    .filter((v) => v >= desde && v <= hasta);
}

/**
 * Ocurrencias del calendario entre `desde` y `hasta` (inclusive), en orden.
 * Respeta generarDesde y pausadaDesde.
 */
export function vencimientos(c: Calendario, desde: string, hasta: string): string[] {
  const inicio = mayor(mayor(desde, c.generarDesde), c.primerVencimiento);
  const fin =
    c.pausadaDesde !== null && c.pausadaDesde <= hasta ? sumarDias(c.pausadaDesde, -1) : hasta;
  if (inicio > fin) return [];

  switch (c.periodicidad) {
    case "semanal":
      return semanales(c, inicio, fin);
    case "quincenal":
      return quincenales(inicio, fin);
    default:
      return cadaMeses(c, MESES_POR_PERIODICIDAD[c.periodicidad], inicio, fin);
  }
}
