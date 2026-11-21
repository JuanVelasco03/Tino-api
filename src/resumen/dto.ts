/**
 * Contrato HTTP del resumen del mes (SPEC 06). Montos como string entero (con
 * guion ASCII si son negativos). Fechas "YYYY-MM-DD" en la zona del usuario.
 * Excepción documentada: los porcentajes son enteros en décimas (274 = 27,4 %),
 * pueden ser negativos o pasar de 1000.
 */
import type { Ref } from "../domain/movimiento/movimiento.js";
import type {
  CambioDelMes,
  Comparacion,
  PuntoPatrimonio,
  ResumenMes,
} from "../domain/resumen/resumen.js";

export type ComparacionDto = {
  actual: string;
  anterior: string;
  variacion: string;
  variacionPorcentaje: number | null;
};

export type CategoriaResumenDto = {
  categoria: Ref;
  monto: string;
  anterior: string;
  variacion: string;
  porcentaje: number | null;
};

export type ResumenDto = {
  /** "YYYY-MM". */
  mes: string;
  /** "YYYY-MM". */
  mesAnterior: string;
  /** Primer día del mes. */
  desde: string;
  /** Último día del mes. */
  hasta: string;
  fechaHoy: string;
  /** Punto de partida: día de creación de la cuenta más antigua; null sin cuentas. */
  inicio: string | null;
  /** false → estado de día uno. Según todo el historial, no solo el mes. */
  tieneMovimientos: boolean;
  /** No archivadas. */
  cuentasActivas: number;
  cantidadMovimientos: number;
  ingresos: ComparacionDto;
  gastos: ComparacionDto;
  resultado: ComparacionDto;
  categorias: CategoriaResumenDto[];
  sinCategoria: {
    monto: string;
    anterior: string;
    variacion: string;
    porcentaje: number | null;
    cantidad: number;
  };
  patrimonio: {
    hoy: string;
    /** Ascendente; último = hoy; 1 a 12 puntos ([] sin cuentas). */
    serie: { fecha: string; patrimonio: string }[];
    /** Último − primero; "0" con menos de dos puntos. */
    variacionSerie: string;
  };
  cambioDelMes: {
    /** Último día de M−1. */
    fechaAnterior: string;
    /** Último día de M. */
    fechaCierre: string;
    patrimonioAnterior: string;
    resultado: string;
    otrosCambios: string;
    patrimonioCierre: string;
  };
};

export function aComparacionDto(c: Comparacion): ComparacionDto {
  return {
    actual: c.actual.toString(),
    anterior: c.anterior.toString(),
    variacion: c.variacion.toString(),
    variacionPorcentaje: c.variacionPorcentaje,
  };
}

/** Las categorías del resumen con su nombre. `nombres`: id → categoría del usuario. */
export function aCategoriasDto(
  resumen: ResumenMes,
  nombres: ReadonlyMap<string, Ref>,
): CategoriaResumenDto[] {
  return resumen.categorias.map((c) => {
    const categoria = nombres.get(c.categoriaId);
    if (!categoria) throw new Error(`Categoría ${c.categoriaId} sin fila visible.`);
    return {
      categoria: { id: categoria.id, nombre: categoria.nombre },
      monto: c.monto.toString(),
      anterior: c.anterior.toString(),
      variacion: c.variacion.toString(),
      porcentaje: c.porcentaje,
    };
  });
}

export function aSinCategoriaDto(resumen: ResumenMes): ResumenDto["sinCategoria"] {
  const s = resumen.sinCategoria;
  return {
    monto: s.monto.toString(),
    anterior: s.anterior.toString(),
    variacion: s.variacion.toString(),
    porcentaje: s.porcentaje,
    cantidad: s.cantidad,
  };
}

export function aSerieDto(serie: readonly PuntoPatrimonio[]): ResumenDto["patrimonio"]["serie"] {
  return serie.map((p) => ({ fecha: p.fecha, patrimonio: p.patrimonio.toString() }));
}

export function aCambioDelMesDto(c: CambioDelMes): ResumenDto["cambioDelMes"] {
  return {
    fechaAnterior: c.fechaAnterior,
    fechaCierre: c.fechaCierre,
    patrimonioAnterior: c.patrimonioAnterior.toString(),
    resultado: c.resultado.toString(),
    otrosCambios: c.otrosCambios.toString(),
    patrimonioCierre: c.patrimonioCierre.toString(),
  };
}
