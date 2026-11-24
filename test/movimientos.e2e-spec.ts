/**
 * /movimientos de punta a punta (SPEC 04): saldos, validación, división,
 * lista por mes, edición, eliminación e historial, con usuarios reales.
 * Ver `utilidades.ts` sobre el uso de `SUPABASE_SECRET_KEY`.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaDto } from "../src/captura/dto.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { mesLocal } from "../src/domain/fecha/mes.js";
import type { ListaMovimientosDto, MovimientoDto } from "../src/movimientos/dto.js";
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
    "[movimientos] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

describe("/movimientos", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/movimientos"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;

    beforeAll(() => {
      fabrica = crearFabricaUsuarios("Movimientos");
      admin = fabrica.admin;
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    const cliente = (u: UsuarioPrueba) => api(app, u);

    async function registrar(u: UsuarioPrueba, cuerpo: object): Promise<MovimientoDto> {
      const respuesta = await cliente(u).post("/movimientos", cuerpo);
      expect(respuesta.status).toBe(201);
      return respuesta.body as MovimientoDto;
    }

    async function saldo(u: UsuarioPrueba, id: string): Promise<string> {
      const lista = await cliente(u).get("/cuentas").expect(200);
      const cuentas: CuentaDto[] = [...lista.body.activos.cuentas, ...lista.body.pasivos.cuentas];
      const cuenta = cuentas.find((c) => c.id === id);
      if (!cuenta) throw new Error(`Cuenta ${id} no está en GET /cuentas`);
      return cuenta.saldo;
    }

    async function categorias(u: UsuarioPrueba): Promise<CapturaDto["categorias"]> {
      const captura = await cliente(u).get("/captura").expect(200);
      return (captura.body as CapturaDto).categorias;
    }

    const id = (categoriasPorTipo: CapturaDto["categorias"], nombre: string): string => {
      const categoria = [...categoriasPorTipo.gasto, ...categoriasPorTipo.ingreso].find(
        (c) => c.nombre === nombre,
      );
      if (!categoria) throw new Error(`Sin categoría ${nombre}`);
      return categoria.id;
    };

    async function cambios(movimientoId: string) {
      const { data, error } = await admin
        .from("movimientos_cambios")
        .select("operacion, antes, despues")
        .eq("movimiento_id", movimientoId);
      expect(error).toBeNull();
      return data as { operacion: string; antes: Record<string, unknown>; despues: unknown }[];
    }

    describe("saldos con movimientos (RN-01, RN-02)", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let tarjeta: CuentaDto;
      let cats: CapturaDto["categorias"];

      beforeAll(async () => {
        u = await fabrica.crear();
        nequi = await crearCuenta(app, u, {
          nombre: "Nequi",
          tipo: "banco",
          saldoInicial: "20321",
        });
        tarjeta = await crearCuenta(app, u, {
          nombre: "Tarjeta",
          tipo: "tarjeta_credito",
          saldoInicial: "1284300",
          cupo: "4000000",
          tarjeta: { diaCorte: 15, diaPago: 30 },
        });
        cats = await categorias(u);
      });

      it('un gasto de "15000" desde Nequi deja su saldo en "5321"', async () => {
        await registrar(u, { tipo: "gasto", monto: "15000", cuentaOrigenId: nequi.id });
        expect(await saldo(u, nequi.id)).toBe("5321");
      });

      it('un gasto de "15000" con la tarjeta deja su saldo en "1299300"', async () => {
        await registrar(u, { tipo: "gasto", monto: "15000", cuentaOrigenId: tarjeta.id });
        expect(await saldo(u, tarjeta.id)).toBe("1299300");
      });

      it('una transferencia de "5000" de Nequi a la tarjeta: "321" y "1294300"', async () => {
        await registrar(u, {
          tipo: "transferencia",
          monto: "5000",
          cuentaOrigenId: nequi.id,
          cuentaDestinoId: tarjeta.id,
        });
        expect(await saldo(u, nequi.id)).toBe("321");
        expect(await saldo(u, tarjeta.id)).toBe("1294300");
      });

      it('un ingreso de "100000" a Nequi lo deja en "100321"', async () => {
        await registrar(u, {
          tipo: "ingreso",
          monto: "100000",
          cuentaDestinoId: nequi.id,
          categoriaId: id(cats, "Salario"),
        });
        expect(await saldo(u, nequi.id)).toBe("100321");
      });

      it("POST sin fecha guarda la fecha de hoy en la zona del perfil", async () => {
        const movimiento = await registrar(u, {
          tipo: "gasto",
          monto: "1",
          cuentaOrigenId: nequi.id,
        });
        expect(movimiento.fecha).toBe(fechaLocal(new Date(), "America/Bogota"));
      });

      it("un gasto sin categoría ni partes responde 201 «sin clasificar»", async () => {
        const movimiento = await registrar(u, {
          tipo: "gasto",
          monto: "2",
          descripcion: "  Tinto  ",
          nota: "",
          cuentaOrigenId: nequi.id,
        });
        expect(movimiento).toEqual({
          id: expect.any(String),
          tipo: "gasto",
          monto: "2",
          moneda: "COP",
          montoDestino: null,
          tasa: "1",
          fecha: expect.any(String),
          descripcion: "Tinto",
          nota: null,
          cuentaOrigen: { id: nequi.id, nombre: "Nequi" },
          cuentaDestino: null,
          categoria: null,
          partes: [],
          creadoEn: expect.any(String),
          actualizadoEn: expect.any(String),
        });
      });

      it("DELETE /cuentas/:id de una cuenta con movimientos → 409 CUENTA_CON_MOVIMIENTOS", async () => {
        esperarError(await cliente(u).delete(`/cuentas/${nequi.id}`), "CUENTA_CON_MOVIMIENTOS");
      });

      it("cambiar moneda_base con movimientos falla con MONEDA_BASE_BLOQUEADA; sin ellos, pasa", async () => {
        const { error } = await u.cliente
          .from("perfiles")
          .update({ moneda_base: "USD" })
          .eq("id", u.id);
        expect(error?.message).toBe("MONEDA_BASE_BLOQUEADA");

        const otro = await fabrica.crear();
        const { error: sinMovimientos } = await otro.cliente
          .from("perfiles")
          .update({ moneda_base: "USD" })
          .eq("id", otro.id);
        expect(sinMovimientos).toBeNull();
      });
    });

    describe("validación", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let efectivo: CuentaDto;
      let cats: CapturaDto["categorias"];

      beforeAll(async () => {
        u = await fabrica.crear();
        nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
        efectivo = await crearCuenta(app, u, {
          nombre: "Efectivo",
          tipo: "efectivo",
          saldoInicial: "0",
        });
        cats = await categorias(u);
      });

      it("gasto sin origen → 400 ORIGEN_REQUERIDO", async () => {
        esperarError(
          await cliente(u).post("/movimientos", { tipo: "gasto", monto: "100" }),
          "ORIGEN_REQUERIDO",
          "cuentaOrigenId",
        );
      });

      it("transferencia con origen = destino → 400 CUENTAS_IGUALES", async () => {
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "transferencia",
            monto: "100",
            cuentaOrigenId: nequi.id,
            cuentaDestinoId: nequi.id,
          }),
          "CUENTAS_IGUALES",
          "cuentaDestinoId",
        );
      });

      it("transferencia con categoría → 400 CATEGORIA_NO_PERMITIDA", async () => {
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "transferencia",
            monto: "100",
            cuentaOrigenId: nequi.id,
            cuentaDestinoId: efectivo.id,
            categoriaId: id(cats, "Comida"),
          }),
          "CATEGORIA_NO_PERMITIDA",
          "categoriaId",
        );
      });

      it('monto "0" → MONTO_REQUERIDO; "1.5" → MONTO_INVALIDO', async () => {
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "0",
            cuentaOrigenId: nequi.id,
          }),
          "MONTO_REQUERIDO",
          "monto",
        );
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "1.5",
            cuentaOrigenId: nequi.id,
          }),
          "MONTO_INVALIDO",
          "monto",
        );
      });

      it("tipo desconocido → TIPO_MOVIMIENTO_INVALIDO; fecha imposible → FECHA_INVALIDA", async () => {
        esperarError(
          await cliente(u).post("/movimientos", { tipo: "ajuste", monto: "1" }),
          "TIPO_MOVIMIENTO_INVALIDO",
          "tipo",
        );
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "1",
            cuentaOrigenId: nequi.id,
            fecha: "2026-02-30",
          }),
          "FECHA_INVALIDA",
          "fecha",
        );
      });

      it("un gasto con una categoría de ingreso → 422 CATEGORIA_INVALIDA", async () => {
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "100",
            cuentaOrigenId: nequi.id,
            categoriaId: id(cats, "Salario"),
          }),
          "CATEGORIA_INVALIDA",
          "categoriaId",
        );
      });

      it("una cuenta ajena o inexistente → 422 CUENTA_INVALIDA", async () => {
        const otro = await fabrica.crear();
        const ajena = await crearCuenta(app, otro, {
          nombre: "Ajena",
          tipo: "banco",
          saldoInicial: "0",
        });
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "100",
            cuentaOrigenId: ajena.id,
          }),
          "CUENTA_INVALIDA",
          "cuentaOrigenId",
        );
      });

      it("un gasto en una cuenta archivada → 409 CUENTA_ARCHIVADA en cuentaOrigenId", async () => {
        const archivada = await crearCuenta(app, u, {
          nombre: "Vieja",
          tipo: "banco",
          saldoInicial: "0",
        });
        await cliente(u).post(`/cuentas/${archivada.id}/archivar`).expect(200);
        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "100",
            cuentaOrigenId: archivada.id,
          }),
          "CUENTA_ARCHIVADA",
          "cuentaOrigenId",
        );
      });

      it("división: suma exacta → 201 con dos partes; no suma → 422; una parte → 400", async () => {
        const comida = id(cats, "Comida");
        const mercado = id(cats, "Mercado");

        const dividido = await registrar(u, {
          tipo: "gasto",
          monto: "30000",
          cuentaOrigenId: nequi.id,
          partes: [
            { categoriaId: comida, monto: "20000" },
            { categoriaId: mercado, monto: "10000" },
          ],
        });
        expect(dividido.categoria).toBeNull();
        expect(dividido.partes).toEqual([
          { categoria: { id: comida, nombre: "Comida" }, monto: "20000" },
          { categoria: { id: mercado, nombre: "Mercado" }, monto: "10000" },
        ]);

        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "30000",
            cuentaOrigenId: nequi.id,
            partes: [
              { categoriaId: comida, monto: "20000" },
              { categoriaId: mercado, monto: "5000" },
            ],
          }),
          "PARTES_NO_SUMAN",
          "partes",
        );

        esperarError(
          await cliente(u).post("/movimientos", {
            tipo: "gasto",
            monto: "20000",
            cuentaOrigenId: nequi.id,
            partes: [{ categoriaId: comida, monto: "20000" }],
          }),
          "PARTES_INSUFICIENTES",
          "partes",
        );
      });

      it("PUT o DELETE de un movimiento inexistente → 404 MOVIMIENTO_NO_ENCONTRADO", async () => {
        const inexistente = "00000000-0000-4000-8000-000000000000";
        esperarError(
          await cliente(u).put(`/movimientos/${inexistente}`, {
            tipo: "gasto",
            monto: "1",
            fecha: "2026-11-01",
            cuentaOrigenId: nequi.id,
          }),
          "MOVIMIENTO_NO_ENCONTRADO",
        );
        esperarError(
          await cliente(u).delete(`/movimientos/${inexistente}`),
          "MOVIMIENTO_NO_ENCONTRADO",
        );
      });
    });

    describe("lista por mes", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      const registrados: Record<string, MovimientoDto> = {};

      beforeAll(async () => {
        u = await fabrica.crear();
        nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
        for (const [clave, fecha] of [
          ["octubre", "2026-10-31"],
          ["nov05", "2026-11-05"],
          ["nov20a", "2026-11-20"],
          ["nov20b", "2026-11-20"],
          ["diciembre", "2026-12-01"],
        ] as const) {
          registrados[clave] = await registrar(u, {
            tipo: "ingreso",
            monto: "10",
            fecha,
            descripcion: clave,
            cuentaDestinoId: nequi.id,
          });
        }
      });

      it("?mes=2026-11 trae solo noviembre, el más reciente primero; a igual fecha, el último registrado", async () => {
        const respuesta = await cliente(u).get("/movimientos?mes=2026-11").expect(200);
        const cuerpo = respuesta.body as ListaMovimientosDto;
        expect(cuerpo.mes).toBe("2026-11");
        expect(cuerpo.movimientos.map((m) => m.descripcion)).toEqual(["nov20b", "nov20a", "nov05"]);
      });

      it("sin mes devuelve el mes actual; ?mes=2026-13 → 400 MES_INVALIDO", async () => {
        const hoy = await registrar(u, { tipo: "ingreso", monto: "1", cuentaDestinoId: nequi.id });
        const respuesta = await cliente(u).get("/movimientos").expect(200);
        const cuerpo = respuesta.body as ListaMovimientosDto;
        expect(cuerpo.mes).toBe(mesLocal(new Date(), "America/Bogota"));
        expect(cuerpo.movimientos.map((m) => m.id)).toContain(hoy.id);

        esperarError(await cliente(u).get("/movimientos?mes=2026-13"), "MES_INVALIDO", "mes");
      });

      it("un mes sin movimientos devuelve lista vacía", async () => {
        const respuesta = await cliente(u).get("/movimientos?mes=2020-01").expect(200);
        expect(respuesta.body).toEqual({ mes: "2020-01", movimientos: [] });
      });
    });

    describe("edición, eliminación e historial (RN-13)", () => {
      let u: UsuarioPrueba;
      let nequi: CuentaDto;
      let efectivo: CuentaDto;
      let cats: CapturaDto["categorias"];

      beforeAll(async () => {
        u = await fabrica.crear();
        nequi = await crearCuenta(app, u, {
          nombre: "Nequi",
          tipo: "banco",
          saldoInicial: "50000",
        });
        efectivo = await crearCuenta(app, u, {
          nombre: "Efectivo",
          tipo: "efectivo",
          saldoInicial: "0",
        });
        cats = await categorias(u);
      });

      it("PUT de gasto con categoría a transferencia: 200, ajusta saldos y deja una «edicion»", async () => {
        const gasto = await registrar(u, {
          tipo: "gasto",
          monto: "10000",
          fecha: "2026-11-10",
          descripcion: "Almuerzo",
          cuentaOrigenId: nequi.id,
          categoriaId: id(cats, "Comida"),
        });
        expect(await saldo(u, nequi.id)).toBe("40000");
        expect(await saldo(u, efectivo.id)).toBe("0");

        const respuesta = await cliente(u).put(`/movimientos/${gasto.id}`, {
          tipo: "transferencia",
          monto: "10000",
          fecha: "2026-11-10",
          descripcion: "Retiro",
          cuentaOrigenId: nequi.id,
          cuentaDestinoId: efectivo.id,
          categoriaId: null,
        });
        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          id: gasto.id,
          tipo: "transferencia",
          categoria: null,
          cuentaDestino: { id: efectivo.id, nombre: "Efectivo" },
        });
        expect(await saldo(u, nequi.id)).toBe("40000");
        expect(await saldo(u, efectivo.id)).toBe("10000");

        const historial = await cambios(gasto.id);
        expect(historial).toHaveLength(1);
        expect(historial[0]).toMatchObject({
          operacion: "edicion",
          antes: { tipo: "gasto", descripcion: "Almuerzo", partes: [] },
          despues: { tipo: "transferencia", descripcion: "Retiro", partes: [] },
        });
      });

      it("PUT idéntico al estado actual no deja fila en movimientos_cambios", async () => {
        const cuerpo = {
          tipo: "gasto",
          monto: "3000",
          fecha: "2026-11-11",
          descripcion: "Pasaje",
          cuentaOrigenId: nequi.id,
          categoriaId: id(cats, "Transporte"),
        };
        const gasto = await registrar(u, cuerpo);
        await cliente(u).put(`/movimientos/${gasto.id}`, cuerpo).expect(200);
        expect(await cambios(gasto.id)).toEqual([]);
      });

      it("DELETE responde 204, el saldo vuelve y queda una «eliminacion» con sus partes", async () => {
        const antes = await saldo(u, nequi.id);
        const dividido = await registrar(u, {
          tipo: "gasto",
          monto: "30000",
          cuentaOrigenId: nequi.id,
          partes: [
            { categoriaId: id(cats, "Comida"), monto: "20000" },
            { categoriaId: id(cats, "Mercado"), monto: "10000" },
          ],
        });
        expect(await saldo(u, nequi.id)).not.toBe(antes);

        await cliente(u).delete(`/movimientos/${dividido.id}`).expect(204);
        expect(await saldo(u, nequi.id)).toBe(antes);

        const historial = await cambios(dividido.id);
        expect(historial).toHaveLength(1);
        expect(historial[0]!.operacion).toBe("eliminacion");
        expect(historial[0]!.despues).toBeNull();
        expect(historial[0]!.antes.partes).toHaveLength(2);
      });

      it("con la cuenta archivada después: la lista conserva los nombres y PUT/DELETE → 409", async () => {
        const vieja = await crearCuenta(app, u, {
          nombre: "Vieja",
          tipo: "banco",
          saldoInicial: "0",
        });
        const entrada = await registrar(u, {
          tipo: "ingreso",
          monto: "500",
          fecha: "2026-11-12",
          cuentaDestinoId: vieja.id,
          categoriaId: id(cats, "Reembolso"),
        });
        const salida = await registrar(u, {
          tipo: "gasto",
          monto: "500",
          fecha: "2026-11-12",
          cuentaOrigenId: vieja.id,
          categoriaId: id(cats, "Comida"),
        });
        await cliente(u).post(`/cuentas/${vieja.id}/archivar`).expect(200);

        const lista = await cliente(u).get("/movimientos?mes=2026-11").expect(200);
        const enLista = (lista.body as ListaMovimientosDto).movimientos.find(
          (m) => m.id === entrada.id,
        );
        expect(enLista).toMatchObject({
          cuentaDestino: { id: vieja.id, nombre: "Vieja" },
          categoria: { nombre: "Reembolso" },
        });

        esperarError(
          await cliente(u).put(`/movimientos/${salida.id}`, {
            tipo: "gasto",
            monto: "500",
            fecha: "2026-11-12",
            cuentaOrigenId: nequi.id,
          }),
          "CUENTA_ARCHIVADA",
        );
        esperarError(await cliente(u).delete(`/movimientos/${salida.id}`), "CUENTA_ARCHIVADA");
      });

      it("PUT exige fecha", async () => {
        const gasto = await registrar(u, { tipo: "gasto", monto: "1", cuentaOrigenId: nequi.id });
        esperarError(
          await cliente(u).put(`/movimientos/${gasto.id}`, {
            tipo: "gasto",
            monto: "1",
            cuentaOrigenId: nequi.id,
          }),
          "FECHA_INVALIDA",
          "fecha",
        );
      });
    });
  });
});
