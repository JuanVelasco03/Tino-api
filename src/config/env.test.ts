import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `leerEnv` guarda en caché: cada caso importa el módulo de nuevo. */
async function leer() {
  vi.resetModules();
  const { leerEnv } = await import("./env.js");
  return leerEnv();
}

describe("leerEnv — CLAVE_MONTOS_V1 (SPEC 05)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publicable";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("sin la clave no arranca", async () => {
    delete process.env.CLAVE_MONTOS_V1;
    await expect(leer()).rejects.toThrow(/CLAVE_MONTOS_V1/);
  });

  it("con una clave que no mide 32 bytes no arranca, y el error no muestra su valor", async () => {
    const corta = randomBytes(16).toString("base64");
    process.env.CLAVE_MONTOS_V1 = corta;
    const error = await leer().catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/32 bytes/);
    expect((error as Error).message).not.toContain(corta);
  });

  it("con texto que no es base64 válido no arranca", async () => {
    process.env.CLAVE_MONTOS_V1 = "no-es-base64-pero-mide-lo-suficiente-para-engañar!!";
    await expect(leer()).rejects.toThrow(/32 bytes/);
  });

  it("con 32 bytes en base64 la entrega como Buffer", async () => {
    const clave = randomBytes(32);
    process.env.CLAVE_MONTOS_V1 = clave.toString("base64");
    const env = await leer();
    expect(env.claveMontosV1.equals(clave)).toBe(true);
  });
});
