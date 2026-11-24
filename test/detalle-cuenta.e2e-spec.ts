/**
 * Detalle de cuenta y tarjeta con ciclo de punta a punta (SPEC 14): los
 * criterios de aceptación con usuarios reales. Cubre también los cambios en
 * /cuentas (condiciones de la tarjeta), /movimientos (ajustes) y /resumen.
 *
 * Las fechas del diseño (hoy 11 nov) se trasladan a fechas relativas a hoy.
 * Las cifras exactas del ciclo del diseño las cubre `src/domain/tarjeta/`.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba,
 * para insertar una tarjeta sin condiciones (como las de antes de SPEC 14) y
 * para comprobar filas en la base. La API nunca lo usa (REGLAS §4). Apunta
 * solo a Tino dev, nunca a datos reales.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaDto } from "../src/captura/dto.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import type { CicloDto, HistorialDto } from "../src/detalle-cuenta/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { restarDias, sumarDias } from "../src/domain/fecha/mes.js";
import type { MovimientoDto } from "../src/movimientos/dto.js";
import type { ResumenDto } from "../src/resumen/dto.js";
import { cifrador, contexto } from "./montos.js";
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
    "[detalle-cuenta] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

const hoy = () => fechaLocal(new Date(), "America/Bogota");
const dia = (offset: number) => sumarDias(hoy(), offset);

/** Movimientos de Efectivo del diseño, con su día relativo a hoy (11 nov = 0). */
const DISENIO: [number, string, number][] = [
  [-20, "Almuerzo", -15000],
  [-18, "Pago taxi", -30000],
  [-15, "Desayuno", -8000],
  [-14, "Retiro cajero", 100000],
  [-13, "Agua", -1100],
  [-12, "Almuerzo", -15000],
  [-11, "Pan", -5000],
  [-8, "Recarga datos", -4000],
  [-7, "Almuerzo", -15000],
  [-6, "Recarga tarjeta SITP", -10000],
  [-5, "Almuerzo", -15000],
  [-4, "Pago taxi", -30000],
  [-1, "Desayuno", -8000],
  [-1, "Pan", -5000],
  [0, "Agua", -1100],
  [0, "Almuerzo", -15000],
];

