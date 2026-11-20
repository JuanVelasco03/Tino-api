import { describe, expect, it } from "vitest";
import { proponerCategoria, type ReglaEvaluable } from "./proponer.js";

function regla(
  palabraClave: string,
  categoriaId: string,
  tipoCategoria: "gasto" | "ingreso" = "gasto",
  creadoEn = new Date("2026-11-01T00:00:00Z"),
): ReglaEvaluable {
  return { id: `r-${palabraClave}`, palabraClave, categoriaId, tipoCategoria, creadoEn };
}

const almuerzo = regla("almuerzo", "cat-comida");
const corrientazo = regla("corrientazo", "cat-comida-2");
const bar = regla("bar", "cat-ocio");
const nomina = regla("nomina", "cat-salario", "ingreso");

describe("proponerCategoria", () => {
  it("con dos coincidencias gana la palabra clave más larga", () => {
    expect(proponerCategoria("almuerzo corrientazo", "gasto", [almuerzo, corrientazo])).toBe(
      corrientazo,
    );
  });

  it("normaliza el texto: mayúsculas, tildes y espacios", () => {
    expect(proponerCategoria("  ALMUERZO   del día", "gasto", [almuerzo])).toBe(almuerzo);
    expect(proponerCategoria("Café", "gasto", [regla("cafe", "cat-comida")])?.palabraClave).toBe(
      "cafe",
    );
  });

  it("exige palabras completas: «barbería» no coincide con «bar»", () => {
    expect(proponerCategoria("barbería", "gasto", [bar])).toBeNull();
    expect(proponerCategoria("cerveza en el bar", "gasto", [bar])).toBe(bar);
  });

  it("una palabra clave de varias palabras debe aparecer contigua", () => {
    const tarjeta = regla("pago tarjeta", "cat-x");
    expect(proponerCategoria("pago de la tarjeta", "gasto", [tarjeta])).toBeNull();
    expect(proponerCategoria("el pago tarjeta visa", "gasto", [tarjeta])).toBe(tarjeta);
  });

  it("una regla de ingreso no aplica a un gasto", () => {
    expect(proponerCategoria("nomina", "gasto", [nomina])).toBeNull();
    expect(proponerCategoria("nomina", "ingreso", [nomina])).toBe(nomina);
  });

  it("una transferencia no tiene propuesta", () => {
    expect(proponerCategoria("almuerzo", "transferencia", [almuerzo])).toBeNull();
  });

  it("en empate de longitud gana la regla más reciente", () => {
    const vieja = regla("tinto", "cat-a", "gasto", new Date("2026-01-01T00:00:00Z"));
    const nueva = regla("pizza", "cat-b", "gasto", new Date("2026-06-01T00:00:00Z"));
    expect(proponerCategoria("tinto y pizza", "gasto", [vieja, nueva])).toBe(nueva);
    expect(proponerCategoria("tinto y pizza", "gasto", [nueva, vieja])).toBe(nueva);
  });

  it("sin texto o sin coincidencias devuelve null", () => {
    expect(proponerCategoria("", "gasto", [almuerzo])).toBeNull();
    expect(proponerCategoria("peluquería", "gasto", [almuerzo, bar])).toBeNull();
  });
});
