import { describe, expect, it } from "vitest";
import type { MovimientoEntrada } from "./movimiento.js";
import { validarMovimiento } from "./validar.js";

const base: MovimientoEntrada = {
  tipo: "gasto",
  monto: 30_000n,
  montoDestino: null,
  fecha: null,
  descripcion: null,
  nota: null,
  cuentaOrigenId: null,
  cuentaDestinoId: null,
  categoriaId: null,
  partes: null,
};

const gasto = (m: Partial<MovimientoEntrada> = {}): MovimientoEntrada => ({
  ...base,
  cuentaOrigenId: "cta-nequi",
  ...m,
});
const ingreso = (m: Partial<MovimientoEntrada> = {}): MovimientoEntrada => ({
  ...base,
  tipo: "ingreso",
  cuentaDestinoId: "cta-nequi",
  ...m,
});
const transferencia = (m: Partial<MovimientoEntrada> = {}): MovimientoEntrada => ({
  ...base,
  tipo: "transferencia",
  cuentaOrigenId: "cta-nequi",
  cuentaDestinoId: "cta-visa",
  ...m,
});

describe("monto", () => {
  it("cero o negativo → MONTO_REQUERIDO", () => {
    expect(validarMovimiento(gasto({ monto: 0n }))).toEqual({
      codigo: "MONTO_REQUERIDO",
      campo: "monto",
    });
    expect(validarMovimiento(gasto({ monto: -1n }))?.codigo).toBe("MONTO_REQUERIDO");
  });
});

describe("gasto", () => {
  it("sin categoría ni partes es válido («sin clasificar»)", () => {
    expect(validarMovimiento(gasto())).toBeNull();
  });

  it("con categoría es válido", () => {
    expect(validarMovimiento(gasto({ categoriaId: "cat-comida" }))).toBeNull();
  });

  it("sin origen → ORIGEN_REQUERIDO; cadena vacía cuenta como no informada", () => {
    expect(validarMovimiento(gasto({ cuentaOrigenId: null }))).toEqual({
      codigo: "ORIGEN_REQUERIDO",
      campo: "cuentaOrigenId",
    });
    expect(validarMovimiento(gasto({ cuentaOrigenId: "" }))?.codigo).toBe("ORIGEN_REQUERIDO");
  });

  it("con destino → DESTINO_NO_PERMITIDO", () => {
    expect(validarMovimiento(gasto({ cuentaDestinoId: "cta-visa" }))).toEqual({
      codigo: "DESTINO_NO_PERMITIDO",
      campo: "cuentaDestinoId",
    });
  });
});

describe("ingreso", () => {
  it("con destino y sin categoría es válido", () => {
    expect(validarMovimiento(ingreso())).toBeNull();
  });

  it("sin destino → DESTINO_REQUERIDO", () => {
    expect(validarMovimiento(ingreso({ cuentaDestinoId: null }))).toEqual({
      codigo: "DESTINO_REQUERIDO",
      campo: "cuentaDestinoId",
    });
  });

  it("con origen → ORIGEN_NO_PERMITIDO", () => {
    expect(validarMovimiento(ingreso({ cuentaOrigenId: "cta-visa" }))).toEqual({
      codigo: "ORIGEN_NO_PERMITIDO",
      campo: "cuentaOrigenId",
    });
  });
});

describe("transferencia (RN-03, RN-05)", () => {
  it("con origen y destino distintos, sin categoría, es válida", () => {
    expect(validarMovimiento(transferencia())).toBeNull();
  });

  it("exige origen y destino", () => {
    expect(validarMovimiento(transferencia({ cuentaOrigenId: null }))?.codigo).toBe(
      "ORIGEN_REQUERIDO",
    );
    expect(validarMovimiento(transferencia({ cuentaDestinoId: "" }))?.codigo).toBe(
      "DESTINO_REQUERIDO",
    );
  });

  it("origen = destino → CUENTAS_IGUALES", () => {
    expect(validarMovimiento(transferencia({ cuentaDestinoId: "cta-nequi" }))).toEqual({
      codigo: "CUENTAS_IGUALES",
      campo: "cuentaDestinoId",
    });
  });

  it("con categoría → CATEGORIA_NO_PERMITIDA", () => {
    expect(validarMovimiento(transferencia({ categoriaId: "cat-comida" }))).toEqual({
      codigo: "CATEGORIA_NO_PERMITIDA",
      campo: "categoriaId",
    });
  });

  it("con partes → DIVISION_NO_PERMITIDA", () => {
    const partes = [
      { categoriaId: "a", monto: 10_000n },
      { categoriaId: "b", monto: 20_000n },
    ];
    expect(validarMovimiento(transferencia({ partes }))).toEqual({
      codigo: "DIVISION_NO_PERMITIDA",
      campo: "partes",
    });
  });
});