describe("detalle de cuenta y tarjeta (SPEC 14)", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(
      await request(app.getHttpServer()).get(`/cuentas/${randomUUID()}/historial`),
      "NO_AUTENTICADO",
    );
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", { timeout: 60_000 }, () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let efectivo: CuentaDto;
    let banco: CuentaDto;
    let ids: string[];

    const http = () => api(app, u);

    async function registrar(cuerpo: object): Promise<MovimientoDto> {
      const r = await http().post("/movimientos", cuerpo);
      expect(r.status).toBe(201);
      return r.body as MovimientoDto;
    }

    async function historial(cuentaId: string, consulta = ""): Promise<HistorialDto> {
      const r = await http().get(`/cuentas/${cuentaId}/historial${consulta}`);
      expect(r.status).toBe(200);
      return r.body as HistorialDto;
    }

    async function ciclo(cuentaId: string, consulta = ""): Promise<CicloDto> {
      const r = await http().get(`/cuentas/${cuentaId}/ciclo${consulta}`);
      expect(r.status).toBe(200);
      return r.body as CicloDto;
    }

    async function conciliar(cuentaId: string, movimientoIds: string[], conciliado = true) {
      await http()
        .put(`/cuentas/${cuentaId}/conciliacion`, { movimientoIds, conciliado })
        .expect(204);
    }

    async function estado(id: string) {
      const { data } = await admin
        .from("movimientos")
        .select("conciliado_origen, conciliado_destino")
        .eq("id", id)
        .single();
      return data as { conciliado_origen: boolean; conciliado_destino: boolean };
    }

    async function filasConciliacion(id: string): Promise<number> {
      const { count } = await admin
        .from("movimientos_cambios")
        .select("id", { count: "exact", head: true })
        .eq("movimiento_id", id)
        .eq("operacion", "conciliacion");
      return count ?? 0;
    }

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Detalle");
      admin = fabrica.admin;
      u = await fabrica.crear();

      efectivo = await crearCuenta(app, u, {
        nombre: "Efectivo",
        tipo: "efectivo",
        detalle: "Billetera",
        saldoInicial: "122200",
      });
      banco = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "1000000",
      });
      ids = [];
      for (const [offset, descripcion, monto] of DISENIO) {
        const fecha = dia(offset);
        const m =
          descripcion === "Retiro cajero"
            ? await registrar({
                tipo: "transferencia",
                monto: String(monto),
                fecha,
                descripcion,
                cuentaOrigenId: banco.id,
                cuentaDestinoId: efectivo.id,
              })
            : await registrar({
                tipo: "gasto",
                monto: String(-monto),
                fecha,
                descripcion,
                cuentaOrigenId: efectivo.id,
              });
        ids.push(m.id);
      }
      // «Octubre» (días −20 a −11) conciliado.
      await conciliar(efectivo.id, ids.slice(0, 7));
    }, 120_000);

    afterAll(async () => {
      await fabrica.borrarTodos();
    }, 60_000);

    describe("GET /cuentas/:id", () => {
      it("devuelve la cuenta; GET /cuentas/archivadas sigue respondiendo la lista", async () => {
        const r = await http().get(`/cuentas/${efectivo.id}`).expect(200);
        expect(r.body).toMatchObject({
          id: efectivo.id,
          nombre: "Efectivo",
          tipo: "efectivo",
          naturaleza: "activo",
          detalle: "Billetera",
          saldo: "45000",
        });
        const archivadas = await http().get("/cuentas/archivadas").expect(200);
        expect(archivadas.body).toEqual({ cuentas: [] });
      });

      it("devuelve una archivada; un préstamo y una inexistente responden 404", async () => {
        const vacia = await crearCuenta(app, u, {
          nombre: "Vacía",
          tipo: "banco",
          saldoInicial: "0",
        });
        await http().post(`/cuentas/${vacia.id}/archivar`).expect(200);
        const r = await http().get(`/cuentas/${vacia.id}`).expect(200);
        expect((r.body as CuentaDto).archivadaEn).not.toBeNull();

        const prestamo = await http().post("/prestamos", {
          tipo: "prestamo_otorgado",
          nombre: "Juan",
          monto: "1000",
          cuentaId: banco.id,
        });
        expect(prestamo.status).toBe(201);
        esperarError(
          await http().get(`/cuentas/${(prestamo.body as { id: string }).id}`),
          "CUENTA_NO_ENCONTRADA",
        );
        esperarError(await http().get(`/cuentas/${randomUUID()}`), "CUENTA_NO_ENCONTRADA");
      });
    });

    describe("GET /cuentas/:id/historial", () => {
      it("datos del diseño: saldo, conciliación, entradas, salidas y saldo al inicio", async () => {
        const h = await historial(efectivo.id);
        expect(h).toMatchObject({
          fechaHoy: hoy(),
          desde: dia(-30),
          hasta: null,
          saldo: "45000",
          saldoHoy: "45000",
          conciliacion: { saldo: "148100", al: dia(-11), pendientes: 9 },
          entradas: "100000",
          salidas: "177200",
          saldoInicioRango: "122200",
        });
        expect(h.filas).toHaveLength(16);
        expect(h.filas[0]).toMatchObject({
          descripcion: "Almuerzo",
          efecto: "-15000",
          saldo: "45000",
        });
      });

      it("con desde: solo los 9 de «noviembre» y saldo al inicio 148.100", async () => {
        const h = await historial(efectivo.id, `?desde=${dia(-10)}`);
        expect(h.filas).toHaveLength(9);
        expect(h.saldoInicioRango).toBe("148100");
      });

      it("la transferencia desde Bancolombia es entrada con contraparte «desde»", async () => {
        const h = await historial(efectivo.id, `?desde=${dia(-14)}&hasta=${dia(-14)}`);
        expect(h.filas).toHaveLength(1);
        expect(h.filas[0]).toMatchObject({
          tipo: "transferencia",
          efecto: "100000",
          conciliado: true,
          contraparte: { id: banco.id, nombre: "Bancolombia", sentido: "desde" },
        });
      });

      it("hasta anterior a desde responde 400 RANGO_INVALIDO", async () => {
        esperarError(
          await http().get(`/cuentas/${efectivo.id}/historial?desde=${dia(0)}&hasta=${dia(-1)}`),
          "RANGO_INVALIDO",
          "hasta",
        );
        esperarError(
          await http().get(`/cuentas/${efectivo.id}/historial?desde=2026-02-30`),
          "FECHA_INVALIDA",
          "desde",
        );
      });

      it("un gasto de mañana sale primero y cuadra con el saldo; saldoHoy no lo incluye", async () => {
        const cuenta = await crearCuenta(app, u, {
          nombre: "Con futuro",
          tipo: "efectivo",
          saldoInicial: "50000",
        });
        await registrar({
          tipo: "gasto",
          monto: "1000",
          fecha: dia(-2),
          cuentaOrigenId: cuenta.id,
        });
        const futuro = await registrar({
          tipo: "gasto",
          monto: "5000",
          fecha: dia(1),
          cuentaOrigenId: cuenta.id,
        });
        const h = await historial(cuenta.id);
        expect(h.filas[0]?.movimientoId).toBe(futuro.id);
        expect(h.filas[0]?.saldo).toBe(h.saldo);
        expect(h.saldo).toBe("44000");
        expect(h.saldoHoy).toBe("49000");
      });
    });

    describe("conciliación", () => {
      it("conciliar en Efectivo deja la transferencia pendiente en Bancolombia", async () => {
        const retiro = ids[3]!;
        expect(await estado(retiro)).toEqual({
          conciliado_origen: false,
          conciliado_destino: true,
        });
        const h = await historial(banco.id, `?desde=${dia(-14)}&hasta=${dia(-14)}`);
        expect(h.filas[0]).toMatchObject({ conciliado: false, efecto: "-100000" });
      });

      it("tres movimientos dejan tres filas de historial; repetir no deja más", async () => {
        const tres = ids.slice(7, 10);
        await conciliar(efectivo.id, tres);
        for (const id of tres) expect(await filasConciliacion(id)).toBe(1);
        await conciliar(efectivo.id, tres);
        for (const id of tres) expect(await filasConciliacion(id)).toBe(1);
        await conciliar(efectivo.id, tres, false);
        for (const id of tres) expect(await filasConciliacion(id)).toBe(2);
      });

      it("un movimiento que no toca la cuenta responde 404 y no cambia ninguno", async () => {
        const ajeno = await registrar({ tipo: "gasto", monto: "1000", cuentaOrigenId: banco.id });
        esperarError(
          await http().put(`/cuentas/${efectivo.id}/conciliacion`, {
            movimientoIds: [ids[8]!, ajeno.id],
            conciliado: true,
          }),
          "MOVIMIENTO_NO_ENCONTRADO",
        );
        expect((await estado(ids[8]!)).conciliado_origen).toBe(false);
      });

      it("editar el monto desconcilia; editar solo la nota no", async () => {
        const cuenta = await crearCuenta(app, u, {
          nombre: "Edición",
          tipo: "banco",
          saldoInicial: "100000",
        });
        const m = await registrar({
          tipo: "gasto",
          monto: "1000",
          fecha: dia(-1),
          cuentaOrigenId: cuenta.id,
        });
        const base = { tipo: "gasto", fecha: dia(-1), cuentaOrigenId: cuenta.id };
        await conciliar(cuenta.id, [m.id]);
        await http()
          .put(`/movimientos/${m.id}`, { ...base, monto: "1000", nota: "ok" })
          .expect(200);
        expect((await estado(m.id)).conciliado_origen).toBe(true);
        await http()
          .put(`/movimientos/${m.id}`, { ...base, monto: "2000", nota: "ok" })
          .expect(200);
        expect((await estado(m.id)).conciliado_origen).toBe(false);
      });

      it("cambiar el origen de una transferencia conciliada deja conciliado el destino", async () => {
        const otro = await crearCuenta(app, u, {
          nombre: "Otro banco",
          tipo: "banco",
          saldoInicial: "100000",
        });
        const t = await registrar({
          tipo: "transferencia",
          monto: "1000",
          fecha: dia(-1),
          cuentaOrigenId: banco.id,
          cuentaDestinoId: otro.id,
        });
        await conciliar(banco.id, [t.id]);
        await conciliar(otro.id, [t.id]);
        expect(await estado(t.id)).toEqual({ conciliado_origen: true, conciliado_destino: true });
        await http()
          .put(`/movimientos/${t.id}`, {
            tipo: "transferencia",
            monto: "1000",
            fecha: dia(-1),
            cuentaOrigenId: efectivo.id,
            cuentaDestinoId: otro.id,
          })
          .expect(200);
        expect(await estado(t.id)).toEqual({ conciliado_origen: false, conciliado_destino: true });
        // Deja Efectivo como estaba para los criterios del ajuste.
        await http().delete(`/movimientos/${t.id}`).expect(204);
      });
    });

    describe("ajuste de saldo", () => {
      let ajuste: MovimientoDto;

      it("contado 41.500 con saldo a hoy 45.000: ajuste de 3.500 que baja, conciliado", async () => {
        const antes = (await http().get("/resumen").expect(200)).body as ResumenDto;
        const r = await http().post(`/cuentas/${efectivo.id}/ajustes`, { saldoReal: "41500" });
        expect(r.status).toBe(201);
        ajuste = r.body as MovimientoDto;
        expect(ajuste).toMatchObject({
          tipo: "ajuste",
          monto: "3500",
          fecha: hoy(),
          descripcion: "Ajuste de saldo",
          cuentaOrigen: { id: efectivo.id, nombre: "Efectivo" },
          cuentaDestino: null,
          categoria: { nombre: "Ajuste" },
        });
        expect(await estado(ajuste.id)).toEqual({
          conciliado_origen: true,
          conciliado_destino: false,
        });

        const h = await historial(efectivo.id);
        expect(h.saldo).toBe("41500");
        expect(h.conciliacion.pendientes).toBe(0);
        expect(h.filas[0]).toMatchObject({
          movimientoId: ajuste.id,
          categoria: { nombre: "Ajuste" },
          conciliado: true,
        });

        // Un ajuste no cambia ingresos, gastos ni cantidad del mes (RN-14).
        const despues = (await http().get("/resumen").expect(200)).body as ResumenDto;
        expect(despues.ingresos).toEqual(antes.ingresos);
        expect(despues.gastos).toEqual(antes.gastos);
        expect(despues.cantidadMovimientos).toBe(antes.cantidadMovimientos);
      });

      it("contado igual al saldo a hoy responde 422 SIN_DIFERENCIA", async () => {
        esperarError(
          await http().post(`/cuentas/${efectivo.id}/ajustes`, { saldoReal: "41500" }),
          "SIN_DIFERENCIA",
          "saldoReal",
        );
      });

      it("una cuenta archivada responde 409 CUENTA_ARCHIVADA", async () => {
        const vacia = await crearCuenta(app, u, {
          nombre: "Vacía 2",
          tipo: "efectivo",
          saldoInicial: "0",
        });
        await http().post(`/cuentas/${vacia.id}/archivar`).expect(200);
        esperarError(
          await http().post(`/cuentas/${vacia.id}/ajustes`, { saldoReal: "100" }),
          "CUENTA_ARCHIVADA",
        );
        esperarError(
          await http().put(`/cuentas/${vacia.id}/conciliacion`, {
            movimientoIds: [randomUUID()],
            conciliado: true,
          }),
          "CUENTA_ARCHIVADA",
        );
        // Se lee igual.
        await http().get(`/cuentas/${vacia.id}/historial`).expect(200);
      });

      it("POST /movimientos con tipo ajuste responde 400 TIPO_MOVIMIENTO_INVALIDO", async () => {
        esperarError(
          await http().post("/movimientos", {
            tipo: "ajuste",
            monto: "1000",
            cuentaOrigenId: efectivo.id,
          }),
          "TIPO_MOVIMIENTO_INVALIDO",
          "tipo",
        );
      });

      it("PUT edita el monto; a gasto o hacia una tarjeta, no", async () => {
        const base = { tipo: "ajuste", fecha: hoy(), cuentaOrigenId: efectivo.id };
        const r = await http().put(`/movimientos/${ajuste.id}`, { ...base, monto: "3000" });
        expect(r.status).toBe(200);
        expect((r.body as MovimientoDto).categoria?.nombre).toBe("Ajuste");
        esperarError(
          await http().put(`/movimientos/${ajuste.id}`, { ...base, tipo: "gasto", monto: "3000" }),
          "MOVIMIENTO_DE_AJUSTE",
          "tipo",
        );
        const tarjeta = await crearCuenta(app, u, {
          nombre: "Visa ajuste",
          tipo: "tarjeta_credito",
          saldoInicial: "0",
          cupo: "100000",
          tarjeta: { diaCorte: 15, diaPago: 30 },
        });
        esperarError(
          await http().put(`/movimientos/${ajuste.id}`, {
            ...base,
            monto: "3000",
            cuentaOrigenId: tarjeta.id,
          }),
          "TIPO_NO_ADMITIDO",
        );
      });
    });

    describe("tarjeta con ciclo", () => {
      let pago: CuentaDto;
      let tarjeta: CuentaDto;

      beforeAll(async () => {
        pago = await crearCuenta(app, u, {
          nombre: "Pago tarjeta",
          tipo: "banco",
          saldoInicial: "0",
        });
        tarjeta = await crearCuenta(app, u, {
          nombre: "Tarjeta de crédito",
          tipo: "tarjeta_credito",
          detalle: "Visa ·· 7731",
          saldoInicial: "1284300",
          cupo: "4000000",
          tarjeta: {
            diaCorte: Number(hoy().slice(8, 10)),
            diaPago: 30,
            tasaMensual: 198,
            cuotaManejo: "26990",
            cuentaPagoId: pago.id,
          },
        });
      }, 30_000);

      it("el alta devuelve las condiciones con la E.A. calculada", async () => {
        expect(tarjeta.tarjeta).toEqual({
          cupo: "4000000",
          disponible: "2715700",
          porcentajeUsado: 32,
          diaCorte: Number(hoy().slice(8, 10)),
          diaPago: 30,
          tasaMensual: 198,
          tasaEfectivaAnual: 2652,
          cuotaManejo: "26990",
          cuentaPago: { id: pago.id, nombre: "Pago tarjeta" },
        });
        const { data } = await admin
          .from("tarjetas")
          .select("cuota_manejo")
          .eq("cuenta_id", tarjeta.id)
          .single();
        expect(data!.cuota_manejo).toMatch(/^v1\./);
      });

      it("?compra: cabe o no cabe en el disponible", async () => {
        expect((await ciclo(tarjeta.id, "?compra=450000")).compra).toEqual({
          monto: "450000",
          cabe: true,
          disponibleTras: "2265700",
          porcentajeTras: 43,
          falta: null,
        });
        expect((await ciclo(tarjeta.id, "?compra=3000000")).compra).toMatchObject({
          cabe: false,
          falta: "284300",
        });
        esperarError(
          await http().get(`/cuentas/${tarjeta.id}/ciclo?compra=0`),
          "MONTO_INVALIDO",
          "compra",
        );
      });

      it("ciclo con corte hoy: consumo, cargo y abono de hoy, y deuda al corte", async () => {
        const captura = (await http().get("/captura").expect(200)).body as CapturaDto;
        const cuota = captura.categorias.gasto.find((c) => c.nombre === "Cuota de manejo")!;
        const comida = captura.categorias.gasto.find((c) => c.nombre === "Comida")!;
        await registrar({
          tipo: "gasto",
          monto: "46900",
          descripcion: "Rappi",
          cuentaOrigenId: tarjeta.id,
          categoriaId: comida.id,
        });
        await registrar({
          tipo: "gasto",
          monto: "26990",
          descripcion: "Cuota de manejo",
          cuentaOrigenId: tarjeta.id,
          categoriaId: cuota.id,
        });
        await registrar({
          tipo: "transferencia",
          monto: "620000",
          descripcion: "Pago",
          cuentaOrigenId: banco.id,
          cuentaDestinoId: tarjeta.id,
        });
        const c = await ciclo(tarjeta.id);
        expect(c.ciclo).toMatchObject({
          corte: hoy(),
          diasHastaCorte: 0,
          corteAnterior: { saldo: "1284300" },
          saldoAnteriorPendiente: "664300",
          pagoSugerido: "664300",
          totalConsumos: "46900",
          totalCargos: "26990",
          deudaAlCorte: "738190",
        });
        expect(c.ciclo!.consumos.map((f) => f.descripcion)).toEqual(["Rappi"]);
        expect(c.ciclo!.cargos[0]).toMatchObject({ clase: "cuota_manejo", monto: "26990" });
        expect(c.ciclo!.abonos[0]).toMatchObject({
          monto: "620000",
          contraparte: { id: banco.id, nombre: "Bancolombia" },
        });
        const cuenta = (await http().get(`/cuentas/${tarjeta.id}`).expect(200)).body as CuentaDto;
        expect(cuenta.saldo).toBe(c.ciclo!.deudaAlCorte);
      });

      it("historial y ajuste de una tarjeta, y ciclo de un banco: 422 TIPO_NO_ADMITIDO", async () => {
        esperarError(await http().get(`/cuentas/${tarjeta.id}/historial`), "TIPO_NO_ADMITIDO");
        esperarError(
          await http().post(`/cuentas/${tarjeta.id}/ajustes`, { saldoReal: "0" }),
          "TIPO_NO_ADMITIDO",
        );
        esperarError(await http().get(`/cuentas/${banco.id}/ciclo`), "TIPO_NO_ADMITIDO");
      });

      it("cambiar el día de corte deja fila en tarjetas_cambios", async () => {
        await http()
          .patch(`/cuentas/${tarjeta.id}`, { tarjeta: { diaCorte: 5 } })
          .expect(200);
        const { data } = await admin
          .from("tarjetas_cambios")
          .select("campo, valor_anterior, valor_nuevo")
          .eq("cuenta_id", tarjeta.id);
        expect(data).toContainEqual({
          campo: "dia_corte",
          valor_anterior: hoy().slice(8, 10).replace(/^0/, ""),
          valor_nuevo: "5",
        });
      });

      it("archivar la cuenta de pago la quita de la tarjeta, con historial", async () => {
        await http().post(`/cuentas/${pago.id}/archivar`).expect(200);
        const cuenta = (await http().get(`/cuentas/${tarjeta.id}`).expect(200)).body as CuentaDto;
        expect(cuenta.tarjeta?.cuentaPago).toBeNull();
        const { data } = await admin
          .from("tarjetas_cambios")
          .select("campo, valor_nuevo")
          .eq("cuenta_id", tarjeta.id)
          .eq("campo", "cuenta_pago_id");
        expect(data).toEqual([{ campo: "cuenta_pago_id", valor_nuevo: null }]);
      });

      it("validaciones del alta de tarjeta", async () => {
        esperarError(
          await http().post("/cuentas", {
            nombre: "Sin condiciones",
            tipo: "tarjeta_credito",
            saldoInicial: "0",
            cupo: "1000",
          }),
          "CONDICIONES_REQUERIDAS",
          "tarjeta",
        );
        esperarError(
          await http().post("/cuentas", {
            nombre: "Banco con condiciones",
            tipo: "banco",
            saldoInicial: "0",
            tarjeta: { diaCorte: 1, diaPago: 10 },
          }),
          "CONDICIONES_NO_PERMITIDAS",
          "tarjeta",
        );
        esperarError(
          await http().post("/cuentas", {
            nombre: "Corte 32",
            tipo: "tarjeta_credito",
            saldoInicial: "0",
            cupo: "1000",
            tarjeta: { diaCorte: 32, diaPago: 10 },
          }),
          "DIA_INVALIDO",
          "tarjeta.diaCorte",
        );
        esperarError(
          await http().post("/cuentas", {
            nombre: "Paga con tarjeta",
            tipo: "tarjeta_credito",
            saldoInicial: "0",
            cupo: "1000",
            tarjeta: { diaCorte: 1, diaPago: 10, cuentaPagoId: tarjeta.id },
          }),
          "CUENTA_PAGO_INVALIDA",
          "tarjeta.cuentaPagoId",
        );
      });

      it("una tarjeta de antes de SPEC 14: sin condiciones ni ciclo; completar exige los dos días", async () => {
        const id = randomUUID();
        const { error } = await u.cliente.from("cuentas").insert({
          id,
          nombre: "Tarjeta vieja",
          tipo: "tarjeta_credito",
          saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(u.id, id, "saldo_inicial")),
          cupo: cifrador().cifrar(500000n, contexto.cuenta(u.id, id, "cupo")),
        });
        expect(error).toBeNull();
        const cuenta = (await http().get(`/cuentas/${id}`).expect(200)).body as CuentaDto;
        expect(cuenta.tarjeta).toMatchObject({ diaCorte: null, diaPago: null, cuentaPago: null });
        expect((await ciclo(id)).ciclo).toBeNull();
        esperarError(
          await http().patch(`/cuentas/${id}`, { tarjeta: { diaCorte: 15 } }),
          "CONDICIONES_REQUERIDAS",
          "tarjeta",
        );
        const r = await http().patch(`/cuentas/${id}`, { tarjeta: { diaCorte: 15, diaPago: 30 } });
        expect(r.status).toBe(200);
        expect((r.body as CuentaDto).tarjeta).toMatchObject({ diaCorte: 15, diaPago: 30 });
        expect((await ciclo(id)).ciclo).not.toBeNull();
      });
    });

    it("un gasto con fecha en el pasado lejano no rompe el rango por defecto", async () => {
      const cuenta = await crearCuenta(app, u, {
        nombre: "Vieja",
        tipo: "banco",
        saldoInicial: "0",
      });
      await registrar({
        tipo: "ingreso",
        monto: "1000",
        fecha: restarDias(hoy(), 90),
        cuentaDestinoId: cuenta.id,
      });
      const h = await historial(cuenta.id);
      expect(h.filas).toEqual([]);
      expect(h.saldoInicioRango).toBe("1000");
      expect(h.conciliacion).toEqual({ saldo: null, al: null, pendientes: 1 });
    });
  });
});
