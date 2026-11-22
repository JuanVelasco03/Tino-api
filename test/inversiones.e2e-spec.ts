/**
 * /inversiones de punta a punta (SPEC 10): los criterios de aceptación con
 * usuarios reales. Cubre también los cambios en /movimientos, /cuentas,
 * /resumen y las guardas de /recurrentes, /prestamos y /perfil.
 *
 * La fuente de TRM se reemplaza por una falsa que vale 4.120,00 en todas las
 * fechas y cuenta llamadas: las e2e no dependen de la red.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para comprobar filas en la base. La API nunca lo usa (REGLAS §4). Apunta
 * solo a Tino dev, nunca a datos reales.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CuentaDto, ListaCuentasDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { sumarDias } from "../src/domain/fecha/mes.js";
import type { Trm } from "../src/domain/trm/trm.js";
import type {
  InversionDetalleDto,
  InversionesDto,
  OperacionesDto,
  PosicionDto,
} from "../src/inversiones/dto.js";
import type { MovimientoDto } from "../src/movimientos/dto.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";
import type { ResumenDto } from "../src/resumen/dto.js";
import { FORMATO_CIFRADO } from "./montos.js";
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
    "[inversiones] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

const ZONA = "America/Bogota";
const TRM = 412_000n;

/** Fuente falsa: 4.120,00 en cualquier fecha, o falla si `fallar`. */
const estado = { fallar: false };
const fuente = {
  obtenerEn: vi.fn(async (fecha: string): Promise<Trm | null> =>
    estado.fallar ? null : { valorCent: TRM, vigenteDesde: fecha, vigenteHasta: fecha },
  ),
  obtenerRango: vi.fn(async (desde: string, hasta: string): Promise<Trm[] | null> =>
    estado.fallar ? null : [{ valorCent: TRM, vigenteDesde: desde, vigenteHasta: hasta }],
  ),
};

