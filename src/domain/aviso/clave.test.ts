import { describe, expect, it } from "vitest";
import { armarClave, esClaveValida } from "./clave.js";

const ID = "0b8f3c1e-6a2d-4c7e-9f1a-2b3c4d5e6f70";

describe("armarClave", () => {
  it("une tipo, fuente y fecha con dos puntos", () => {
    expect(armarClave("recurrente", ID, "2026-11-25")).toBe(`recurrente:${ID}:2026-11-25`);
  });

  it("una clave armada es válida para cada tipo", () => {
    for (const tipo of ["recurrente", "cobro", "deuda", "precio_manual"] as const) {
      expect(esClaveValida(armarClave(tipo, ID, "2026-02-28"))).toBe(true);
    }
  });
});

describe("esClaveValida", () => {
  it.each([
    ["tipo desconocido", `tarjeta:${ID}:2026-11-25`],
    ["id corto", "cobro:abc:2026-11-25"],
    ["id con mayúsculas", `cobro:${ID.toUpperCase()}:2026-11-25`],
    ["fecha mal formada", `cobro:${ID}:2026-1-25`],
    ["fecha que no existe", `cobro:${ID}:2026-02-30`],
    ["sin fecha", `cobro:${ID}`],
    ["con sobrante", `cobro:${ID}:2026-11-25:x`],
    ["vacía", ""],
  ])("rechaza %s", (_, clave) => {
    expect(esClaveValida(clave)).toBe(false);
  });
});
