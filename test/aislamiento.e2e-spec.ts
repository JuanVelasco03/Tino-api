/**
 * Prueba de aislamiento entre usuarios (REGLAS §4). NO se borra ni se desactiva.
 *
 * `SUPABASE_SECRET_KEY` (service_role) se usa SOLO para crear y borrar los dos
 * usuarios de prueba. Todas las aserciones usan clientes con el token de cada
 * usuario, de modo que las políticas RLS evalúan al usuario real.
 * Apunta solo a Tino dev, nunca a datos reales.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const clavePublicable = process.env.SUPABASE_PUBLISHABLE_KEY;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;
const configurado = Boolean(url && clavePublicable && claveSecreta);

if (!configurado) {
  console.warn(
    "[aislamiento] OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY). " +
      "Defínela en .env.test.local. REGLAS §4 exige que esta prueba corra.",
  );
}

type Usuario = { id: string; cliente: SupabaseClient };

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configurado)("aislamiento entre usuarios (RLS)", () => {
  const contrasena = `Aislamiento-${randomUUID()}`;
  const idsCreados: string[] = [];
  let admin: SupabaseClient;
  let a: Usuario;
  let b: Usuario;

  async function crearUsuario(): Promise<Usuario> {
    const correo = `aislamiento+${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: contrasena,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`No se pudo crear usuario: ${error?.message}`);
    idsCreados.push(data.user.id);

    const cliente = createClient(url!, clavePublicable!, opciones);
    const { error: errorEntrada } = await cliente.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    if (errorEntrada) throw new Error(`No se pudo entrar: ${errorEntrada.message}`);
    return { id: data.user.id, cliente };
  }

  beforeAll(async () => {
    admin = createClient(url!, claveSecreta!, opciones);
    a = await crearUsuario();
    b = await crearUsuario();
  });

  afterAll(async () => {
    // Borra por id aunque fallen aserciones; la cascada elimina los perfiles.
    for (const id of idsCreados) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("el trigger crea el perfil con los valores por defecto", async () => {
    const { data, error } = await a.cliente.from("perfiles").select("*").eq("id", a.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: a.id,
      nombre: null,
      moneda_base: "COP",
      zona_horaria: "America/Bogota",
      primer_uso_completado: false,
    });
  });

  it("cada usuario ve exactamente su perfil", async () => {
    for (const u of [a, b]) {
      const { data, error } = await u.cliente.from("perfiles").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: u.id }]);
    }
  });

  it("SELECT del perfil ajeno devuelve 0 filas", async () => {
    const { data, error } = await a.cliente.from("perfiles").select("id").eq("id", b.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE del perfil ajeno afecta 0 filas", async () => {
    const { data, error } = await a.cliente
      .from("perfiles")
      .update({ nombre: "intruso" })
      .eq("id", b.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: real } = await admin.from("perfiles").select("nombre").eq("id", b.id).single();
    expect(real?.nombre).toBeNull();
  });

  it("INSERT directo falla", async () => {
    const { error } = await a.cliente.from("perfiles").insert({ id: randomUUID() });
    expect(error).not.toBeNull();
  });

  it("DELETE directo no borra nada", async () => {
    const { data } = await a.cliente.from("perfiles").delete().eq("id", a.id).select();
    expect(data ?? []).toEqual([]);
    const { data: sigue } = await admin.from("perfiles").select("id").eq("id", a.id);
    expect(sigue).toEqual([{ id: a.id }]);
  });

  it("UPDATE propio funciona y actualiza actualizado_en", async () => {
    const { data: antes } = await a.cliente.from("perfiles").select("actualizado_en").single();
    const { data, error } = await a.cliente
      .from("perfiles")
      .update({ nombre: "Prueba" })
      .eq("id", a.id)
      .select("nombre, actualizado_en")
      .single();
    expect(error).toBeNull();
    expect(data?.nombre).toBe("Prueba");
    expect(new Date(data!.actualizado_en).getTime()).toBeGreaterThan(
      new Date(antes!.actualizado_en).getTime(),
    );
  });

  it("moneda_base fuera de COP/USD es rechazada", async () => {
    const { error } = await a.cliente
      .from("perfiles")
      .update({ moneda_base: "EUR" })
      .eq("id", a.id);
    expect(error).not.toBeNull();
  });
});
