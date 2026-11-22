/**
 * Precios automáticos de punta a punta (SPEC 11): los criterios de aceptación
 * con usuarios reales.
 *
 * La fuente de precios se reemplaza por una falsa que cuenta llamadas:
 * - cubre VOO (etf, «Vanguard S&P 500 ETF»), BTC (cripto, BTC/USD, «Bitcoin
 *   US Dollar») y T1…T9 (acciones, para el lote); no cubre RENEW;
 * - devuelve cierre "562.4" de H−1 en acciones y ETF, e intradía "71400" en
 *   BTC/USD (o el que fije la prueba), con `cotizadoEn` de hace 1 minuto;
 * - con `fallar`, todo devuelve null.
 * La TRM falsa vale 4.120 (SPEC 10). Las e2e no salen a la red.
 *
 * El «reloj de la prueba» se adelanta envejeciendo en la base `consultado_en`
 * y el `cotizado_en` de los precios, porque `consultado_en` lo fija `now()` de
 * Postgres. `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios y
 * para esas comprobaciones y ajustes directos en Tino dev, nunca en la API
 * (REGLAS §4).
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { mesAnterior, restarDias, sumarDias } from "../src/domain/fecha/mes.js";
import type { PrecioObtenido, ResultadoBusqueda } from "../src/domain/precio/precio.js";
import { fechasDePrecios } from "../src/domain/resumen/patrimonio.js";
import type { Trm } from "../src/domain/trm/trm.js";
import type {
  BusquedaActivoDto,
  InversionDetalleDto,
  PosicionDto,
} from "../src/inversiones/dto.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";
import {
  PreciosFuente,
  type ActivoAConsultar,
  type PedidoHistorico,
} from "../src/repositories/twelve-data/precios.fuente.js";
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
    "[precios] OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY). " +
      "Defínela en .env.test.local.",
  );
}

const ZONA = "America/Bogota";
const H = fechaLocal(new Date(), ZONA);
const AYER = sumarDias(H, -1);

const trmFalsa = {
  obtenerEn: async (fecha: string): Promise<Trm> => ({
    valorCent: 412_000n,
    vigenteDesde: fecha,
    vigenteHasta: fecha,
  }),
  obtenerRango: async (desde: string, hasta: string): Promise<Trm[]> => [
    { valorCent: 412_000n, vigenteDesde: desde, vigenteHasta: hasta },
  ],
};

const resultado = (
  symbol: string,
  instrumentName: string,
  instrumentType: string,
  currency: string,
  exchange: string,
): ResultadoBusqueda => ({ symbol, instrumentName, instrumentType, currency, exchange });

function resultadosDe(simbolo: string): ResultadoBusqueda[] {
  if (simbolo === "VOO") return [resultado("VOO", "Vanguard S&P 500 ETF", "ETF", "USD", "NYSE")];
  if (simbolo === "BTC") {
    return [resultado("BTC/USD", "Bitcoin US Dollar", "Digital Currency", "", "Coinbase Pro")];
  }
  if (simbolo === "RENEW") return [resultado("RENEW", "UBS CMCI", "ETF", "USD", "SIX")];
  if (/^T\d$/.test(simbolo)) {
    return [resultado(simbolo, `Acción ${simbolo}`, "Common Stock", "USD", "NASDAQ")];
  }
  return [];
}

const estado = { fallar: false, intradia: 7_140_000n };
const haceUnMinuto = () => new Date(Date.now() - 60_000);

const fuentePrecios = {
  disponible: true,
  buscar: vi.fn(async (simbolo: string) => (estado.fallar ? null : resultadosDe(simbolo))),
  actuales: vi.fn(async (activos: readonly ActivoAConsultar[]) =>
    activos.map((a): PrecioObtenido | null => {
      if (estado.fallar) return null;
      return a.clase === "cripto"
        ? {
            activoId: a.activoId,
            precio: estado.intradia,
            fecha: H,
            origen: "intradia",
            cotizadoEn: haceUnMinuto(),
          }
        : {
            activoId: a.activoId,
            precio: 56_240n,
            fecha: AYER,
            origen: "cierre",
            cotizadoEn: haceUnMinuto(),
          };
    }),
  ),
  /** Un cierre por día del rango, de 50.000 + día. */
  historico: vi.fn(async (pedidos: readonly PedidoHistorico[]) =>
    pedidos.map((p) => {
      if (estado.fallar) return null;
      const cierres = [];
      for (let f = p.desde, i = 0; f <= p.hasta; f = sumarDias(f, 1), i++) {
        cierres.push({
          fecha: f,
          precio: 50_000n + BigInt(i),
          cotizadoEn: new Date(`${f}T00:00:00Z`),
        });
      }
      return cierres;
    }),
  ),
};