describe("ajuste (RN-14)", () => {
  const ajuste = (m: Partial<MovimientoEntrada> = {}): MovimientoEntrada => ({
    ...base,
    tipo: "ajuste",
    ...m,
  });

  it("con una sola cuenta es válido, de origen (baja) o de destino (sube)", () => {
    expect(validarMovimiento(ajuste({ cuentaOrigenId: "cta-efectivo" }))).toBeNull();
    expect(validarMovimiento(ajuste({ cuentaDestinoId: "cta-efectivo" }))).toBeNull();
  });

  it("sin cuenta → ORIGEN_REQUERIDO; con las dos → DESTINO_NO_PERMITIDO", () => {
    expect(validarMovimiento(ajuste())).toEqual({
      codigo: "ORIGEN_REQUERIDO",
      campo: "cuentaOrigenId",
    });
    expect(
      validarMovimiento(ajuste({ cuentaOrigenId: "cta-a", cuentaDestinoId: "cta-b" })),
    ).toEqual({ codigo: "DESTINO_NO_PERMITIDO", campo: "cuentaDestinoId" });
  });

  it("con categoría → CATEGORIA_NO_PERMITIDA; con partes → DIVISION_NO_PERMITIDA", () => {
    expect(validarMovimiento(ajuste({ cuentaOrigenId: "cta", categoriaId: "cat" }))).toEqual({
      codigo: "CATEGORIA_NO_PERMITIDA",
      campo: "categoriaId",
    });
    const partes = [
      { categoriaId: "a", monto: 10_000n },
      { categoriaId: "b", monto: 20_000n },
    ];
    expect(validarMovimiento(ajuste({ cuentaOrigenId: "cta", partes }))).toEqual({
      codigo: "DIVISION_NO_PERMITIDA",
      campo: "partes",
    });
  });
});

describe("división en partes", () => {
  const comida = { categoriaId: "cat-comida", monto: 20_000n };
  const mercado = { categoriaId: "cat-mercado", monto: 10_000n };

  it("dos partes que suman el monto son válidas", () => {
    expect(validarMovimiento(gasto({ partes: [comida, mercado] }))).toBeNull();
    expect(validarMovimiento(ingreso({ partes: [comida, mercado] }))).toBeNull();
  });

  it("una lista vacía equivale a no dividir", () => {
    expect(validarMovimiento(gasto({ partes: [] }))).toBeNull();
  });

  it("partes con categoría propia → PARTES_CON_CATEGORIA", () => {
    expect(
      validarMovimiento(gasto({ categoriaId: "cat-comida", partes: [comida, mercado] })),
    ).toEqual({ codigo: "PARTES_CON_CATEGORIA", campo: "partes" });
  });

  it("una sola parte → PARTES_INSUFICIENTES", () => {
    expect(validarMovimiento(gasto({ monto: 20_000n, partes: [comida] }))).toEqual({
      codigo: "PARTES_INSUFICIENTES",
      campo: "partes",
    });
  });

  it("parte en cero → MONTO_REQUERIDO en su campo", () => {
    expect(validarMovimiento(gasto({ partes: [comida, { ...mercado, monto: 0n }] }))).toEqual({
      codigo: "MONTO_REQUERIDO",
      campo: "partes.1.monto",
    });
  });

  it("categoría repetida → PARTES_REPETIDAS", () => {
    expect(validarMovimiento(gasto({ partes: [comida, { ...comida, monto: 10_000n }] }))).toEqual({
      codigo: "PARTES_REPETIDAS",
      campo: "partes",
    });
  });

  it("partes que no suman → PARTES_NO_SUMAN", () => {
    expect(validarMovimiento(gasto({ partes: [comida, { ...mercado, monto: 5_000n }] }))).toEqual({
      codigo: "PARTES_NO_SUMAN",
      campo: "partes",
    });
  });
});
