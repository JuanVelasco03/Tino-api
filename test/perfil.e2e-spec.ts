/**
 * GET /perfil de punta a punta: el guard rechaza peticiones sin token válido
 * (RF-03) y, con token, cada usuario recibe solo su perfil vía RLS (RN-12).
 *
 * La parte autenticada usa `SUPABASE_SECRET_KEY` SOLO para crear y borrar
 * usuarios de prueba, igual que `aislamiento.e2e-spec.ts`. Apunta solo a Tino dev.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";

const url = process.env.SUPABASE_URL;
const clavePublicable = process.env.SUPABASE_PUBLISHABLE_KEY;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;
const conUsuarios = Boolean(url && clavePublicable && claveSecreta);

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

describe("GET /perfil", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401", async () => {
    await request(app.getHttpServer()).get("/perfil").expect(401);
  });

  it("con token mal formado responde 401", async () => {
    await request(app.getHttpServer())
      .get("/perfil")
      .set("Authorization", "Bearer no-es-un-jwt")
      .expect(401);
  });

  it("con esquema distinto de Bearer responde 401", async () => {
    await request(app.getHttpServer()).get("/perfil").set("Authorization", "Basic abc").expect(401);
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    const contrasena = `Perfil-${randomUUID()}`;
    const idsCreados: string[] = [];
    let admin: SupabaseClient;

    async function crearUsuario(): Promise<{ id: string; token: string }> {
      const correo = `aislamiento+${randomUUID()}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email: correo,
        password: contrasena,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`No se pudo crear usuario: ${error?.message}`);
      idsCreados.push(data.user.id);

      const cliente = createClient(url!, clavePublicable!, opciones);
      const { data: sesion, error: errorEntrada } = await cliente.auth.signInWithPassword({
        email: correo,
        password: contrasena,
      });
      if (errorEntrada || !sesion.session) {
        throw new Error(`No se pudo entrar: ${errorEntrada?.message}`);
      }
      return { id: data.user.id, token: sesion.session.access_token };
    }

    beforeAll(() => {
      admin = createClient(url!, claveSecreta!, opciones);
    });

    afterAll(async () => {
      for (const id of idsCreados) {
        await admin.auth.admin.deleteUser(id);
      }
    });

    it("cada usuario recibe exactamente su perfil", async () => {
      const a = await crearUsuario();
      const b = await crearUsuario();

      for (const u of [a, b]) {
        const respuesta = await request(app.getHttpServer())
          .get("/perfil")
          .set("Authorization", `Bearer ${u.token}`)
          .expect(200);
        expect(respuesta.body).toEqual({
          id: u.id,
          nombre: null,
          monedaBase: "COP",
          zonaHoraria: "America/Bogota",
          primerUsoCompletado: false,
        });
      }
    });
  });
});
