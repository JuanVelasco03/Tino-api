import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CifradorMontos, MontoIlegible, type ContextoMonto } from "./montos.js";

const clave = randomBytes(32);
const cifrador = new CifradorMontos(new Map([[1, clave]]));

const ctx = (cambios: Partial<ContextoMonto> = {}): ContextoMonto =>
  ({
    usuarioId: "u-1",
    tabla: "movimientos",
    columna: "monto",
    idFila: "m-1",
    ...cambios,
  }) as ContextoMonto;

/** Reemplaza un carácter de la parte `indice` del formato por otro válido. */
function alterar(valor: string, indice: number): string {
  const partes = valor.split(".");
  const p = partes[indice]!;
  partes[indice] = (p[0] === "A" ? "B" : "A") + p.slice(1);
  return partes.join(".");
}

describe("CifradorMontos", () => {
  it("ida y vuelta: 0, un monto común y el máximo de 19 dígitos", () => {
    for (const monto of [0n, 15_000n, 9_999_999_999_999_999_999n]) {
      expect(cifrador.descifrar(cifrador.cifrar(monto, ctx()), ctx())).toBe(monto);
    }
  });

  it("formato v1 y longitud fija sin importar la magnitud", () => {
    const corto = cifrador.cifrar(1n, ctx());
    const largo = cifrador.cifrar(1_000_000_000_000n, ctx());
    expect(corto).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$/);
    expect(corto.length).toBe(largo.length);
  });

  it("el mismo monto cifra distinto cada vez (IV aleatorio) y no contiene la cifra", () => {
    const a = cifrador.cifrar(5_000n, ctx());
    const b = cifrador.cifrar(5_000n, ctx());
    expect(a).not.toBe(b);
    expect(a).not.toContain("5000");
  });

  it("fuera de rango (negativo o 20 dígitos) no se cifra", () => {
    expect(() => cifrador.cifrar(-1n, ctx())).toThrow(/fuera de rango/);
    expect(() => cifrador.cifrar(10n ** 19n, ctx())).toThrow(/fuera de rango/);
  });

  it("otra fila, otra columna, otra tabla u otro usuario no descifran (AAD)", () => {
    const valor = cifrador.cifrar(5_000n, ctx());
    for (const otro of [
      ctx({ idFila: "m-2" }),
      ctx({ usuarioId: "u-2" }),
      { usuarioId: "u-1", tabla: "movimiento_partes", columna: "monto", idFila: "m-1" } as const,
      { usuarioId: "u-1", tabla: "cuentas", columna: "saldo_inicial", idFila: "m-1" } as const,
    ]) {
      expect(() => cifrador.descifrar(valor, otro)).toThrow(MontoIlegible);
    }
  });

  it("otra clave maestra no descifra", () => {
    const otro = new CifradorMontos(new Map([[1, randomBytes(32)]]));
    expect(() => otro.descifrar(cifrador.cifrar(1n, ctx()), ctx())).toThrow(MontoIlegible);
  });

  it("un carácter alterado en iv, cifrado o tag no descifra", () => {
    const valor = cifrador.cifrar(42n, ctx());
    for (const indice of [1, 2, 3]) {
      expect(() => cifrador.descifrar(alterar(valor, indice), ctx())).toThrow(MontoIlegible);
    }
  });

  it("versión desconocida, formato inválido o valor no texto → MontoIlegible", () => {
    const valor = cifrador.cifrar(42n, ctx());
    expect(() => cifrador.descifrar(valor.replace(/^v1/, "v2"), ctx())).toThrow(/v2/);
    expect(() => cifrador.descifrar("5000", ctx())).toThrow(/formato/);
    expect(() => cifrador.descifrar(5000, ctx())).toThrow(/no es texto/);
    expect(() => cifrador.descifrar(null, ctx())).toThrow(MontoIlegible);
  });

  it("descifra con la versión del valor y cifra con la más alta", () => {
    const v2 = new CifradorMontos(
      new Map([
        [1, clave],
        [2, randomBytes(32)],
      ]),
    );
    const viejo = cifrador.cifrar(7n, ctx());
    expect(v2.descifrar(viejo, ctx())).toBe(7n);
    expect(v2.cifrar(7n, ctx())).toMatch(/^v2\./);
  });

  it("cifrarSiCambia reutiliza el texto si el monto no cambió y recifra si cambió", () => {
    const guardado = cifrador.cifrar(100n, ctx());
    expect(cifrador.cifrarSiCambia(100n, guardado, ctx())).toBe(guardado);
    const nuevo = cifrador.cifrarSiCambia(250n, guardado, ctx());
    expect(nuevo).not.toBe(guardado);
    expect(cifrador.descifrar(nuevo, ctx())).toBe(250n);
    expect(cifrador.descifrar(cifrador.cifrarSiCambia(1n, null, ctx()), ctx())).toBe(1n);
  });

  it("cifrarSiCambia con un guardado alterado lanza, no lo sobrescribe en silencio", () => {
    const ajeno = cifrador.cifrar(100n, ctx({ idFila: "otra" }));
    expect(() => cifrador.cifrarSiCambia(100n, ajeno, ctx())).toThrow(MontoIlegible);
  });

  it("claves por usuario: el mismo usuario descifra en otra instancia con la misma maestra", () => {
    const usuario = randomUUID();
    const valor = cifrador.cifrar(3n, ctx({ usuarioId: usuario }));
    const otraInstancia = new CifradorMontos(new Map([[1, Buffer.from(clave)]]));
    expect(otraInstancia.descifrar(valor, ctx({ usuarioId: usuario }))).toBe(3n);
  });

  it("rechaza claves que no miden 32 bytes", () => {
    expect(() => new CifradorMontos(new Map([[1, randomBytes(16)]]))).toThrow(/32 bytes/);
    expect(() => new CifradorMontos(new Map())).toThrow();
  });
});