function limpiarConteos(): void {
  fuentePrecios.buscar.mockClear();
  fuentePrecios.actuales.mockClear();
  fuentePrecios.historico.mockClear();
}

describe.skipIf(!conUsuarios)("precios automáticos (SPEC 11)", () => {
  let app: INestApplication<App>;
  let fabrica: ReturnType<typeof crearFabricaUsuarios>;
  let admin: SupabaseClient;
  let u: UsuarioPrueba;
  let otro: UsuarioPrueba;
  let etoroId: string;
  let vooId: string;
  let btcId: string;
  let renewId: string;
  let ajenaId: string;
  let ajenoActivoId: string;

  const detalle = async (id: string): Promise<InversionDetalleDto> => {
    const r = await api(app, u).get(`/inversiones/${id}`);
    expect(r.status).toBe(200);
    return r.body as InversionDetalleDto;
  };
  const posicion = (d: InversionDetalleDto, simbolo: string): PosicionDto => {
    const p = d.posiciones.find((x) => x.simbolo === simbolo);
    if (!p) throw new Error(`Sin posición ${simbolo}`);
    return p;
  };
  const compra = (cuerpo: object) =>
    api(app, u).post(`/inversiones/${etoroId}/operaciones`, { clase: "compra", ...cuerpo });

  /** Adelanta el reloj de la prueba: envejece la última consulta de los activos. */
  async function envejecerConsulta(ids: string[], minutos: number): Promise<void> {
    const { error } = await admin
      .from("inversion_activos")
      .update({ consultado_en: new Date(Date.now() - minutos * 60_000).toISOString() })
      .in("id", ids);
    if (error) throw new Error(error.message);
  }

  async function envejecerPrecios(activoId: string, origen: string, minutos: number) {
    const { error } = await admin
      .from("inversion_precios")
      .update({ cotizado_en: new Date(Date.now() - minutos * 60_000).toISOString() })
      .eq("activo_id", activoId)
      .eq("origen", origen);
    if (error) throw new Error(error.message);
  }

  async function consultadoEn(activoId: string): Promise<string | null> {
    const { data } = await admin
      .from("inversion_activos")
      .select("consultado_en")
      .eq("id", activoId)
      .single();
    return (data as { consultado_en: string | null }).consultado_en;
  }

  beforeAll(async () => {
    app = await crearApp([
      { proveedor: TrmFuente, valor: trmFalsa },
      { proveedor: PreciosFuente, valor: fuentePrecios },
    ]);
    fabrica = crearFabricaUsuarios("Precios");
    admin = fabrica.admin;
    u = await fabrica.crear();
    otro = await fabrica.crear();

    const banco = await crearCuenta(app, u, {
      nombre: "Bancolombia",
      tipo: "banco",
      saldoInicial: "100000000",
    });
    const r = await api(app, u).post("/inversiones", { nombre: "eToro", moneda: "USD" });
    expect(r.status).toBe(201);
    etoroId = (r.body as InversionDetalleDto).id;
    const fondeo = await api(app, u).post("/movimientos", {
      tipo: "transferencia",
      monto: "41200000",
      montoDestino: "1000000",
      cuentaOrigenId: banco.id,
      cuentaDestinoId: etoroId,
    });
    expect(fondeo.status).toBe(201);

    const ajena = await api(app, otro).post("/inversiones", {
      nombre: "Ajena",
      moneda: "USD",
      posiciones: [{ simbolo: "AJN", nombre: "Ajena", cantidad: "1", costo: "1000" }],
    });
    expect(ajena.status).toBe(201);
    ajenaId = (ajena.body as InversionDetalleDto).id;
    ajenoActivoId = (ajena.body as InversionDetalleDto).posiciones[0]!.activoId;
  });

  afterAll(async () => {
    await fabrica?.borrarTodos();
    await app?.close();
  });

  beforeEach(() => {
    estado.fallar = false;
    limpiarConteos();
  });

  it("buscar voo → cubierto con el nombre del proveedor; RENEW → no cubierto", async () => {
    const r = await api(app, u).get(`/inversiones/${etoroId}/activos/buscar?simbolo=voo`);
    expect(r.status).toBe(200);
    expect(r.body as BusquedaActivoDto).toEqual({
      simbolo: "VOO",
      cubierto: true,
      nombre: "Vanguard S&P 500 ETF",
      clase: "etf",
      proveedorDisponible: true,
    });

    const renew = await api(app, u).get(`/inversiones/${etoroId}/activos/buscar?simbolo=RENEW`);
    expect(renew.body).toMatchObject({
      simbolo: "RENEW",
      cubierto: false,
      nombre: null,
      clase: null,
    });
  });

  it("buscar con un símbolo inválido → 400 SIMBOLO_INVALIDO", async () => {
    esperarError(
      await api(app, u).get(`/inversiones/${etoroId}/activos/buscar?simbolo=con%20espacios`),
      "SIMBOLO_INVALIDO",
      "simbolo",
    );
    esperarError(
      await api(app, u).get(`/inversiones/${etoroId}/activos/buscar`),
      "SIMBOLO_INVALIDO",
      "simbolo",
    );
  });

  it("compra de VOO sin nombre → 201 automático etf con el cierre de H−1", async () => {
    const r = await compra({ simbolo: "VOO", cantidad: "2", monto: "100000" });
    expect(r.status).toBe(201);
    const voo = posicion(r.body as InversionDetalleDto, "VOO");
    vooId = voo.activoId;
    expect(voo).toMatchObject({
      nombre: "Vanguard S&P 500 ETF",
      cotizacion: "automatica",
      clase: "etf",
      precio: "56240",
      precioOrigen: "cierre",
      precioFecha: AYER,
      precioVencido: false,
    });
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);
  });

  it("compra de RENEW sin nombre → 400 NOMBRE_REQUERIDO; con nombre → manual, clase null", async () => {
    esperarError(
      await compra({ simbolo: "RENEW", cantidad: "1", monto: "1000" }),
      "NOMBRE_REQUERIDO",
      "nombre",
    );
    const r = await compra({
      simbolo: "RENEW",
      nombre: "Renovables",
      cantidad: "1",
      monto: "1000",
    });
    expect(r.status).toBe(201);
    const renew = posicion(r.body as InversionDetalleDto, "RENEW");
    renewId = renew.activoId;
    expect(renew).toMatchObject({
      nombre: "Renovables",
      cotizacion: "manual",
      clase: null,
      precioOrigen: "manual",
      precioVencido: false,
    });
  });

  it("compra de BTC → cripto con el intradía 7140000", async () => {
    const r = await compra({ simbolo: "BTC", cantidad: "0.01", monto: "71400" });
    expect(r.status).toBe(201);
    const btc = posicion(r.body as InversionDetalleDto, "BTC");
    btcId = btc.activoId;
    expect(btc).toMatchObject({
      nombre: "Bitcoin US Dollar",
      cotizacion: "automatica",
      clase: "cripto",
      precio: "7140000",
      precioOrigen: "intradia",
      precioVencido: false,
    });
    expect(Number.isNaN(Date.parse(btc.precioCotizadoEn))).toBe(false);
  });

  it("un segundo GET antes de 15 min no llama a la fuente", async () => {
    await detalle(etoroId);
    expect(fuentePrecios.actuales).not.toHaveBeenCalled();
  });

  it("16 min después: consulta solo BTC y el intradía de hoy se actualiza en su sitio", async () => {
    await envejecerConsulta([btcId], 16);
    estado.intradia = 7_150_000n;
    const d = await detalle(etoroId);
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);
    const lote = fuentePrecios.actuales.mock.calls[0]![0];
    expect(lote.map((a) => a.activoId)).toEqual([btcId]);
    expect(posicion(d, "BTC").precio).toBe("7150000");

    const { data } = await admin
      .from("inversion_precios")
      .select("precio_cent")
      .eq("activo_id", btcId)
      .eq("origen", "intradia");
    expect(data).toEqual([{ precio_cent: 7_150_000 }]);
  });

  it("GET /cuentas y GET /inversiones también refrescan los vencidos", async () => {
    await envejecerConsulta([btcId], 16);
    expect((await api(app, u).get("/cuentas")).status).toBe(200);
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);

    await envejecerConsulta([btcId], 16);
    expect((await api(app, u).get("/inversiones")).status).toBe(200);
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(2);
  });

  it("con la fuente fallando y el reloj vencido: último precio, precioVencido y consultado_en al día", async () => {
    await envejecerConsulta([vooId, btcId], 120);
    await envejecerPrecios(vooId, "cierre", 8 * 24 * 60);
    await envejecerPrecios(btcId, "intradia", 20);
    estado.fallar = true;
    const antes = await consultadoEn(btcId);

    const d = await detalle(etoroId);
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);
    expect(posicion(d, "VOO")).toMatchObject({ precio: "56240", precioVencido: true });
    expect(posicion(d, "BTC")).toMatchObject({ precio: "7150000", precioVencido: true });
    expect(posicion(d, "RENEW").precioVencido).toBe(false);
    expect(await consultadoEn(btcId)).not.toBe(antes);

    await detalle(etoroId);
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);
  });

  it("POST …/precios en un activo automático → 422 PRECIO_AUTOMATICO", async () => {
    esperarError(
      await api(app, u).post(`/inversiones/${etoroId}/activos/${vooId}/precios`, {
        precio: "57000",
      }),
      "PRECIO_AUTOMATICO",
      "precio",
    );
  });

  it("PATCH VOO a manual → 200; precio manual → 201; repetir → 400 SIN_CAMBIOS", async () => {
    const r = await api(app, u).patch(`/inversiones/${etoroId}/activos/${vooId}`, {
      cotizacion: "manual",
    });
    expect(r.status).toBe(200);
    expect(posicion(r.body as InversionDetalleDto, "VOO")).toMatchObject({
      cotizacion: "manual",
      clase: "etf",
      precioVencido: false,
    });

    const precio = await api(app, u).post(`/inversiones/${etoroId}/activos/${vooId}/precios`, {
      precio: "57000",
    });
    expect(precio.status).toBe(201);
    expect(posicion(precio.body as InversionDetalleDto, "VOO")).toMatchObject({
      precio: "57000",
      precioOrigen: "manual",
    });

    esperarError(
      await api(app, u).patch(`/inversiones/${etoroId}/activos/${vooId}`, { cotizacion: "manual" }),
      "SIN_CAMBIOS",
    );
  });

  it("PATCH con otro valor o campo → 400 ENTRADA_INVALIDA", async () => {
    const ruta = `/inversiones/${etoroId}/activos/${vooId}`;
    esperarError(
      await api(app, u).patch(ruta, { cotizacion: "auto" }),
      "ENTRADA_INVALIDA",
      "cotizacion",
    );
    esperarError(
      await api(app, u).patch(ruta, { cotizacion: "manual", nombre: "x" }),
      "ENTRADA_INVALIDA",
    );
  });

  it("PATCH RENEW a automática → 422 ACTIVO_NO_CUBIERTO; con la fuente fallando → 503", async () => {
    const ruta = `/inversiones/${etoroId}/activos/${renewId}`;
    esperarError(
      await api(app, u).patch(ruta, { cotizacion: "automatica" }),
      "ACTIVO_NO_CUBIERTO",
      "cotizacion",
    );
    estado.fallar = true;
    esperarError(
      await api(app, u).patch(ruta, { cotizacion: "automatica" }),
      "PROVEEDOR_NO_DISPONIBLE",
    );
  });

  describe("activo manual de SPEC 10 e histórico", () => {
    let historicaId: string;
    let historicoVooId: string;
    const compraPasada = restarDias(H, 45);
    const mes = mesAnterior(H.slice(0, 7));

    it("un activo manual pasa a automático y la siguiente lectura trae su precio", async () => {
      // Con la fuente caída, nace manual: como un activo creado en SPEC 10.
      estado.fallar = true;
      const r = await api(app, u).post("/inversiones", {
        nombre: "Histórica",
        moneda: "USD",
        posiciones: [
          {
            simbolo: "VOO",
            nombre: "Vanguard",
            cantidad: "1",
            costo: "50000",
            fecha: compraPasada,
          },
        ],
      });
      expect(r.status).toBe(201);
      const creada = r.body as InversionDetalleDto;
      historicaId = creada.id;
      historicoVooId = posicion(creada, "VOO").activoId;
      expect(posicion(creada, "VOO").cotizacion).toBe("manual");

      estado.fallar = false;
      limpiarConteos();
      const patch = await api(app, u).patch(
        `/inversiones/${historicaId}/activos/${historicoVooId}`,
        {
          cotizacion: "automatica",
        },
      );
      expect(patch.status).toBe(200);
      expect(posicion(patch.body as InversionDetalleDto, "VOO")).toMatchObject({
        cotizacion: "automatica",
        clase: "etf",
        precioOrigen: "manual",
      });
      expect(fuentePrecios.actuales).not.toHaveBeenCalled();

      const d = await detalle(historicaId);
      expect(posicion(d, "VOO")).toMatchObject({ precioOrigen: "cierre", precio: "56240" });
    });

    it("GET /resumen de un mes pasado: un time_series por activo, solo los cierres usados, sin repetir", async () => {
      const r = await api(app, u).get(`/resumen?mes=${mes}`);
      expect(r.status).toBe(200);
      expect(fuentePrecios.historico).toHaveBeenCalledTimes(1);
      const pedidos = fuentePrecios.historico.mock.calls[0]![0];
      expect(pedidos.map((p) => p.activoId)).toEqual([historicoVooId]);

      const { data } = await admin
        .from("inversion_precios")
        .select("fecha")
        .eq("activo_id", historicoVooId)
        .eq("origen", "cierre")
        .neq("fecha", AYER);
      const fechas = (data as { fecha: string }[]).map((f) => f.fecha);
      expect(fechas.length).toBeGreaterThan(0);
      const usadas = new Set(fechasDePrecios(H, mes));
      expect(fechas.every((f) => usadas.has(f))).toBe(true);

      limpiarConteos();
      expect((await api(app, u).get(`/resumen?mes=${mes}`)).status).toBe(200);
      expect(fuentePrecios.historico).not.toHaveBeenCalled();
    });
  });

  it("con más de 8 activos automáticos vencidos, una lectura consulta solo los 8 más antiguos", async () => {
    const posiciones = Array.from({ length: 9 }, (_, i) => ({
      simbolo: `T${i + 1}`,
      cantidad: "1",
      costo: "1000",
    }));
    const r = await api(app, u).post("/inversiones", { nombre: "Lote", moneda: "USD", posiciones });
    expect(r.status).toBe(201);
    const lote = r.body as InversionDetalleDto;
    expect(lote.posiciones.every((p) => p.cotizacion === "automatica")).toBe(true);
    // La respuesta del alta ya leyó: 8 de los 9 nunca consultados.
    expect(fuentePrecios.actuales).toHaveBeenCalledTimes(1);
    expect(fuentePrecios.actuales.mock.calls[0]![0]).toHaveLength(8);

    const consultados = new Set(fuentePrecios.actuales.mock.calls[0]![0].map((a) => a.activoId));
    const pendiente = lote.posiciones.find((p) => !consultados.has(p.activoId))!;
    limpiarConteos();
    await detalle(lote.id);
    expect(fuentePrecios.actuales.mock.calls[0]![0].map((a) => a.activoId)).toEqual([
      pendiente.activoId,
    ]);
  });

  it("un id ajeno en buscar o en PATCH → 404", async () => {
    esperarError(
      await api(app, u).get(`/inversiones/${ajenaId}/activos/buscar?simbolo=VOO`),
      "INVERSION_NO_ENCONTRADA",
    );
    esperarError(
      await api(app, u).patch(`/inversiones/${ajenaId}/activos/${ajenoActivoId}`, {
        cotizacion: "manual",
      }),
      "INVERSION_NO_ENCONTRADA",
    );
    esperarError(
      await api(app, u).patch(`/inversiones/${etoroId}/activos/${ajenoActivoId}`, {
        cotizacion: "manual",
      }),
      "ACTIVO_NO_ENCONTRADO",
      "simbolo",
    );
  });
});

