import { describe, expect, it } from "vitest";
import { normalizarTexto, palabras } from "./normalizar.js";

describe("normalizarTexto", () => {
  it("pasa a minúsculas y colapsa espacios", () => {
    expect(normalizarTexto("Almuerzo  Corrientazo")).toBe("almuerzo corrientazo");
  });

  it("quita tildes", () => {
    expect(normalizarTexto("Café")).toBe("cafe");
    expect(normalizarTexto("Droguería Peluquería")).toBe("drogueria peluqueria");
  });

  it("recorta los extremos", () => {
    expect(normalizarTexto("  \tTinto \n")).toBe("tinto");
  });

  it("deja vacío lo que solo tiene espacios", () => {
    expect(normalizarTexto("   ")).toBe("");
  });
});

describe("palabras", () => {
  it("divide el texto normalizado en palabras", () => {
    expect(palabras("Almuerzo  Corrientazo")).toEqual(["almuerzo", "corrientazo"]);
  });

  it("ignora la puntuación", () => {
    expect(palabras("Almuerzo, tinto.")).toEqual(["almuerzo", "tinto"]);
  });

  it("devuelve lista vacía sin texto", () => {
    expect(palabras("  ")).toEqual([]);
  });
});
