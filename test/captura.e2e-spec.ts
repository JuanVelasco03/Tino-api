/**
 * Captura rápida de punta a punta (SPEC 04): GET /captura, GET /sugerencias,
 * POST y PATCH /reglas, y PATCH /perfil con la cuenta predeterminada.
 * Ver `utilidades.ts` sobre el uso de `SUPABASE_SECRET_KEY`.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaDto, CategoriaDto, SugerenciasDto } from "../src/captura/dto.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { restarDias } from "../src/domain/fecha/mes.js";
import type { ReglaDto } from "../src/reglas/reglas.service.js";
import {
  api,
  conUsuarios,
  crearApp,
  crearCuenta,
  crearFabricaUsuarios,
  esperarError,
  type UsuarioPrueba,
} from "./utilidades.js";

if (!conUsuarios) {
  console.warn(
    "[captura] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

describe("captura, sugerencias, reglas y perfil", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["/captura", "/sugerencias?tipo=gasto&texto=a"])(
    "GET %s sin token responde 401",
    async (ruta) => {
      esperarError(await request(app.getHttpServer()).get(ruta), "NO_AUTENTICADO");
    },
  );

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;

    beforeAll(() => {
      fabrica = crearFabricaUsuarios("Captura");
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    const cliente = (u: UsuarioPrueba) => api(app, u);
    const hoy = () => fechaLocal(new Date(), "America/Bogota");

    async function captura(u: UsuarioPrueba): Promise<CapturaDto> {
      const respuesta = await cliente(u).get("/captura").expect(200);
      return respuesta.body as CapturaDto;
    }

    async function sugerencias(u: UsuarioPrueba, consulta: string): Promise<SugerenciasDto> {
      const respuesta = await cliente(u).get(`/sugerencias?${consulta}`).expect(200);
      return respuesta.body as SugerenciasDto;
    }

    async function registrar(u: UsuarioPrueba, cuerpo: object): Promise<void> {
      const respuesta = await cliente(u).post("/movimientos", cuerpo);
      expect(respuesta.status).toBe(201);
    }

    const categoria = (c: CapturaDto, nombre: string): CategoriaDto => {
      const encontrada = [...c.categorias.gasto, ...c.categorias.ingreso].find(
        (k) => k.nombre === nombre,
      );
      if (!encontrada) throw new Error(`Sin categoría ${nombre}`);
      return encontrada;
    };

    describe("GET /captura", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let efectivo: CuentaDto;

      beforeAll(async () => {
        u = await fabrica.crear();
      });

      it("un usuario nuevo: 9 categorías de gasto y 4 de ingreso en el orden de la semilla, listas vacías", async () => {
        const c = await captura(u);
        expect(c.categorias.gasto.map((k) => k.nombre)).toEqual([
          "Comida",
          "Transporte",
          "Celular",
          "Mercado",
          "Hogar",
          "Salud",
          "Ocio",
          "Servicios",
          "Otros gastos",
        ]);
        expect(c.categorias.ingreso.map((k) => k.nombre)).toEqual([
          "Salario",
          "Trabajo independiente",
          "Reembolso",
          "Otros ingresos",
        ]);
        expect(c.categorias.gasto.every((k) => k.tipo === "gasto")).toBe(true);
        expect(c).toMatchObject({
          fechaHoy: hoy(),
          cuentaPredeterminadaId: null,
          gastosHoy: "0",
          conceptosFrecuentes: { gasto: [], ingreso: [], transferencia: [] },
        });
      });

      it("cuenta predeterminada: la primera activa; tras PATCH, Efectivo; archivada, vuelve a la primera", async () => {
        nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
        efectivo = await crearCuenta(app, u, {
          nombre: "Efectivo",
          tipo: "efectivo",
          saldoInicial: "0",
        });
        expect((await captura(u)).cuentaPredeterminadaId).toBe(nequi.id);

        const perfil = await cliente(u).patch("/perfil", { cuentaPredeterminadaId: efectivo.id });
        expect(perfil.status).toBe(200);
        expect(perfil.body).toMatchObject({ id: u.id, cuentaPredeterminadaId: efectivo.id });
        expect((await cliente(u).get("/perfil").expect(200)).body.cuentaPredeterminadaId).toBe(
          efectivo.id,
        );
        expect((await captura(u)).cuentaPredeterminadaId).toBe(efectivo.id);

        await cliente(u).post(`/cuentas/${efectivo.id}/archivar`).expect(200);
        expect((await captura(u)).cuentaPredeterminadaId).toBe(nequi.id);
      });

      it("PATCH /perfil con una cuenta ajena → 422 CUENTA_INVALIDA; con una archivada → 409 CUENTA_ARCHIVADA", async () => {
        const otro = await fabrica.crear();
        const ajena = await crearCuenta(app, otro, {
          nombre: "Ajena",
          tipo: "banco",
          saldoInicial: "0",
        });
        esperarError(
          await cliente(u).patch("/perfil", { cuentaPredeterminadaId: ajena.id }),
          "CUENTA_INVALIDA",
          "cuentaPredeterminadaId",
        );
        esperarError(
          await cliente(u).patch("/perfil", { cuentaPredeterminadaId: efectivo.id }),
          "CUENTA_ARCHIVADA",
          "cuentaPredeterminadaId",
        );
        await cliente(u).patch("/perfil", { cuentaPredeterminadaId: null }).expect(200);
      });

      it("gastosHoy suma solo los gastos de hoy (sin ingresos, transferencias ni gastos de ayer)", async () => {
        const c = await captura(u);
        const otra = await crearCuenta(app, u, {
          nombre: "Daviplata",
          tipo: "banco",
          saldoInicial: "0",
        });
        await registrar(u, { tipo: "gasto", monto: "1000", cuentaOrigenId: nequi.id });
        await registrar(u, { tipo: "gasto", monto: "2500", cuentaOrigenId: nequi.id });
        await registrar(u, {
          tipo: "gasto",
          monto: "9000",
          fecha: restarDias(hoy(), 1),
          cuentaOrigenId: nequi.id,
        });
        await registrar(u, {
          tipo: "ingreso",
          monto: "50000",
          cuentaDestinoId: nequi.id,
          categoriaId: categoria(c, "Salario").id,
        });
        await registrar(u, {
          tipo: "transferencia",
          monto: "700",
          cuentaOrigenId: nequi.id,
          cuentaDestinoId: otra.id,
        });
        expect((await captura(u)).gastosHoy).toBe("3500");
      });

      it("conceptosFrecuentes.gasto: máximo 6, el más usado en 90 días primero", async () => {
        const conceptos: [string, number][] = [
          ["Almuerzo", 3],
          ["Tinto", 2],
          ["Pasaje", 1],
          ["Mercado", 1],
          ["Arepa", 1],
          ["Uber", 1],
          ["Cine", 1],
        ];
        for (const [descripcion, veces] of conceptos) {
          for (let i = 0; i < veces; i++) {
            await registrar(u, {
              tipo: "gasto",
              monto: "100",
              descripcion,
              cuentaOrigenId: nequi.id,
            });
          }
        }
        // Fuera de la ventana de 90 días: no cuenta aunque sea el más usado.
        for (let i = 0; i < 5; i++) {
          await registrar(u, {
            tipo: "gasto",
            monto: "100",
            descripcion: "Viejo",
            fecha: restarDias(hoy(), 120),
            cuentaOrigenId: nequi.id,
          });
        }

        const frecuentes = (await captura(u)).conceptosFrecuentes.gasto;
        expect(frecuentes).toHaveLength(6);
        expect(frecuentes.slice(0, 2)).toEqual(["Almuerzo", "Tinto"]);
        expect(frecuentes).not.toContain("Viejo");
      });
    });

    describe("GET /sugerencias y /reglas", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let c: CapturaDto;

      beforeAll(async () => {
        u = await fabrica.crear();
        nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
        c = await captura(u);
        await registrar(u, {
          tipo: "gasto",
          monto: "15000",
          descripcion: "Almuerzo",
          cuentaOrigenId: nequi.id,
        });
        await registrar(u, {
          tipo: "gasto",
          monto: "3000",
          descripcion: "Café",
          cuentaOrigenId: nequi.id,
        });
      });

      it("texto=almu trae «Almuerzo» con categoría Comida", async () => {
        const s = await sugerencias(u, "tipo=gasto&texto=almu");
        expect(s.conceptos).toEqual([
          { descripcion: "Almuerzo", categoria: categoria(c, "Comida") },
        ]);
      });

      it("texto=cafe encuentra «Café» (sin tildes ni mayúsculas)", async () => {
        const s = await sugerencias(u, "tipo=gasto&texto=CAFE");
        expect(s.conceptos.map((k) => k.descripcion)).toEqual(["Café"]);
      });

      it("texto=Corrientazo propone Comida por «corrientazo»", async () => {
        const s = await sugerencias(u, "tipo=gasto&texto=Corrientazo");
        expect(s.propuesta).toEqual({
          categoria: categoria(c, "Comida"),
          regla: { id: expect.any(String), palabraClave: "corrientazo" },
        });
      });

      it("texto=barbería no tiene propuesta", async () => {
        const s = await sugerencias(u, `tipo=gasto&texto=${encodeURIComponent("barbería")}`);
        expect(s.propuesta).toBeNull();
      });

      it("texto vacío o ausente → listas vacías; transferencia sin propuesta ni categorías", async () => {
        expect(await sugerencias(u, "tipo=gasto&texto=")).toEqual({
          conceptos: [],
          propuesta: null,
        });
        expect(await sugerencias(u, "tipo=gasto")).toEqual({ conceptos: [], propuesta: null });
        expect(await sugerencias(u, "tipo=transferencia&texto=almuerzo")).toEqual({
          conceptos: [],
          propuesta: null,
        });
        esperarError(
          await cliente(u).get("/sugerencias?tipo=otro&texto=a"),
          "TIPO_MOVIMIENTO_INVALIDO",
          "tipo",
        );
      });

      it("POST /reglas «Peluquería» → Hogar guarda «peluqueria» y la sugerencia la usa; repetir → 409", async () => {
        const hogar = categoria(c, "Hogar");
        const respuesta = await cliente(u).post("/reglas", {
          palabraClave: "Peluquería",
          categoriaId: hogar.id,
        });
        expect(respuesta.status).toBe(201);
        expect(respuesta.body).toEqual({
          id: expect.any(String),
          palabraClave: "peluqueria",
          categoria: hogar,
        });

        const s = await sugerencias(u, "tipo=gasto&texto=peluqueria");
        expect(s.propuesta?.categoria).toEqual(hogar);

        esperarError(
          await cliente(u).post("/reglas", { palabraClave: "PELUQUERIA", categoriaId: hogar.id }),
          "PALABRA_CLAVE_DUPLICADA",
          "palabraClave",
        );
        esperarError(
          await cliente(u).post("/reglas", { palabraClave: "   ", categoriaId: hogar.id }),
          "PALABRA_CLAVE_REQUERIDA",
          "palabraClave",
        );
      });

      it("PATCH /reglas/:id cambia la categoría y la siguiente sugerencia lo refleja; ajena → 404", async () => {
        const antes = await sugerencias(u, "tipo=gasto&texto=netflix");
        expect(antes.propuesta?.categoria.nombre).toBe("Ocio");
        const servicios = categoria(c, "Servicios");

        const respuesta = await cliente(u).patch(`/reglas/${antes.propuesta!.regla.id}`, {
          categoriaId: servicios.id,
        });
        expect(respuesta.status).toBe(200);
        expect((respuesta.body as ReglaDto).categoria).toEqual(servicios);

        const despues = await sugerencias(u, "tipo=gasto&texto=netflix");
        expect(despues.propuesta?.categoria).toEqual(servicios);

        const otro = await fabrica.crear();
        const cOtro = await captura(otro);
        esperarError(
          await cliente(otro).patch(`/reglas/${antes.propuesta!.regla.id}`, {
            categoriaId: categoria(cOtro, "Hogar").id,
          }),
          "REGLA_NO_ENCONTRADA",
        );
      });

      it("POST /reglas con una categoría ajena → 422 CATEGORIA_INVALIDA", async () => {
        const otro = await fabrica.crear();
        const cOtro = await captura(otro);
        esperarError(
          await cliente(u).post("/reglas", {
            palabraClave: "gimnasio",
            categoriaId: categoria(cOtro, "Salud").id,
          }),
          "CATEGORIA_INVALIDA",
          "categoriaId",
        );
      });
    });
  });
});
