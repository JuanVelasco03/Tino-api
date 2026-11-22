/**
 * Apoyo común de las pruebas de punta a punta de SPEC 04.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para comprobaciones directas en la base, igual que `aislamiento.e2e-spec.ts`.
 * Las peticiones a la API van con el token de cada usuario. Apunta solo a
 * Tino dev, nunca a datos reales.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request, { type Response } from "supertest";
import type { App } from "supertest/types.js";
import { expect } from "vitest";
import { AppModule } from "../src/app.module.js";
import { CATALOGO, crearPipeValidacion, type CodigoError } from "../src/comun/error-api.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";

const url = process.env.SUPABASE_URL;
const clavePublicable = process.env.SUPABASE_PUBLISHABLE_KEY;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;

export const conUsuarios = Boolean(url && clavePublicable && claveSecreta);

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

export type UsuarioPrueba = { id: string; token: string; cliente: SupabaseClient };

/** Proveedor reemplazado en la app de prueba (p. ej. `TrmFuente` por una falsa, SPEC 09). */
export type Reemplazo = { proveedor: Type | string | symbol; valor: unknown };

/**
 * Fuente de TRM que siempre falla: ninguna e2e sale a datos.gov.co. `GET /cuentas`
 * y `/inversiones` piden la TRM de hoy (SPEC 10); quien la necesite pasa la suya.
 */
const FUENTE_TRM_SIN_RED = {
  obtenerEn: () => Promise.resolve(null),
  obtenerRango: () => Promise.resolve(null),
};

export async function crearApp(reemplazos: Reemplazo[] = []): Promise<INestApplication<App>> {
  const constructor = Test.createTestingModule({ imports: [AppModule] });
  const conFuente = reemplazos.some((r) => r.proveedor === TrmFuente);
  const todos = conFuente
    ? reemplazos
    : [...reemplazos, { proveedor: TrmFuente, valor: FUENTE_TRM_SIN_RED }];
  for (const { proveedor, valor } of todos) {
    constructor.overrideProvider(proveedor).useValue(valor);
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(crearPipeValidacion());
  await app.init();
  return app;
}

/** Cliente admin y registro de usuarios creados, para borrarlos al final. */
export function crearFabricaUsuarios(prefijo: string) {
  const admin = createClient(url!, claveSecreta!, opciones);
  const contrasena = `${prefijo}-${randomUUID()}`;
  const creados: string[] = [];

  async function crear(): Promise<UsuarioPrueba> {
    const correo = `aislamiento+${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: contrasena,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`No se pudo crear usuario: ${error?.message}`);
    creados.push(data.user.id);

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

  /** Borra por id aunque fallen aserciones; la cascada elimina todos sus datos. */
  async function borrarTodos(): Promise<void> {
    const fallidos: string[] = [];
    for (const id of creados) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) fallidos.push(`${id} (${error.message})`);
    }
    // Se intenta con todos antes de fallar: la prueba no debe dejar usuarios.
    if (fallidos.length > 0) {
      throw new Error(`No se pudieron borrar usuarios de prueba: ${fallidos.join(", ")}`);
    }
  }

  return { admin, crear, borrarTodos };
}

export function api(app: INestApplication<App>, u: UsuarioPrueba) {
  const servidor = () => request(app.getHttpServer());
  const auth = { Authorization: `Bearer ${u.token}` };
  return {
    get: (ruta: string) => servidor().get(ruta).set(auth),
    post: (ruta: string, cuerpo?: object) => servidor().post(ruta).set(auth).send(cuerpo),
    patch: (ruta: string, cuerpo: object) => servidor().patch(ruta).set(auth).send(cuerpo),
    put: (ruta: string, cuerpo: object) => servidor().put(ruta).set(auth).send(cuerpo),
    delete: (ruta: string) => servidor().delete(ruta).set(auth),
  };
}

/** Comprueba el formato ErrorApi y que el mensaje es el del catálogo (nunca texto de Postgres). */
export function esperarError(respuesta: Response, codigo: CodigoError, campo?: string): void {
  const { estado, mensaje } = CATALOGO[codigo];
  expect(respuesta.body).toEqual({
    statusCode: estado,
    codigo,
    mensaje,
    ...(campo === undefined ? {} : { campo }),
  });
  expect(respuesta.status).toBe(estado);
}

export async function crearCuenta(
  app: INestApplication<App>,
  u: UsuarioPrueba,
  cuerpo: object,
): Promise<CuentaDto> {
  const respuesta = await api(app, u).post("/cuentas", cuerpo);
  expect(respuesta.status).toBe(201);
  return respuesta.body as CuentaDto;
}