describe("/inversiones", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp([{ proveedor: TrmFuente, valor: fuente }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/inversiones"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let bancolombia: CuentaDto;
    let nequi: CuentaDto;
    let etoro: InversionDetalleDto;
    let fondeoId: string;
    let vooId: string;
    let compraId: string;
    let ventaId: string;

    const H = fechaLocal(new Date(), ZONA);

    const detalle = async (id: string): Promise<InversionDetalleDto> => {
      const r = await api(app, u).get(`/inversiones/${id}`);
      expect(r.status).toBe(200);
      return r.body as InversionDetalleDto;
    };
    const lista = async (quien = u): Promise<ListaCuentasDto> => {
      const r = await api(app, quien).get("/cuentas");
      expect(r.status).toBe(200);
      return r.body as ListaCuentasDto;
    };
    const voo = (d: InversionDetalleDto): PosicionDto | undefined =>
      d.posiciones.find((p) => p.simbolo === "VOO");
    const operacion = (cuerpo: object) =>
      api(app, u).post(`/inversiones/${etoro.id}/operaciones`, cuerpo);
    const transferencia = (origen: string, destino: string, monto: string, montoDestino?: string) =>
      api(app, u).post("/movimientos", {
        tipo: "transferencia",
        monto,
        ...(montoDestino === undefined ? {} : { montoDestino }),
        cuentaOrigenId: origen,
        cuentaDestinoId: destino,
      });

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Inversiones");
      admin = fabrica.admin;
      u = await fabrica.crear();
      bancolombia = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "10000000",
      });
      nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "0" });
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    it("GET /inversiones sin inversiones → [] y la TRM de hoy", async () => {
      const r = await api(app, u).get("/inversiones");
      expect(r.status).toBe(200);
      const cuerpo = r.body as InversionesDto;
      expect(cuerpo.inversiones).toEqual([]);
      expect(cuerpo.fechaHoy).toBe(H);
      expect(cuerpo.trm?.valor).toBe("4120.00");
      expect(cuerpo.trmDesactualizada).toBe(false);
    });

    it("POST /inversiones eToro USD → 201 vacía; aparece en Cuentas como activo", async () => {
      const r = await api(app, u).post("/inversiones", { nombre: "eToro", moneda: "USD" });
      expect(r.status).toBe(201);
      etoro = r.body as InversionDetalleDto;
      expect(etoro).toMatchObject({
        nombre: "eToro",
        moneda: "USD",
        naturaleza: "activo",
        efectivo: "0",
        posiciones: [],
        valorMercado: "0",
        archivadaEn: null,
      });
      const cuentas = await lista();
      expect(cuentas.activos.cuentas.find((c) => c.id === etoro.id)).toMatchObject({
        tipo: "inversion",
        moneda: "USD",
        saldo: "0",
        tarjeta: null,
      });
    });

    it("POST /cuentas con tipo inversion → 400 TIPO_INVALIDO", async () => {
      esperarError(
        await api(app, u).post("/cuentas", { nombre: "X", tipo: "inversion", saldoInicial: "0" }),
        "TIPO_INVALIDO",
        "tipo",
      );
    });

    it("fondeo sin montoDestino → 400 MONTO_DESTINO_REQUERIDO", async () => {
      esperarError(
        await transferencia(bancolombia.id, etoro.id, "8240000"),
        "MONTO_DESTINO_REQUERIDO",
        "montoDestino",
      );
    });

    it("fondeo con montoDestino → 201 con la tasa implícita; saldos y patrimonio", async () => {
      const r = await transferencia(bancolombia.id, etoro.id, "8240000", "200000");
      expect(r.status).toBe(201);
      const m = r.body as MovimientoDto;
      fondeoId = m.id;
      expect(m).toMatchObject({ moneda: "COP", montoDestino: "200000", tasa: "4120" });

      const cuentas = await lista();
      expect(cuentas.activos.cuentas.find((c) => c.id === bancolombia.id)?.saldo).toBe("1760000");
      expect(cuentas.patrimonioNeto).toBe("10000000");
      expect((await detalle(etoro.id)).efectivo).toBe("200000");
    });

    it("entre dos cuentas COP con montoDestino → 400 MONTO_DESTINO_NO_PERMITIDO", async () => {
      esperarError(
        await transferencia(bancolombia.id, nequi.id, "1000", "1000"),
        "MONTO_DESTINO_NO_PERMITIDO",
        "montoDestino",
      );
    });

    it("un gasto con origen eToro → 422 CUENTA_DE_INVERSION", async () => {
      esperarError(
        await api(app, u).post("/movimientos", {
          tipo: "gasto",
          monto: "100",
          cuentaOrigenId: etoro.id,
        }),
        "CUENTA_DE_INVERSION",
        "cuentaOrigenId",
      );
    });

    it("compra de VOO → 201; efectivo y posición con el primer precio", async () => {
      const r = await operacion({
        clase: "compra",
        simbolo: "voo",
        nombre: "Vanguard S&P 500 ETF",
        cantidad: "2",
        monto: "100000",
      });
      expect(r.status).toBe(201);
      const d = r.body as InversionDetalleDto;
      expect(d.efectivo).toBe("100000");
      expect(voo(d)).toMatchObject({
        simbolo: "VOO",
        nombre: "Vanguard S&P 500 ETF",
        cantidad: "2",
        costo: "100000",
        costoPromedio: "50000",
        precio: "50000",
        precioFecha: H,
        precioOrigen: "manual",
        precioAnterior: null,
        rendimiento: "0",
      });
      vooId = voo(d)!.activoId;
    });

    it("una compra sin efectivo → 422 EFECTIVO_INSUFICIENTE, sin crear nada", async () => {
      esperarError(
        await operacion({ clase: "compra", simbolo: "VOO", cantidad: "1", monto: "150000" }),
        "EFECTIVO_INSUFICIENTE",
      );
      const ops = await api(app, u).get(`/inversiones/${etoro.id}/operaciones`);
      expect((ops.body as OperacionesDto).operaciones).toHaveLength(1);
      compraId = (ops.body as OperacionesDto).operaciones[0]!.id;
    });

    it("precio manual 562,40 → valor, rendimiento, % y equivalentes COP", async () => {
      const r = await api(app, u).post(`/inversiones/${etoro.id}/activos/${vooId}/precios`, {
        precio: "56240",
      });
      expect(r.status).toBe(201);
      const d = r.body as InversionDetalleDto;
      expect(voo(d)).toMatchObject({
        precio: "56240",
        valor: "112480",
        rendimiento: "12480",
        rendimientoPorcentaje: 1248,
        valorCop: "4634176",
        precioAnterior: { precio: "50000", fecha: H },
      });
      expect(d.valorMercado).toBe("212480");
      expect(d.valorMercadoCop).toBe("8754176");
    });

    it("venta de 1 VOO → costo promedio igual, efectivo y ganancia realizada", async () => {
      const r = await operacion({ clase: "venta", simbolo: "VOO", cantidad: "1", monto: "56000" });
      expect(r.status).toBe(201);
      const d = r.body as InversionDetalleDto;
      expect(voo(d)).toMatchObject({ cantidad: "1", costo: "50000", costoPromedio: "50000" });
      expect(d.efectivo).toBe("156000");

      const ops = (await api(app, u).get(`/inversiones/${etoro.id}/operaciones`))
        .body as OperacionesDto;
      const venta = ops.operaciones.find((o) => o.clase === "venta")!;
      ventaId = venta.id;
      expect(venta).toMatchObject({ gananciaRealizada: "6000", precioUnitario: "56000" });
      expect(ops.operaciones.find((o) => o.clase === "compra")?.gananciaRealizada).toBeNull();

      const filtradas = (
        await api(app, u).get(`/inversiones/${etoro.id}/operaciones?activoId=${vooId}`)
      ).body as OperacionesDto;
      expect(filtradas.operaciones).toHaveLength(2);
    });

    it("vender más de lo que hay → 422 CANTIDAD_INSUFICIENTE; símbolo inexistente → 404", async () => {
      esperarError(
        await operacion({ clase: "venta", simbolo: "VOO", cantidad: "2", monto: "1000" }),
        "CANTIDAD_INSUFICIENTE",
        "cantidad",
      );
      esperarError(
        await operacion({ clase: "venta", simbolo: "AAPL", cantidad: "1", monto: "1000" }),
        "ACTIVO_NO_ENCONTRADO",
        "simbolo",
      );
    });

    it("GET /resumen: revaluación 504.288, resultado sin operaciones, puente que cuadra, una consulta a la fuente", async () => {
      fuente.obtenerEn.mockClear();
      fuente.obtenerRango.mockClear();
      const r = await api(app, u).get("/resumen");
      expect(r.status).toBe(200);
      const { cambioDelMes, resultado } = r.body as ResumenDto;
      expect(cambioDelMes.revaluacion).toBe("504288");
      expect(resultado.actual).toBe("0");
      expect(
        BigInt(cambioDelMes.patrimonioAnterior) +
          BigInt(cambioDelMes.resultado) +
          BigInt(cambioDelMes.revaluacion) +
          BigInt(cambioDelMes.otrosCambios),
      ).toBe(BigInt(cambioDelMes.patrimonioCierre));
      expect(fuente.obtenerRango.mock.calls.length).toBeLessThanOrEqual(1);
      expect(fuente.obtenerEn).not.toHaveBeenCalled();
    });

    it("GET /cuentas: eToro a mercado en COP y patrimonio con la revaluación", async () => {
      const cuentas = await lista();
      expect(cuentas.activos.cuentas.find((c) => c.id === etoro.id)).toMatchObject({
        saldo: "8744288",
        saldoInicial: "0",
        inversion: { efectivo: "156000", valorMercado: "212240", tasa: "4120.00" },
      });
      expect(cuentas.patrimonioNeto).toBe("10504288");
      expect(cuentas.trm?.valor).toBe("4120.00");
    });

    it("borrar el fondeo → 422 EFECTIVO_INSUFICIENTE", async () => {
      esperarError(await api(app, u).delete(`/movimientos/${fondeoId}`), "EFECTIVO_INSUFICIENTE");
    });

    it("retiro mayor al efectivo → 422; uno menor → 201", async () => {
      esperarError(
        await transferencia(etoro.id, bancolombia.id, "200000", "824000"),
        "EFECTIVO_INSUFICIENTE",
      );
      const r = await transferencia(etoro.id, bancolombia.id, "100000", "412000");
      expect(r.status).toBe(201);
      expect((r.body as MovimientoDto).moneda).toBe("USD");
      expect((await detalle(etoro.id)).efectivo).toBe("56000");
    });

    it("editar la compra → 200 con el costo nuevo y una fila edicion; sin campos → SIN_CAMBIOS", async () => {
      const r = await api(app, u).put(`/inversiones/${etoro.id}/operaciones/${compraId}`, {
        monto: "90000",
      });
      expect(r.status).toBe(200);
      expect(voo(r.body as InversionDetalleDto)?.costo).toBe("45000");

      const { data } = await admin
        .from("inversion_operaciones_cambios")
        .select("operacion")
        .eq("operacion_id", compraId);
      expect(data).toEqual([{ operacion: "edicion" }]);

      esperarError(
        await api(app, u).put(`/inversiones/${etoro.id}/operaciones/${compraId}`, {}),
        "SIN_CAMBIOS",
      );
    });

    it("borrar la compra con la venta viva → CANTIDAD_INSUFICIENTE; borrar la venta → 204", async () => {
      esperarError(
        await api(app, u).delete(`/inversiones/${etoro.id}/operaciones/${compraId}`),
        "CANTIDAD_INSUFICIENTE",
        "cantidad",
      );
      const r = await api(app, u).delete(`/inversiones/${etoro.id}/operaciones/${ventaId}`);
      expect(r.status).toBe(204);
      const { data } = await admin
        .from("inversion_operaciones_cambios")
        .select("operacion")
        .eq("operacion_id", ventaId);
      expect(data).toEqual([{ operacion: "eliminacion" }]);
    });

    describe("inversión COP con lo que ya se tenía", () => {
      let acciones: InversionDetalleDto;

      it("la posición inicial no mueve efectivo; sin campos COP", async () => {
        const r = await api(app, u).post("/inversiones", {
          nombre: "Acciones",
          moneda: "COP",
          efectivoInicial: "1000000",
          posiciones: [
            { simbolo: "ECOPETROL", nombre: "Ecopetrol", cantidad: "100", costo: "250000" },
          ],
        });
        expect(r.status).toBe(201);
        acciones = r.body as InversionDetalleDto;
        expect(acciones).toMatchObject({
          efectivo: "1000000",
          valorMercado: "1250000",
          valorMercadoCop: null,
          efectivoCop: null,
          costoCop: null,
        });
        expect(acciones.posiciones[0]).toMatchObject({ precio: "2500", valorCop: null });
        const cuentas = await lista();
        expect(cuentas.activos.cuentas.find((c) => c.id === acciones.id)?.saldo).toBe("1250000");
      });

      it("bajar el saldo inicial hasta dejar el efectivo negativo → EFECTIVO_INSUFICIENTE", async () => {
        const compra = await api(app, u).post(`/inversiones/${acciones.id}/operaciones`, {
          clase: "compra",
          simbolo: "ECOPETROL",
          cantidad: "100",
          monto: "900000",
        });
        expect(compra.status).toBe(201);
        esperarError(
          await api(app, u).patch(`/cuentas/${acciones.id}`, { saldoInicial: "500000" }),
          "EFECTIVO_INSUFICIENTE",
        );
        const ok = await api(app, u).patch(`/cuentas/${acciones.id}`, { saldoInicial: "950000" });
        expect(ok.status).toBe(200);
      });
    });

    it("validaciones del alta: ACTIVO_DUPLICADO y MONEDA_INVALIDA", async () => {
      const posicion = { simbolo: "VOO", nombre: "VOO", cantidad: "1", costo: "100" };
      esperarError(
        await api(app, u).post("/inversiones", {
          nombre: "Dup",
          moneda: "USD",
          posiciones: [posicion, posicion],
        }),
        "ACTIVO_DUPLICADO",
        "posiciones",
      );
      esperarError(
        await api(app, u).post("/inversiones", { nombre: "Euro", moneda: "EUR" }),
        "MONEDA_INVALIDA",
        "moneda",
      );
    });

    it("validaciones de operaciones y precios", async () => {
      const base = { clase: "compra", simbolo: "VOO", cantidad: "1", monto: "1" };
      esperarError(
        await operacion({ ...base, cantidad: "0.000000001" }),
        "CANTIDAD_INVALIDA",
        "cantidad",
      );
      esperarError(
        await operacion({ ...base, simbolo: "con espacios" }),
        "SIMBOLO_INVALIDO",
        "simbolo",
      );
      esperarError(await operacion({ ...base, fecha: sumarDias(H, 1) }), "FECHA_FUTURA", "fecha");
      esperarError(
        await api(app, u).post(`/inversiones/${etoro.id}/activos/${vooId}/precios`, {
          precio: "0",
        }),
        "PRECIO_INVALIDO",
        "precio",
      );
    });

    it("PATCH tipo de una inversión → TIPO_DE_INVERSION_FIJO; archivar con saldo → SALDO_NO_CERO", async () => {
      esperarError(
        await api(app, u).patch(`/cuentas/${etoro.id}`, { tipo: "banco" }),
        "TIPO_DE_INVERSION_FIJO",
        "tipo",
      );
      esperarError(await api(app, u).post(`/cuentas/${etoro.id}/archivar`), "SALDO_NO_CERO");
    });

    it("recurrentes, préstamos y perfil con eToro → 422 CUENTA_DE_INVERSION", async () => {
      esperarError(
        await api(app, u).post("/recurrentes", {
          tipo: "transferencia",
          concepto: "Ahorro",
          monto: "100000",
          variable: false,
          periodicidad: "mensual",
          primerVencimiento: H,
          cuentaOrigenId: bancolombia.id,
          cuentaDestinoId: etoro.id,
        }),
        "CUENTA_DE_INVERSION",
        "cuentaDestinoId",
      );
      esperarError(
        await api(app, u).post("/prestamos", {
          tipo: "prestamo_otorgado",
          nombre: "Camila",
          monto: "1000",
          cuentaId: etoro.id,
        }),
        "CUENTA_DE_INVERSION",
        "cuentaId",
      );
      esperarError(
        await api(app, u).patch("/perfil", { cuentaPredeterminadaId: etoro.id }),
        "CUENTA_DE_INVERSION",
        "cuentaPredeterminadaId",
      );
    });

    it("la captura no elige una inversión como predeterminada", async () => {
      const r = await api(app, u).get("/captura");
      expect(r.status).toBe(200);
      expect(r.body.cuentaPredeterminadaId).toBe(bancolombia.id);
    });

    it("con la fuente fallando y sin caché: trm null, campos COP null y saldo 0", async () => {
      const otro = await fabrica.crear();
      estado.fallar = true;
      try {
        const creada = await api(app, otro).post("/inversiones", {
          nombre: "IBKR",
          moneda: "USD",
          efectivoInicial: "1000",
        });
        expect(creada.status).toBe(201);
        const leida = await api(app, otro).get(`/inversiones/${creada.body.id}`);
        expect(leida.status).toBe(200);
        const d = leida.body as InversionDetalleDto;
        expect(d).toMatchObject({
          trm: null,
          trmDesactualizada: false,
          valorMercado: "1000",
          valorMercadoCop: null,
          costoCop: null,
          rendimientoCop: null,
          efectivoCop: null,
        });
        const cuentas = await lista(otro);
        expect(cuentas.activos.cuentas.find((c) => c.id === d.id)).toMatchObject({
          saldo: "0",
          inversion: { tasa: null, valorMercado: "1000" },
        });
        expect(cuentas.trm).toBeNull();

        // Archivar con efectivo y sin posiciones → SALDO_NO_CERO.
        esperarError(await api(app, otro).post(`/cuentas/${d.id}/archivar`), "SALDO_NO_CERO");
      } finally {
        estado.fallar = false;
      }
    });

    it("un id ajeno en cualquier ruta /inversiones/:id… → 404 INVERSION_NO_ENCONTRADA", async () => {
      const otro = await fabrica.crear();
      const ajena = `/inversiones/${etoro.id}`;
      const opId = randomUUID();
      for (const respuesta of [
        await api(app, otro).get(ajena),
        await api(app, otro).get(`${ajena}/operaciones`),
        await api(app, otro).post(`${ajena}/operaciones`, {
          clase: "compra",
          simbolo: "VOO",
          nombre: "VOO",
          cantidad: "1",
          monto: "1",
        }),
        await api(app, otro).put(`${ajena}/operaciones/${compraId}`, { monto: "1" }),
        await api(app, otro).delete(`${ajena}/operaciones/${opId}`),
        await api(app, otro).post(`${ajena}/activos/${vooId}/precios`, { precio: "1" }),
      ]) {
        esperarError(respuesta, "INVERSION_NO_ENCONTRADA");
      }
    });

    it("en la BD: cantidad, monto y monto_destino cifrados; precio_cent numérico", async () => {
      const { data: ops } = await admin
        .from("inversion_operaciones")
        .select("cantidad, monto")
        .eq("cuenta_id", etoro.id);
      expect(ops!.length).toBeGreaterThan(0);
      for (const op of ops!) {
        expect(op.cantidad).toMatch(FORMATO_CIFRADO);
        expect(op.monto).toMatch(FORMATO_CIFRADO);
      }
      const { data: mov } = await admin
        .from("movimientos")
        .select("monto_destino")
        .eq("id", fondeoId)
        .single();
      expect(mov?.monto_destino).toMatch(FORMATO_CIFRADO);
      const { data: precios } = await admin
        .from("inversion_precios")
        .select("precio_cent")
        .eq("activo_id", vooId);
      expect(precios!.map((p) => p.precio_cent).toSorted((x, y) => Number(x) - Number(y))).toEqual([
        50000, 56240,
      ]);
    });
  });
});