describe.skipIf(!conUsuarios)("sin TWELVE_DATA_API_KEY (SPEC 11)", () => {
  let app: INestApplication<App>;
  let fabrica: ReturnType<typeof crearFabricaUsuarios>;
  let u: UsuarioPrueba;
  const fetchReal = globalThis.fetch;
  const aTwelveData: string[] = [];

  beforeAll(async () => {
    // La fuente real sin clave: cualquier salida a Twelve Data quedaría registrada.
    vi.stubGlobal("fetch", (entrada: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = entrada instanceof Request ? entrada.url : String(entrada);
      if (url.includes("twelvedata")) aTwelveData.push(url);
      return fetchReal(entrada, init);
    });
    app = await crearApp([
      { proveedor: TrmFuente, valor: trmFalsa },
      { proveedor: PreciosFuente, valor: new PreciosFuente(null) },
    ]);
    fabrica = crearFabricaUsuarios("SinClave");
    u = await fabrica.crear();
  });

  afterAll(async () => {
    await fabrica?.borrarTodos();
    await app?.close();
    vi.unstubAllGlobals();
  });

  it("búsqueda no disponible, activos nuevos manuales y ninguna lectura sale a la fuente", async () => {
    const r = await api(app, u).post("/inversiones", {
      nombre: "eToro",
      moneda: "USD",
      posiciones: [{ simbolo: "VOO", nombre: "Vanguard", cantidad: "1", costo: "50000" }],
    });
    expect(r.status).toBe(201);
    const inversion = r.body as InversionDetalleDto;
    expect(inversion.posiciones[0]).toMatchObject({ cotizacion: "manual", clase: null });

    esperarError(
      await api(app, u).post("/inversiones", {
        nombre: "Otra",
        moneda: "USD",
        posiciones: [{ simbolo: "VOO", cantidad: "1", costo: "50000" }],
      }),
      "NOMBRE_REQUERIDO",
      "posiciones.0.nombre",
    );

    const busqueda = await api(app, u).get(
      `/inversiones/${inversion.id}/activos/buscar?simbolo=VOO`,
    );
    expect(busqueda.body).toEqual({
      simbolo: "VOO",
      cubierto: false,
      nombre: null,
      clase: null,
      proveedorDisponible: false,
    });

    for (const ruta of ["/inversiones", `/inversiones/${inversion.id}`, "/cuentas", "/resumen"]) {
      expect((await api(app, u).get(ruta)).status).toBe(200);
    }
    expect(aTwelveData).toEqual([]);
  });
});
