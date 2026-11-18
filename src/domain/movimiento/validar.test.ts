import { describe, expect, it } from "vitest";
import { validarMovimiento } from "./validar.js";

describe("transferencia (RN-03, RN-05)", () => {
  it("es válida con origen y destino distintos y sin categoría", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaOrigenId: "cta-bancolombia",
      cuentaDestinoId: "cta-nequi",
    });
    expect(r).toEqual({ valido: true, errores: [] });
  });

  it("exige cuenta de origen", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaDestinoId: "cta-nequi",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("ORIGEN_REQUERIDO");
  });

  it("exige cuenta de destino", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaOrigenId: "cta-bancolombia",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("DESTINO_REQUERIDO");
  });

  it("informa ambos errores si faltan las dos cuentas", () => {
    const r = validarMovimiento({ tipo: "transferencia", monto: 500_000n });
    expect(r.valido).toBe(false);
    expect(r.errores).toEqual(expect.arrayContaining(["ORIGEN_REQUERIDO", "DESTINO_REQUERIDO"]));
  });

  it("trata una cadena vacía como cuenta no informada", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaOrigenId: "",
      cuentaDestinoId: "cta-nequi",
    });
    expect(r.errores).toContain("ORIGEN_REQUERIDO");
  });

  it("rechaza origen y destino iguales", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaOrigenId: "cta-nequi",
      cuentaDestinoId: "cta-nequi",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("CUENTAS_IGUALES");
  });

  it("no admite categoría (RN-05)", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 500_000n,
      cuentaOrigenId: "cta-bancolombia",
      cuentaDestinoId: "cta-nequi",
      categoriaId: "cat-mercado",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("CATEGORIA_NO_PERMITIDA");
  });

  it("pagar la tarjeta es una transferencia válida hacia la cuenta de tarjeta (RN-07)", () => {
    const r = validarMovimiento({
      tipo: "transferencia",
      monto: 300_000n,
      cuentaOrigenId: "cta-bancolombia",
      cuentaDestinoId: "cta-visa",
    });
    expect(r.valido).toBe(true);
  });
});

describe("ingreso", () => {
  it("es válido con cuenta destino y categoría", () => {
    const r = validarMovimiento({
      tipo: "ingreso",
      monto: 3_500_000n,
      cuentaDestinoId: "cta-bancolombia",
      categoriaId: "cat-salario",
    });
    expect(r).toEqual({ valido: true, errores: [] });
  });

  it("exige cuenta destino", () => {
    const r = validarMovimiento({
      tipo: "ingreso",
      monto: 3_500_000n,
      categoriaId: "cat-salario",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("DESTINO_REQUERIDO");
  });

  it("exige categoría", () => {
    const r = validarMovimiento({
      tipo: "ingreso",
      monto: 3_500_000n,
      cuentaDestinoId: "cta-bancolombia",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("CATEGORIA_REQUERIDA");
  });
});

describe("gasto", () => {
  it("es válido con cuenta de origen y categoría", () => {
    const r = validarMovimiento({
      tipo: "gasto",
      monto: 85_000n,
      cuentaOrigenId: "cta-efectivo",
      categoriaId: "cat-mercado",
    });
    expect(r).toEqual({ valido: true, errores: [] });
  });

  it("exige cuenta de origen", () => {
    const r = validarMovimiento({
      tipo: "gasto",
      monto: 85_000n,
      categoriaId: "cat-mercado",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("ORIGEN_REQUERIDO");
  });

  it("exige categoría", () => {
    const r = validarMovimiento({
      tipo: "gasto",
      monto: 85_000n,
      cuentaOrigenId: "cta-efectivo",
    });
    expect(r.valido).toBe(false);
    expect(r.errores).toContain("CATEGORIA_REQUERIDA");
  });
});
