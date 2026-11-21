import { describe, expect, it } from "vitest";
import type { Categoria } from "../categorizacion/categoria.js";
import { resumirMes } from "./mes.js";
import type { MovimientoResumen, ParteResumen } from "./resumen.js";

const NEQUI = "nequi";
const TARJETA = "tarjeta";

const categorias: Categoria[] = [
  { id: "comida", nombre: "Comida", tipo: "gasto", posicion: 0 },
  { id: "transporte", nombre: "Transporte", tipo: "gasto", posicion: 1 },
  { id: "mercado", nombre: "Mercado", tipo: "gasto", posicion: 3 },
  { id: "salario", nombre: "Salario", tipo: "ingreso", posicion: 0 },
];

let siguiente = 0;
function mov(
  datos: Partial<MovimientoResumen> & Pick<MovimientoResumen, "tipo" | "monto" | "fecha">,
): MovimientoResumen {
  return {
    id: `m${++siguiente}`,
    cuentaOrigenId: datos.tipo === "ingreso" ? null : NEQUI,
    cuentaDestinoId: datos.tipo === "gasto" ? null : TARJETA,
    categoriaId: null,
    ...datos,
  };
}

/** Escenario de los criterios de aceptación de SPEC 06, con M = 2026-11. */
function escenario(): { movimientos: MovimientoResumen[]; partes: ParteResumen[] } {
  const dividido = mov({
    tipo: "gasto",
    monto: 90_000n,
    fecha: "2026-11-01",
    cuentaOrigenId: TARJETA,
  });
  const movimientos = [
    mov({
      tipo: "ingreso",
      monto: 2_000_000n,
      fecha: "2026-10-05",
      cuentaDestinoId: NEQUI,
      categoriaId: "salario",
    }),
    mov({ tipo: "gasto", monto: 300_000n, fecha: "2026-10-06", categoriaId: "comida" }),
    mov({ tipo: "gasto", monto: 20_000n, fecha: "2026-10-07", categoriaId: "transporte" }),
    mov({ tipo: "gasto", monto: 100_000n, fecha: "2026-10-08", cuentaOrigenId: TARJETA }),
    mov({ tipo: "transferencia", monto: 50_000n, fecha: "2026-10-09" }),
    mov({ tipo: "gasto", monto: 200_000n, fecha: "2026-11-01", categoriaId: "comida" }),
    dividido,
    mov({ tipo: "gasto", monto: 10_000n, fecha: "2026-11-01" }),
  ];
  const partes: ParteResumen[] = [
    { movimientoId: dividido.id, categoriaId: "comida", monto: 60_000n },
    { movimientoId: dividido.id, categoriaId: "mercado", monto: 30_000n },
  ];
  return { movimientos, partes };
}

