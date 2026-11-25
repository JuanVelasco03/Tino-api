/**
 * Cifras de un mes comparadas con el anterior (SPEC 06). Las transferencias no
 * cuentan como ingreso ni gasto (RN-05, RN-07). Un gasto dividido suma cada
 * parte a su categoría; uno sin categoría ni partes, a «sin categoría».
 */
import type { Categoria } from "../categorizacion/categoria.js";
import { fechaCierreDelMes, mesAnterior, rangoDelMes } from "../fecha/mes.js";
import { porcentajeEnDecimas, variacionPorcentual } from "./porcentaje.js";
import type {
  CategoriaDelMes,
  Comparacion,
  MovimientoResumen,
  ParteResumen,
  ResumenMes,
} from "./resumen.js";

type CifrasMes = {
  cantidad: number;
  ingresos: bigint;
  gastos: bigint;
  porCategoria: Map<string, bigint>;
  sinCategoria: bigint;
  cantidadSinCategoria: number;
};

export function comparar(actual: bigint, anterior: bigint): Comparacion {
  return {
    actual,
    anterior,
    variacion: actual - anterior,
    variacionPorcentaje: variacionPorcentual(actual, anterior),
  };
}

function sumar(mapa: Map<string, bigint>, clave: string, monto: bigint): void {
  mapa.set(clave, (mapa.get(clave) ?? 0n) + monto);
}

function cifrasDe(
  mes: string,
  hoy: string,
  movimientos: readonly MovimientoResumen[],
  partesPorMovimiento: ReadonlyMap<string, readonly ParteResumen[]>,
): CifrasMes {
  const { desde } = rangoDelMes(mes);
  // Mismo corte que el puente del patrimonio: lo fechado después de hoy aún no pasó.
  const hasta = fechaCierreDelMes(mes, hoy);
  const cifras: CifrasMes = {
    cantidad: 0,
    ingresos: 0n,
    gastos: 0n,
    porCategoria: new Map(),
    sinCategoria: 0n,
    cantidadSinCategoria: 0,
  };
  for (const m of movimientos) {
    if (m.fecha < desde || m.fecha > hasta) continue;
    // RN-14: un ajuste no se mezcla con ingresos, gastos ni la cantidad del mes.
    if (m.tipo === "ajuste") continue;
    cifras.cantidad++;
    if (m.tipo === "ingreso") cifras.ingresos += m.monto;
    if (m.tipo !== "gasto") continue;

    cifras.gastos += m.monto;
    const partes = partesPorMovimiento.get(m.id) ?? [];
    if (m.categoriaId !== null) {
      sumar(cifras.porCategoria, m.categoriaId, m.monto);
    } else if (partes.length > 0) {
      for (const p of partes) sumar(cifras.porCategoria, p.categoriaId, p.monto);
    } else {
      cifras.sinCategoria += m.monto;
      cifras.cantidadSinCategoria++;
    }
  }
  return cifras;
}

/** Orden descendente de dos montos, para `sort`. */
function descendente(x: bigint, y: bigint): number {
  if (x === y) return 0;
  return x > y ? -1 : 1;
}

/**
 * Resumen del mes `mes` ("YYYY-MM") frente a `M−1`. `movimientos` puede traer
 * cualquier rango: solo cuentan los de cada mes. `partes`, al menos las de los
 * gastos divididos de ambos meses.
 *
 * Cuenta hasta `fechaCierreDelMes(mes, hoy)`: en el mes actual, los
 * movimientos con fecha posterior a hoy no entran (SPEC 06).
 *
 * `categorias` del resultado: las que tienen gasto en `M` o en `M−1`, por
 * monto desc, luego anterior desc y luego `posicion`. Los porcentajes son
 * parte de los gastos de `M`.
 */
export function resumirMes(
  movimientos: readonly MovimientoResumen[],
  partes: readonly ParteResumen[],
  categorias: readonly Categoria[],
  mes: string,
  hoy: string,
): ResumenMes {
  const partesPorMovimiento = new Map<string, ParteResumen[]>();
  for (const p of partes) {
    const lista = partesPorMovimiento.get(p.movimientoId) ?? [];
    lista.push(p);
    partesPorMovimiento.set(p.movimientoId, lista);
  }

  const actual = cifrasDe(mes, hoy, movimientos, partesPorMovimiento);
  const anterior = cifrasDe(mesAnterior(mes), hoy, movimientos, partesPorMovimiento);
  const posiciones = new Map(categorias.map((c) => [c.id, c.posicion]));
  const posicionDe = (id: string) => posiciones.get(id) ?? Number.MAX_SAFE_INTEGER;

  const ids = new Set([...actual.porCategoria.keys(), ...anterior.porCategoria.keys()]);
  const filas: CategoriaDelMes[] = [...ids].map((categoriaId) => {
    const monto = actual.porCategoria.get(categoriaId) ?? 0n;
    const previo = anterior.porCategoria.get(categoriaId) ?? 0n;
    return {
      categoriaId,
      monto,
      anterior: previo,
      variacion: monto - previo,
      porcentaje: porcentajeEnDecimas(monto, actual.gastos),
    };
  });
  filas.sort(
    (x, y) =>
      descendente(x.monto, y.monto) ||
      descendente(x.anterior, y.anterior) ||
      posicionDe(x.categoriaId) - posicionDe(y.categoriaId),
  );

  return {
    cantidadMovimientos: actual.cantidad,
    ingresos: comparar(actual.ingresos, anterior.ingresos),
    gastos: comparar(actual.gastos, anterior.gastos),
    resultado: comparar(actual.ingresos - actual.gastos, anterior.ingresos - anterior.gastos),
    categorias: filas,
    sinCategoria: {
      monto: actual.sinCategoria,
      anterior: anterior.sinCategoria,
      variacion: actual.sinCategoria - anterior.sinCategoria,
      porcentaje: porcentajeEnDecimas(actual.sinCategoria, actual.gastos),
      cantidad: actual.cantidadSinCategoria,
    },
  };
}
