/**
 * /cuentas de punta a punta (SPEC 03): cubre los criterios de aceptación de
 * los endpoints con usuarios reales.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para comprobar la cascada de `cuentas_cambios`, igual que
 * `aislamiento.e2e-spec.ts`. Apunta solo a Tino dev.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request, { type Response } from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOGO, type CodigoError } from "../src/comun/error-api.js";
import type { CuentaDto, ListaCuentasDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { cifrador, contexto } from "./montos.js";
import { crearApp } from "./utilidades.js";

const url = process.env.SUPABASE_URL;
const clavePublicable = process.env.SUPABASE_PUBLISHABLE_KEY;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;
const conUsuarios = Boolean(url && clavePublicable && claveSecreta);

if (!conUsuarios) {
  console.warn(
    "[cuentas] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

/** Comprueba el formato ErrorApi y que el mensaje es el del catálogo (nunca texto de Postgres). */
function esperarError(respuesta: Response, codigo: CodigoError, campo?: string): void {
  const { estado, mensaje } = CATALOGO[codigo];
  expect(respuesta.status).toBe(estado);
  expect(respuesta.body).toEqual({
    statusCode: estado,
    codigo,
    mensaje,
    ...(campo === undefined ? {} : { campo }),
  });
}

describe("/cuentas", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Con la fuente de TRM sin red (SPEC 10): `trm` llega null.
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    const respuesta = await request(app.getHttpServer()).get("/cuentas");
    esperarError(respuesta, "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    const contrasena = `Cuentas-${randomUUID()}`;
    const idsCreados: string[] = [];
    let admin: SupabaseClient;

    type UsuarioPrueba = { id: string; token: string; cliente: SupabaseClient };

    async function crearUsuario(): Promise<UsuarioPrueba> {
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
      return { id: data.user.id, token: sesion.session.access_token, cliente };
    }

    const api = (u: UsuarioPrueba) => {
      const servidor = () => request(app.getHttpServer());
      const auth = { Authorization: `Bearer ${u.token}` };
      return {
        get: (ruta: string) => servidor().get(ruta).set(auth),
        post: (ruta: string, cuerpo?: object) => servidor().post(ruta).set(auth).send(cuerpo),
        patch: (ruta: string, cuerpo: object) => servidor().patch(ruta).set(auth).send(cuerpo),
        put: (ruta: string, cuerpo: object) => servidor().put(ruta).set(auth).send(cuerpo),
        delete: (ruta: string) => servidor().delete(ruta).set(auth),
      };
    };

    async function crearCuenta(u: UsuarioPrueba, cuerpo: object): Promise<CuentaDto> {
      const respuesta = await api(u).post("/cuentas", cuerpo);
      expect(respuesta.status).toBe(201);
      return respuesta.body as CuentaDto;
    }

    async function lista(u: UsuarioPrueba): Promise<ListaCuentasDto> {
      const respuesta = await api(u).get("/cuentas").expect(200);
      return respuesta.body as ListaCuentasDto;
    }

    const ids = (cuentas: CuentaDto[]) => cuentas.map((c) => c.id);

    beforeAll(() => {
      admin = createClient(url!, claveSecreta!, opciones);
    });

    afterAll(async () => {
      for (const id of idsCreados) {
        await admin.auth.admin.deleteUser(id);
      }
    });

    describe("lista, totales y validación del alta", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let tarjeta: CuentaDto;

      beforeAll(async () => {
        u = await crearUsuario();
      });

      it('sin cuentas: grupos vacíos y totales en "0"', async () => {
        const cuerpo = await lista(u);
        expect(cuerpo).toEqual({
          fechaSaldos: fechaLocal(new Date(), "America/Bogota"),
          activos: { total: "0", cuentas: [] },
          pasivos: { total: "0", cuentas: [] },
          prestamos: { teDeben: "0", debes: "0" },
          patrimonioNeto: "0",
          trm: null,
          trmDesactualizada: false,
        });
      });

      it("Nequi + Tarjeta: totales, patrimonio negativo y datos de la tarjeta", async () => {
        nequi = await crearCuenta(u, { nombre: "Nequi", tipo: "banco", saldoInicial: "20321" });
        tarjeta = await crearCuenta(u, {
          nombre: "Tarjeta",
          tipo: "tarjeta_credito",
          saldoInicial: "1284300",
          cupo: "4000000",
        });

        expect(nequi).toEqual({
          id: expect.any(String),
          nombre: "Nequi",
          tipo: "banco",
          moneda: "COP",
          naturaleza: "activo",
          detalle: null,
          saldo: "20321",
          saldoInicial: "20321",
          tarjeta: null,
          inversion: null,
          archivadaEn: null,
        });

        const cuerpo = await lista(u);
        expect(cuerpo.fechaSaldos).toBe(fechaLocal(new Date(), "America/Bogota"));
        expect(cuerpo.activos.total).toBe("20321");
        expect(cuerpo.pasivos.total).toBe("1284300");
        expect(cuerpo.patrimonioNeto).toBe("-1263979");
        expect(ids(cuerpo.activos.cuentas)).toEqual([nequi.id]);
        expect(ids(cuerpo.pasivos.cuentas)).toEqual([tarjeta.id]);
        expect(cuerpo.pasivos.cuentas[0]).toMatchObject({
          naturaleza: "pasivo",
          saldo: "1284300",
          tarjeta: { cupo: "4000000", disponible: "2715700", porcentajeUsado: 32 },
        });
      });

      it("efectivo y banco van a activos; tarjeta a pasivos (naturaleza_de ↔ naturalezaDe)", async () => {
        const efectivo = await crearCuenta(u, {
          nombre: "Billetera",
          tipo: "efectivo",
          saldoInicial: "0",
        });
        const cuerpo = await lista(u);
        expect(cuerpo.activos.cuentas.every((c) => c.naturaleza === "activo")).toBe(true);
        expect(cuerpo.pasivos.cuentas.every((c) => c.naturaleza === "pasivo")).toBe(true);
        // Una cuenta nueva aparece al final de su grupo.
        expect(ids(cuerpo.activos.cuentas)).toEqual([nequi.id, efectivo.id]);
      });

      it("una segunda «nequi» responde 409 NOMBRE_DUPLICADO", async () => {
        const respuesta = await api(u).post("/cuentas", {
          nombre: "nequi",
          tipo: "banco",
          saldoInicial: "0",
        });
        esperarError(respuesta, "NOMBRE_DUPLICADO", "nombre");
      });

      it("tarjeta sin cupo → CUPO_REQUERIDO; banco con cupo → CUPO_NO_PERMITIDO", async () => {
        esperarError(
          await api(u).post("/cuentas", {
            nombre: "T2",
            tipo: "tarjeta_credito",
            saldoInicial: "0",
          }),
          "CUPO_REQUERIDO",
          "cupo",
        );
        esperarError(
          await api(u).post("/cuentas", {
            nombre: "B2",
            tipo: "banco",
            saldoInicial: "0",
            cupo: "100",
          }),
          "CUPO_NO_PERMITIDO",
          "cupo",
        );
      });

      it('saldoInicial "12.5" y "-1" → MONTO_INVALIDO', async () => {
        for (const saldoInicial of ["12.5", "-1"]) {
          esperarError(
            await api(u).post("/cuentas", { nombre: "X", tipo: "banco", saldoInicial }),
            "MONTO_INVALIDO",
            "saldoInicial",
          );
        }
      });

      it('tipo "inversion" → TIPO_INVALIDO', async () => {
        esperarError(
          await api(u).post("/cuentas", { nombre: "X", tipo: "inversion", saldoInicial: "0" }),
          "TIPO_INVALIDO",
          "tipo",
        );
      });

      it("nombre vacío → NOMBRE_REQUERIDO", async () => {
        esperarError(
          await api(u).post("/cuentas", { nombre: "  ", tipo: "banco", saldoInicial: "0" }),
          "NOMBRE_REQUERIDO",
          "nombre",
        );
      });
    });

    describe("edición e historial de saldo inicial", () => {
      let u: UsuarioPrueba;

      beforeAll(async () => {
        u = await crearUsuario();
      });

      it("efectivo → banco responde 200; banco → tarjeta, 422 CAMBIO_DE_NATURALEZA", async () => {
        const cuenta = await crearCuenta(u, {
          nombre: "Caja",
          tipo: "efectivo",
          saldoInicial: "0",
        });

        const ok = await api(u).patch(`/cuentas/${cuenta.id}`, { tipo: "banco" });
        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({ tipo: "banco", naturaleza: "activo" });

        esperarError(
          await api(u).patch(`/cuentas/${cuenta.id}`, { tipo: "tarjeta_credito", cupo: "1000" }),
          "CAMBIO_DE_NATURALEZA",
          "tipo",
        );
      });

      it("un UPDATE directo de tipo banco → tarjeta falla con CAMBIO_DE_NATURALEZA", async () => {
        const cuenta = await crearCuenta(u, {
          nombre: "Directo",
          tipo: "banco",
          saldoInicial: "0",
        });
        const { error } = await u.cliente
          .from("cuentas")
          .update({
            tipo: "tarjeta_credito",
            cupo: cifrador().cifrar(1000n, contexto.cuenta(u.id, cuenta.id, "cupo")),
          })
          .eq("id", cuenta.id);
        expect(error?.message).toBe("CAMBIO_DE_NATURALEZA");
      });

      it("cambiar saldoInicial deja una fila en cuentas_cambios; otro PATCH no deja ninguna", async () => {
        const cuenta = await crearCuenta(u, {
          nombre: "Ahorros",
          tipo: "banco",
          saldoInicial: "100",
        });

        const editada = await api(u).patch(`/cuentas/${cuenta.id}`, { saldoInicial: "250" });
        expect(editada.status).toBe(200);
        expect(editada.body).toMatchObject({ saldo: "250", saldoInicial: "250" });

        await api(u)
          .patch(`/cuentas/${cuenta.id}`, { nombre: "Ahorros 2", saldoInicial: "250" })
          .expect(200);

        const { data, error } = await u.cliente
          .from("cuentas_cambios")
          .select("campo, valor_anterior, valor_nuevo")
          .eq("cuenta_id", cuenta.id);
        expect(error).toBeNull();
        const ctx = contexto.cuenta(u.id, cuenta.id, "saldo_inicial");
        expect(
          (data as { campo: string; valor_anterior: string; valor_nuevo: string }[]).map((f) => ({
            campo: f.campo,
            valor_anterior: cifrador().descifrar(f.valor_anterior, ctx),
            valor_nuevo: cifrador().descifrar(f.valor_nuevo, ctx),
          })),
        ).toEqual([{ campo: "saldo_inicial", valor_anterior: 100n, valor_nuevo: 250n }]);
      });

      it("PATCH sin campos → SIN_CAMBIOS", async () => {
        const cuenta = await crearCuenta(u, { nombre: "Vacía", tipo: "banco", saldoInicial: "0" });
        esperarError(await api(u).patch(`/cuentas/${cuenta.id}`, {}), "SIN_CAMBIOS");
      });
    });

    describe("orden", () => {
      let u: UsuarioPrueba;
      let activos: CuentaDto[];
      let pasivo: CuentaDto;

      beforeAll(async () => {
        u = await crearUsuario();
        activos = [];
        for (const nombre of ["A1", "A2", "A3"]) {
          activos.push(await crearCuenta(u, { nombre, tipo: "banco", saldoInicial: "0" }));
        }
        pasivo = await crearCuenta(u, {
          nombre: "P1",
          tipo: "tarjeta_credito",
          saldoInicial: "0",
          cupo: "1000",
        });
      });

      it("las cuentas nuevas quedan al final de su grupo", async () => {
        expect(ids((await lista(u)).activos.cuentas)).toEqual(ids(activos));
      });

      it("PUT /cuentas/orden con los ids invertidos los devuelve invertidos", async () => {
        const invertidos = ids(activos).toReversed();
        await api(u).put("/cuentas/orden", { naturaleza: "activo", ids: invertidos }).expect(204);
        expect(ids((await lista(u)).activos.cuentas)).toEqual(invertidos);
      });

      it("pasivo en activos, id faltante o repetido → 422 ORDEN_INVALIDO sin cambiar el orden", async () => {
        const antes = ids((await lista(u)).activos.cuentas);
        const casos = [[...antes, pasivo.id], antes.slice(1), [...antes, antes[0]!]];
        for (const orden of casos) {
          esperarError(
            await api(u).put("/cuentas/orden", { naturaleza: "activo", ids: orden }),
            "ORDEN_INVALIDO",
            "ids",
          );
        }
        expect(ids((await lista(u)).activos.cuentas)).toEqual(antes);
      });
    });

    describe("archivar, restaurar y eliminar", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;

      beforeAll(async () => {
        u = await crearUsuario();
      });

      it("archivar con saldo distinto de cero → 409 SALDO_NO_CERO", async () => {
        const conSaldo = await crearCuenta(u, {
          nombre: "Con saldo",
          tipo: "banco",
          saldoInicial: "1",
        });
        esperarError(await api(u).post(`/cuentas/${conSaldo.id}/archivar`), "SALDO_NO_CERO");
      });

      it("archivar con saldo cero la saca de la lista y la lleva a archivadas", async () => {
        nequi = await crearCuenta(u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
        const archivada = await api(u).post(`/cuentas/${nequi.id}/archivar`).expect(200);
        expect(archivada.body.archivadaEn).toEqual(expect.any(String));

        expect(ids((await lista(u)).activos.cuentas)).not.toContain(nequi.id);
        const archivadas = await api(u).get("/cuentas/archivadas").expect(200);
        expect(ids(archivadas.body.cuentas)).toEqual([nequi.id]);
      });

      it("archivar una ya archivada → 409 CUENTA_ARCHIVADA", async () => {
        esperarError(await api(u).post(`/cuentas/${nequi.id}/archivar`), "CUENTA_ARCHIVADA");
      });

      it("PATCH sobre una archivada → 409 CUENTA_ARCHIVADA", async () => {
        esperarError(
          await api(u).patch(`/cuentas/${nequi.id}`, { nombre: "Otro" }),
          "CUENTA_ARCHIVADA",
        );
      });

      it("con «Nequi» archivada se puede crear otra «Nequi»", async () => {
        await crearCuenta(u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
      });

      it("restaurar sin nombre → 409 NOMBRE_DUPLICADO", async () => {
        esperarError(
          await api(u).post(`/cuentas/${nequi.id}/restaurar`),
          "NOMBRE_DUPLICADO",
          "nombre",
        );
      });

      it("restaurar con «Nequi vieja» → 200 y vuelve al final de su grupo", async () => {
        const restaurada = await api(u)
          .post(`/cuentas/${nequi.id}/restaurar`, { nombre: "Nequi vieja" })
          .expect(200);
        expect(restaurada.body).toMatchObject({ nombre: "Nequi vieja", archivadaEn: null });

        const activos = (await lista(u)).activos.cuentas;
        expect(activos.at(-1)?.id).toBe(nequi.id);
      });

      it("restaurar una no archivada → 409 CUENTA_NO_ARCHIVADA", async () => {
        esperarError(await api(u).post(`/cuentas/${nequi.id}/restaurar`), "CUENTA_NO_ARCHIVADA");
      });

      it("DELETE responde 204, la cuenta desaparece y sus cambios se borran en cascada", async () => {
        const cuenta = await crearCuenta(u, { nombre: "Borrar", tipo: "banco", saldoInicial: "5" });
        await api(u).patch(`/cuentas/${cuenta.id}`, { saldoInicial: "6" }).expect(200);
        const { data: antes } = await admin
          .from("cuentas_cambios")
          .select("id")
          .eq("cuenta_id", cuenta.id);
        expect(antes).toHaveLength(1);

        await api(u).delete(`/cuentas/${cuenta.id}`).expect(204);

        expect(ids((await lista(u)).activos.cuentas)).not.toContain(cuenta.id);
        const { data: despues } = await admin
          .from("cuentas_cambios")
          .select("id")
          .eq("cuenta_id", cuenta.id);
        expect(despues).toEqual([]);
      });
    });

    describe("cuentas ajenas e ids inválidos", () => {
      let a: UsuarioPrueba;
      let b: UsuarioPrueba;
      let ajena: CuentaDto;

      beforeAll(async () => {
        a = await crearUsuario();
        b = await crearUsuario();
        ajena = await crearCuenta(b, { nombre: "De B", tipo: "banco", saldoInicial: "0" });
      });

      it("toda ruta con el id de una cuenta ajena → 404 CUENTA_NO_ENCONTRADA", async () => {
        const ruta = `/cuentas/${ajena.id}`;
        const respuestas = [
          await api(a).patch(ruta, { nombre: "Mía" }),
          await api(a).delete(ruta),
          await api(a).post(`${ruta}/archivar`),
          await api(a).post(`${ruta}/restaurar`),
        ];
        for (const respuesta of respuestas) esperarError(respuesta, "CUENTA_NO_ENCONTRADA");

        const intacta = await api(b).get("/cuentas").expect(200);
        expect(ids(intacta.body.activos.cuentas)).toEqual([ajena.id]);
      });

      it("ids ajenos en el orden → 422 ORDEN_INVALIDO", async () => {
        esperarError(
          await api(a).put("/cuentas/orden", { naturaleza: "activo", ids: [ajena.id] }),
          "ORDEN_INVALIDO",
          "ids",
        );
      });

      it(":id que no es UUID → 400 en formato ErrorApi", async () => {
        esperarError(
          await api(a).patch("/cuentas/no-es-uuid", { nombre: "X" }),
          "ENTRADA_INVALIDA",
        );
        esperarError(await api(a).delete("/cuentas/123"), "ENTRADA_INVALIDA");
      });
    });
  });
});
