import { describe, expect, it } from "vitest";
import { puedeArchivar, validarAlta, validarEdicion } from "./validar.js";

describe("validarAlta", () => {
  it("tarjeta sin cupo da CUPO_REQUERIDO", () => {
    expect(validarAlta({ tipo: "tarjeta_credito" })).toBe("CUPO_REQUERIDO");
    expect(validarAlta({ tipo: "tarjeta_credito", cupo: null })).toBe("CUPO_REQUERIDO");
  });

  it("tarjeta con cupo cero da CUPO_REQUERIDO", () => {
    expect(validarAlta({ tipo: "tarjeta_credito", cupo: 0n })).toBe("CUPO_REQUERIDO");
  });

  it("tarjeta con cupo es válida", () => {
    expect(validarAlta({ tipo: "tarjeta_credito", cupo: 4_000_000n })).toBeNull();
  });

  it("banco con cupo da CUPO_NO_PERMITIDO", () => {
    expect(validarAlta({ tipo: "banco", cupo: 1n })).toBe("CUPO_NO_PERMITIDO");
  });

  it("efectivo y banco sin cupo son válidos", () => {
    expect(validarAlta({ tipo: "efectivo" })).toBeNull();
    expect(validarAlta({ tipo: "banco", cupo: null })).toBeNull();
  });
});

describe("validarEdicion", () => {
  const banco = { tipo: "banco", cupo: null } as const;
  const tarjeta = { tipo: "tarjeta_credito", cupo: 4_000_000n } as const;

  it("banco → tarjeta da CAMBIO_DE_NATURALEZA", () => {
    expect(validarEdicion(banco, { tipo: "tarjeta_credito", cupo: 1n })).toBe(
      "CAMBIO_DE_NATURALEZA",
    );
  });

  it("tarjeta → efectivo da CAMBIO_DE_NATURALEZA", () => {
    expect(validarEdicion(tarjeta, { tipo: "efectivo" })).toBe("CAMBIO_DE_NATURALEZA");
  });

  it("efectivo → banco es válido", () => {
    expect(validarEdicion({ tipo: "efectivo", cupo: null }, { tipo: "banco" })).toBeNull();
  });

  it("cupo en una cuenta que queda como banco da CUPO_NO_PERMITIDO", () => {
    expect(validarEdicion(banco, { cupo: 5n })).toBe("CUPO_NO_PERMITIDO");
  });

  it("cambiar el cupo de una tarjeta es válido; a cero da CUPO_REQUERIDO", () => {
    expect(validarEdicion(tarjeta, { cupo: 6_000_000n })).toBeNull();
    expect(validarEdicion(tarjeta, { cupo: 0n })).toBe("CUPO_REQUERIDO");
  });

  it("sin tipo ni cupo es válida", () => {
    expect(validarEdicion(banco, {})).toBeNull();
  });
});

describe("puedeArchivar", () => {
  it("solo con saldo cero", () => {
    expect(puedeArchivar(0n)).toBe(true);
    expect(puedeArchivar(1n)).toBe(false);
  });
});
