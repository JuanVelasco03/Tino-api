import { describe, expect, it } from "vitest";
import { configEfectiva, porDefecto, validarCambioConfig } from "./config.js";

describe("configEfectiva", () => {
  it("sin filas, los cuatro tipos con sus valores por defecto y en orden", () => {
    expect(configEfectiva([])).toEqual([
      { tipo: "recurrente", activo: true, dias: 3 },
      { tipo: "cobro", activo: true, dias: 30 },
      { tipo: "deuda", activo: true, dias: 7 },
      { tipo: "precio_manual", activo: false, dias: 7 },
    ]);
  });

  it("una fila reemplaza el valor por defecto de su tipo y deja los demás", () => {
    const config = configEfectiva([{ tipo: "precio_manual", activo: true, dias: 14 }]);
    expect(config.map((c) => c.tipo)).toEqual(["recurrente", "cobro", "deuda", "precio_manual"]);
    expect(config[3]).toEqual({ tipo: "precio_manual", activo: true, dias: 14 });
    expect(config[0]).toEqual({ tipo: "recurrente", activo: true, dias: 3 });
  });
});

describe("validarCambioConfig", () => {
  it("dias sin activo activa el tipo (N-33)", () => {
    expect(validarCambioConfig(porDefecto("precio_manual"), { dias: 14 })).toEqual({
      ok: true,
      config: { tipo: "precio_manual", activo: true, dias: 14 },
    });
  });

  it("activo y dias juntos se respetan", () => {
    expect(validarCambioConfig(porDefecto("deuda"), { activo: false, dias: 3 })).toEqual({
      ok: true,
      config: { tipo: "deuda", activo: false, dias: 3 },
    });
  });

  it("solo activo conserva los días", () => {
    expect(validarCambioConfig(porDefecto("recurrente"), { activo: false })).toEqual({
      ok: true,
      config: { tipo: "recurrente", activo: false, dias: 3 },
    });
  });

  it("cobro admite 0 (nunca se repite)", () => {
    const resultado = validarCambioConfig(porDefecto("cobro"), { dias: 0 });
    expect(resultado).toEqual({ ok: true, config: { tipo: "cobro", activo: true, dias: 0 } });
  });

  it("dias fuera de las opciones del tipo → ANTELACION_INVALIDA en dias", () => {
    expect(validarCambioConfig(porDefecto("deuda"), { dias: 5 })).toEqual({
      ok: false,
      error: { codigo: "ANTELACION_INVALIDA", campo: "dias" },
    });
    expect(validarCambioConfig(porDefecto("recurrente"), { dias: 0 })).toMatchObject({ ok: false });
  });

  it("sin campos → SIN_CAMBIOS", () => {
    expect(validarCambioConfig(porDefecto("deuda"), {})).toEqual({
      ok: false,
      error: { codigo: "SIN_CAMBIOS" },
    });
  });
});