describe("resumirMes", () => {
  it("las cifras del escenario coinciden con los criterios de aceptación", () => {
    const { movimientos, partes } = escenario();
    const r = resumirMes(movimientos, partes, categorias, "2026-11");

    expect(r.cantidadMovimientos).toBe(3);
    expect(r.ingresos).toEqual({
      actual: 0n,
      anterior: 2_000_000n,
      variacion: -2_000_000n,
      variacionPorcentaje: -1000,
    });
    expect(r.gastos).toEqual({
      actual: 300_000n,
      anterior: 420_000n,
      variacion: -120_000n,
      variacionPorcentaje: -286,
    });
    expect(r.resultado).toEqual({
      actual: -300_000n,
      anterior: 1_580_000n,
      variacion: -1_880_000n,
      variacionPorcentaje: -1190,
    });
  });

  it("las transferencias no suman como ingreso ni gasto, pero sí se cuentan", () => {
    const movimientos = [
      mov({ tipo: "transferencia", monto: 500_000n, fecha: "2026-11-03" }),
      mov({ tipo: "gasto", monto: 1_000n, fecha: "2026-11-03" }),
    ];
    const r = resumirMes(movimientos, [], categorias, "2026-11");
    expect(r.ingresos.actual).toBe(0n);
    expect(r.gastos.actual).toBe(1_000n);
    expect(r.cantidadMovimientos).toBe(2);
  });

  it("el gasto dividido se reparte entre sus partes", () => {
    const { movimientos, partes } = escenario();
    const r = resumirMes(movimientos, partes, categorias, "2026-11");
    expect(r.categorias.find((c) => c.categoriaId === "comida")).toMatchObject({
      monto: 260_000n,
      anterior: 300_000n,
      porcentaje: 867,
    });
    expect(r.categorias.find((c) => c.categoriaId === "mercado")).toMatchObject({
      monto: 30_000n,
      anterior: 0n,
      porcentaje: 100,
    });
  });

  it("una categoría con gasto solo en M−1 aparece con 0", () => {
    const { movimientos, partes } = escenario();
    const r = resumirMes(movimientos, partes, categorias, "2026-11");
    expect(r.categorias.find((c) => c.categoriaId === "transporte")).toEqual({
      categoriaId: "transporte",
      monto: 0n,
      anterior: 20_000n,
      variacion: -20_000n,
      porcentaje: 0,
    });
  });

  it("ordena por monto desc, anterior desc y posición; «sin categoría» va aparte", () => {
    const { movimientos, partes } = escenario();
    const r = resumirMes(movimientos, partes, categorias, "2026-11");
    expect(r.categorias.map((c) => c.categoriaId)).toEqual(["comida", "mercado", "transporte"]);
  });

  it("con monto igual desempata por anterior y luego por posición", () => {
    const movimientos = [
      mov({ tipo: "gasto", monto: 5_000n, fecha: "2026-11-02", categoriaId: "mercado" }),
      mov({ tipo: "gasto", monto: 5_000n, fecha: "2026-11-02", categoriaId: "comida" }),
      mov({ tipo: "gasto", monto: 5_000n, fecha: "2026-11-02", categoriaId: "transporte" }),
      mov({ tipo: "gasto", monto: 1_000n, fecha: "2026-10-02", categoriaId: "transporte" }),
    ];
    const r = resumirMes(movimientos, [], categorias, "2026-11");
    expect(r.categorias.map((c) => c.categoriaId)).toEqual(["transporte", "comida", "mercado"]);
  });

  it("«sin categoría» lleva su cantidad del mes", () => {
    const { movimientos, partes } = escenario();
    const r = resumirMes(movimientos, partes, categorias, "2026-11");
    expect(r.sinCategoria).toEqual({
      monto: 10_000n,
      anterior: 100_000n,
      variacion: -90_000n,
      porcentaje: 33,
      cantidad: 1,
    });
  });

  it("un mes sin movimientos da ceros y porcentajes nulos", () => {
    const r = resumirMes([], [], categorias, "2026-11");
    expect(r.cantidadMovimientos).toBe(0);
    expect(r.ingresos).toEqual({
      actual: 0n,
      anterior: 0n,
      variacion: 0n,
      variacionPorcentaje: null,
    });
    expect(r.categorias).toEqual([]);
    expect(r.sinCategoria).toEqual({
      monto: 0n,
      anterior: 0n,
      variacion: 0n,
      porcentaje: null,
      cantidad: 0,
    });
  });

  it("ignora los movimientos fuera de M y M−1", () => {
    const movimientos = [
      mov({ tipo: "gasto", monto: 7_000n, fecha: "2026-09-30", categoriaId: "comida" }),
      mov({ tipo: "gasto", monto: 7_000n, fecha: "2026-12-01", categoriaId: "comida" }),
    ];
    const r = resumirMes(movimientos, [], categorias, "2026-11");
    expect(r.gastos.actual).toBe(0n);
    expect(r.gastos.anterior).toBe(0n);
    expect(r.categorias).toEqual([]);
  });
});
