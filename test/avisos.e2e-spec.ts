/**
 * /avisos de punta a punta (SPEC 12): los criterios de aceptación con
 * usuarios reales.
 *
 * `H` es hoy en la zona del perfil (America/Bogota). Todo aviso de la prueba
 * dispara en `H − 1` o antes, para no depender de la hora en que corre (antes
 * de las 08:00 no sale el aviso de hoy).
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios, para fechar
 * en el pasado `creado_en`, `generar_desde`, `primer_vencimiento` y los
 * precios (la API no lo admite) y para quitar un préstamo, que no tiene
 * endpoint de borrado. La API nunca lo usa (REGLAS §4). Apunta solo a Tino
 * dev, nunca a datos reales.
 *
 * Las fuentes de precios y de TRM son falsas y cuentan llamadas: los avisos no
 * refrescan precios ni TRM (SPEC 11).
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  AvisoCobroDto,
  AvisoDeudaDto,
  AvisoDto,
  AvisoPrecioDto,
  AvisoRecurrenteDto,
  AvisosDto,
} from "../src/avisos/dto.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { fechaLocal, instanteLocal } from "../src/domain/fecha/fecha-local.js";
import { sumarDias } from "../src/domain/fecha/mes.js";
import type { ResultadoBusqueda } from "../src/domain/precio/precio.js";
import type { Trm } from "../src/domain/trm/trm.js";
import type { InversionDetalleDto } from "../src/inversiones/dto.js";
import type { PrestamoDetalleDto } from "../src/prestamos/dto.js";
import type { RecurrenteDto } from "../src/recurrentes/dto.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";
import { PreciosFuente } from "../src/repositories/twelve-data/precios.fuente.js";
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
    "[avisos] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

const ZONA = "America/Bogota";
const H = fechaLocal(new Date(), ZONA);
const dia = (n: number) => sumarDias(H, n);
/** Las 08:00 locales del día `n` respecto de H, en ISO UTC. */
const ochoDe = (n: number) => instanteLocal(dia(n), "08:00", ZONA).toISOString();
/** Mediodía local del día `n`, para fechar `creado_en` y `cotizado_en`. */
const mediodiaDe = (n: number) => instanteLocal(dia(n), "12:00", ZONA).toISOString();

const trmFalsa = {
  obtenerEn: vi.fn(async (fecha: string): Promise<Trm> => ({
    valorCent: 412_000n,
    vigenteDesde: fecha,
    vigenteHasta: fecha,
  })),
  obtenerRango: vi.fn(async (desde: string, hasta: string): Promise<Trm[]> => [
    { valorCent: 412_000n, vigenteDesde: desde, vigenteHasta: hasta },
  ]),
};

/** Cubre solo VOO (ETF en USD). */
const fuentePrecios = {
  disponible: true,
  buscar: vi.fn(async (simbolo: string): Promise<ResultadoBusqueda[]> =>
    simbolo === "VOO"
      ? [
          {
            symbol: "VOO",
            instrumentName: "Vanguard S&P 500 ETF",
            instrumentType: "ETF",
            currency: "USD",
            exchange: "NYSE",
          },
        ]
      : [],
  ),
  actuales: vi.fn(async (activos: readonly unknown[]) => activos.map(() => null)),
  historico: vi.fn(async (pedidos: readonly unknown[]) => pedidos.map(() => null)),
};

function limpiarConteos(): void {
  for (const f of [
    fuentePrecios.buscar,
    fuentePrecios.actuales,
    fuentePrecios.historico,
    trmFalsa.obtenerEn,
    trmFalsa.obtenerRango,
  ]) {
    f.mockClear();
  }
}

describe("/avisos", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp([
      { proveedor: TrmFuente, valor: trmFalsa },
      { proveedor: PreciosFuente, valor: fuentePrecios },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/avisos"), "NO_AUTENTICADO");
    esperarError(await request(app.getHttpServer()).get("/avisos/conteo"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let otro: UsuarioPrueba;
    let nequi: CuentaDto;
    let bancolombia: CuentaDto;
    let servicios: string;

    let gas: RecurrenteDto;
    let camila: PrestamoDetalleDto;
    let mama: PrestamoDetalleDto;
    let otroVisible: AvisoRecurrenteDto;

    async function avisos(quien: UsuarioPrueba = u): Promise<AvisosDto> {
      const r = await api(app, quien).get("/avisos");
      expect(r.status).toBe(200);
      return r.body as AvisosDto;
    }

    async function conteo(): Promise<number> {
      const r = await api(app, u).get("/avisos/conteo");
      expect(r.status).toBe(200);
      return (r.body as { noLeidos: number }).noLeidos;
    }

    const deTipo = <T extends AvisoDto>(lista: AvisosDto, tipo: T["tipo"]): T[] =>
      lista.avisos.filter((a): a is T => a.tipo === tipo);

    const recurrentesDe = (lista: AvisosDto, id: string) =>
      deTipo<AvisoRecurrenteDto>(lista, "recurrente").filter((a) => a.recurrente.id === id);

    const prestamoDe = (lista: AvisosDto, id: string) =>
      lista.avisos.filter(
        (a): a is AvisoCobroDto | AvisoDeudaDto =>
          (a.tipo === "cobro" || a.tipo === "deuda") && a.prestamo.id === id,
      );

    async function fechar(tabla: string, id: string, columnas: object): Promise<void> {
      const { error } = await admin.from(tabla).update(columnas).eq("id", id);
      if (error) throw new Error(`No se pudo fechar ${tabla}: ${error.message}`);
    }

    /** Plantilla de gasto mensual con primer vencimiento `vence` y creada el día `creada`. */
    async function plantilla(
      quien: UsuarioPrueba,
      cuerpo: object,
      calendario: { vence?: string; creada: number },
    ): Promise<RecurrenteDto> {
      const r = await api(app, quien).post("/recurrentes", cuerpo);
      expect(r.status).toBe(201);
      const p = r.body as RecurrenteDto;
      await fechar("recurrentes", p.id, {
        creado_en: mediodiaDe(calendario.creada),
        ...(calendario.vence === undefined
          ? {}
          : { primer_vencimiento: calendario.vence, generar_desde: calendario.vence }),
      });
      return p;
    }

    /** Préstamo creado el día `creada` (su cuenta se fecha en el pasado). */
    async function prestamo(cuerpo: object, creada: number): Promise<PrestamoDetalleDto> {
      const r = await api(app, u).post("/prestamos", cuerpo);
      expect(r.status).toBe(201);
      const p = r.body as PrestamoDetalleDto;
      await fechar("cuentas", p.id, { creado_en: mediodiaDe(creada) });
      return p;
    }

    /** Fecha el precio inicial de los activos de la inversión en el día `n`. */
    async function fecharPrecios(inversion: InversionDetalleDto, n: number): Promise<void> {
      const ids = inversion.posiciones.map((p) => p.activoId);
      const { error } = await admin
        .from("inversion_precios")
        .update({ fecha: dia(n), cotizado_en: mediodiaDe(n) })
        .in("activo_id", ids);
      if (error) throw new Error(`No se pudo fechar el precio: ${error.message}`);
    }

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Avisos");
      admin = fabrica.admin;
      u = await fabrica.crear();
      otro = await fabrica.crear();
      nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "900000" });
      bancolombia = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "2000000",
      });
      const { data } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", "Servicios")
        .single();
      servicios = data!.id as string;
    });

    afterAll(async () => {
      await fabrica?.borrarTodos();
    });

    it("un usuario nuevo: lista vacía, 0 no leídos, 08:00 y la configuración por defecto", async () => {
      expect(await avisos()).toEqual({
        fechaHoy: H,
        zonaHoraria: ZONA,
        horaAvisos: "08:00",
        noLeidos: 0,
        avisos: [],
        config: [
          { tipo: "recurrente", activo: true, dias: 3, opciones: [1, 3, 5, 7] },
          { tipo: "cobro", activo: true, dias: 30, opciones: [0, 14, 30] },
          { tipo: "deuda", activo: true, dias: 7, opciones: [1, 3, 7] },
          { tipo: "precio_manual", activo: false, dias: 7, opciones: [3, 7, 14] },
        ],
      });
      expect(await conteo()).toBe(0);
    });

    it("gasto variable que vence en H + 2, creado en H − 5, antelación 3: aviso en H − 1 a las 08:00", async () => {
      gas = await plantilla(
        u,
        {
          tipo: "gasto",
          concepto: "Gas Vanti",
          monto: "32400",
          variable: true,
          periodicidad: "mensual",
          primerVencimiento: dia(2),
          cuentaOrigenId: nequi.id,
          categoriaId: servicios,
        },
        { creada: -5 },
      );

      const lista = await avisos();
      expect(lista.avisos).toEqual([
        {
          clave: `recurrente:${gas.id}:${dia(2)}`,
          tipo: "recurrente",
          instante: ochoDe(-1),
          leido: false,
          resuelto: false,
          recurrente: { id: gas.id, concepto: "Gas Vanti", tipo: "gasto", variable: true },
          vencimiento: dia(2),
          cuenta: { id: nequi.id, nombre: "Nequi" },
          monto: "32400",
          estimado: true,
          resolucion: null,
        },
      ]);
      expect(lista.noLeidos).toBe(1);
      expect(await conteo()).toBe(1);
    });

    it("confirmar la ocurrencia la deja resuelta, confirmada y leída sin marca", async () => {
      const r = await api(app, u).post(`/recurrentes/${gas.id}/confirmar`, {
        vencimiento: dia(2),
        monto: "35000",
      });
      expect(r.status).toBe(201);

      const [aviso] = recurrentesDe(await avisos(), gas.id);
      expect(aviso).toMatchObject({
        resuelto: true,
        leido: true,
        monto: "35000",
        estimado: false,
        resolucion: { forma: "confirmada", fecha: H },
      });
      const { count } = await admin
        .from("avisos_leidos")
        .select("clave", { count: "exact", head: true })
        .eq("usuario_id", u.id);
      expect(count).toBe(0);
      expect(await conteo()).toBe(0);
    });

    it("PATCH { leido: false } → 204 y el aviso vuelve a no leído aunque esté resuelto", async () => {
      const clave = `recurrente:${gas.id}:${dia(2)}`;
      const r = await api(app, u).patch(`/avisos/${clave}`, { leido: false });
      expect(r.status).toBe(204);

      const [aviso] = recurrentesDe(await avisos(), gas.id);
      expect(aviso).toMatchObject({ clave, resuelto: true, leido: false });
      expect(await conteo()).toBe(1);
    });

    it("préstamo otorgado de 500.000, acordado en H − 31, cobro cada 30 días: avisos en H − 31 y H − 1", async () => {
      camila = await prestamo(
        {
          tipo: "prestamo_otorgado",
          nombre: "Camila",
          monto: "500000",
          cuentaId: nequi.id,
          fecha: dia(-40),
          fechaAcordada: dia(-31),
        },
        -40,
      );

      const cobros = prestamoDe(await avisos(), camila.id);
      expect(cobros.map((a) => [a.tipo, a.clave, a.instante])).toEqual([
        ["cobro", `cobro:${camila.id}:${dia(-1)}`, ochoDe(-1)],
        ["cobro", `cobro:${camila.id}:${dia(-31)}`, ochoDe(-31)],
      ]);
      for (const a of cobros as AvisoCobroDto[]) {
        expect(a).toMatchObject({
          prestamo: { id: camila.id, nombre: "Camila" },
          fechaAcordada: dia(-31),
          monto: "500000",
          capitalPendiente: "500000",
          proximoRecordatorio: dia(29),
          resuelto: false,
          leido: false,
          resolucion: null,
        });
      }
      expect((cobros as AvisoCobroDto[]).map((a) => a.recordatorio)).toEqual([dia(-1), dia(-31)]);
    });

    it("un abono de 100.000 en H − 1 resuelve los dos; el capital pendiente baja a 400.000", async () => {
      const r = await api(app, u).post(`/prestamos/${camila.id}/abonos`, {
        cuentaId: nequi.id,
        fecha: dia(-1),
        capital: "100000",
        interes: "0",
      });
      expect(r.status).toBe(201);

      const cobros = prestamoDe(await avisos(), camila.id);
      expect(cobros).toHaveLength(2);
      for (const a of cobros) {
        expect(a).toMatchObject({
          resuelto: true,
          leido: true,
          monto: "100000",
          capitalPendiente: "400000",
          resolucion: {
            forma: "abono",
            fecha: dia(-1),
            monto: "100000",
            cuenta: { id: nequi.id, nombre: "Nequi" },
          },
        });
      }
    });

    it("PATCH /avisos/config/deuda { dias: 5 } → 400 ANTELACION_INVALIDA en dias; {} → SIN_CAMBIOS", async () => {
      esperarError(
        await api(app, u).patch("/avisos/config/deuda", { dias: 5 }),
        "ANTELACION_INVALIDA",
        "dias",
      );
      esperarError(await api(app, u).patch("/avisos/config/deuda", {}), "SIN_CAMBIOS");
    });

    it("PATCH /avisos/config/tarjeta → 400 ENTRADA_INVALIDA", async () => {
      esperarError(
        await api(app, u).patch("/avisos/config/tarjeta", { activo: true }),
        "ENTRADA_INVALIDA",
      );
    });

    it("deuda contraída acordada en H + 2 con antelación 3: aviso en H − 1 por el capital pendiente", async () => {
      const r = await api(app, u).patch("/avisos/config/deuda", { dias: 3 });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ tipo: "deuda", activo: true, dias: 3, opciones: [1, 3, 7] });

      mama = await prestamo(
        {
          tipo: "deuda_contraida",
          nombre: "Mamá",
          monto: "300000",
          cuentaId: bancolombia.id,
          fecha: dia(-10),
          fechaAcordada: dia(2),
        },
        -10,
      );

      const [aviso, ...resto] = prestamoDe(await avisos(), mama.id);
      expect(resto).toEqual([]);
      expect(aviso).toEqual({
        clave: `deuda:${mama.id}:${dia(2)}`,
        tipo: "deuda",
        instante: ochoDe(-1),
        leido: false,
        resuelto: false,
        prestamo: { id: mama.id, nombre: "Mamá" },
        fechaAcordada: dia(2),
        monto: "300000",
        capitalPendiente: "300000",
        resolucion: null,
      });
    });

    it("un préstamo sin fecha acordada no da avisos", async () => {
      const andres = await prestamo(
        {
          tipo: "prestamo_otorgado",
          nombre: "Andrés",
          monto: "80000",
          cuentaId: nequi.id,
          fecha: dia(-40),
        },
        -40,
      );
      expect(prestamoDe(await avisos(), andres.id)).toEqual([]);
    });

    it("PATCH /avisos/config/precio_manual { dias: 14 } activa el tipo", async () => {
      const r = await api(app, u).patch("/avisos/config/precio_manual", { dias: 14 });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        tipo: "precio_manual",
        activo: true,
        dias: 14,
        opciones: [3, 7, 14],
      });
    });

    it("activo manual con último precio en H − 8 y plazo 7: un aviso sin resolver; registrar un precio lo resuelve", async () => {
      expect((await api(app, u).patch("/avisos/config/precio_manual", { dias: 7 })).status).toBe(
        200,
      );
      const r = await api(app, u).post("/inversiones", {
        nombre: "Finca",
        moneda: "COP",
        posiciones: [
          { simbolo: "LOTE", nombre: "Lote", cantidad: "1", costo: "1000000", fecha: dia(-8) },
        ],
      });
      expect(r.status).toBe(201);
      const finca = r.body as InversionDetalleDto;
      const activoId = finca.posiciones[0]!.activoId;
      await fecharPrecios(finca, -8);

      const [aviso] = deTipo<AvisoPrecioDto>(await avisos(), "precio_manual");
      expect(aviso).toEqual({
        clave: `precio_manual:${activoId}:${dia(-8)}`,
        tipo: "precio_manual",
        instante: ochoDe(-1),
        leido: false,
        resuelto: false,
        activo: { id: activoId, simbolo: "LOTE", nombre: "Lote" },
        inversion: { id: finca.id, nombre: "Finca" },
        precioFecha: dia(-8),
        resolucion: null,
      });

      const precio = await api(app, u).post(
        `/inversiones/${finca.id}/activos/${activoId}/precios`,
        { precio: "1100000" },
      );
      expect(precio.status).toBe(201);
      const despues = deTipo<AvisoPrecioDto>(await avisos(), "precio_manual");
      expect(despues).toHaveLength(1);
      expect(despues[0]).toMatchObject({
        clave: aviso!.clave,
        resuelto: true,
        leido: true,
        resolucion: { fecha: H },
      });
    });

    it("un activo automático no da avisos de precio", async () => {
      const r = await api(app, u).post("/inversiones", {
        nombre: "eToro",
        moneda: "USD",
        posiciones: [{ simbolo: "VOO", cantidad: "1", costo: "50000", fecha: dia(-20) }],
      });
      expect(r.status).toBe(201);
      const etoro = r.body as InversionDetalleDto;
      await fecharPrecios(etoro, -20);
      const vooId = etoro.posiciones[0]!.activoId;
      const { data } = await admin
        .from("inversion_activos")
        .select("cotizacion")
        .eq("id", vooId)
        .single();
      expect(data).toEqual({ cotizacion: "automatica" });

      const precios = deTipo<AvisoPrecioDto>(await avisos(), "precio_manual");
      expect(precios.some((a) => a.activo.id === vooId)).toBe(false);
    });

    it("GET /avisos y /avisos/conteo no llaman a la fuente de precios ni a la de TRM", async () => {
      limpiarConteos();
      await avisos();
      await conteo();
      expect(fuentePrecios.buscar).not.toHaveBeenCalled();
      expect(fuentePrecios.actuales).not.toHaveBeenCalled();
      expect(fuentePrecios.historico).not.toHaveBeenCalled();
      expect(trmFalsa.obtenerEn).not.toHaveBeenCalled();
      expect(trmFalsa.obtenerRango).not.toHaveBeenCalled();
    });

    it("PATCH /avisos/config/recurrente { activo: false } quita sus avisos de la lista y del conteo", async () => {
      const antes = await conteo();
      const r = await api(app, u).patch("/avisos/config/recurrente", { activo: false });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        tipo: "recurrente",
        activo: false,
        dias: 3,
        opciones: [1, 3, 5, 7],
      });

      const lista = await avisos();
      expect(deTipo(lista, "recurrente")).toEqual([]);
      // El de Gas Vanti estaba marcado como no leído.
      expect(await conteo()).toBe(antes - 1);

      expect((await api(app, u).patch("/avisos/config/recurrente", { activo: true })).status).toBe(
        200,
      );
      expect(recurrentesDe(await avisos(), gas.id)).toHaveLength(1);
    });

    it("pausar o eliminar la plantilla quita sus avisos", async () => {
      const pausa = await api(app, u).patch(`/recurrentes/${gas.id}`, { pausada: true });
      expect(pausa.status).toBe(200);
      expect(recurrentesDe(await avisos(), gas.id)).toEqual([]);

      const agua = await plantilla(
        u,
        {
          tipo: "gasto",
          concepto: "Acueducto",
          monto: "40000",
          variable: false,
          periodicidad: "mensual",
          primerVencimiento: dia(2),
          cuentaOrigenId: nequi.id,
          categoriaId: servicios,
        },
        { creada: -5 },
      );
      expect(recurrentesDe(await avisos(), agua.id)).toHaveLength(1);
      expect((await api(app, u).delete(`/recurrentes/${agua.id}`)).status).toBe(204);
      expect(recurrentesDe(await avisos(), agua.id)).toEqual([]);
    });

    it("eliminar el préstamo quita sus avisos", async () => {
      expect(prestamoDe(await avisos(), camila.id)).toHaveLength(2);
      // Sin endpoint de borrado: sus movimientos y su cuenta, por el cliente de servicio.
      const { error: errorMovimientos } = await admin
        .from("movimientos")
        .delete()
        .or(`cuenta_origen_id.eq.${camila.id},cuenta_destino_id.eq.${camila.id}`);
      expect(errorMovimientos).toBeNull();
      const { error: errorCuenta } = await admin.from("cuentas").delete().eq("id", camila.id);
      expect(errorCuenta).toBeNull();

      expect(prestamoDe(await avisos(), camila.id)).toEqual([]);
    });

    it("PATCH con una clave válida que no es de un aviso → 404; mal formada → 400 ENTRADA_INVALIDA", async () => {
      esperarError(
        await api(app, u).patch(`/avisos/recurrente:${randomUUID()}:${H}`, { leido: true }),
        "AVISO_NO_ENCONTRADO",
      );
      esperarError(
        await api(app, u).patch("/avisos/recurrente:abc:2026-11-01", { leido: true }),
        "ENTRADA_INVALIDA",
      );
      esperarError(
        await api(app, u).patch(`/avisos/recurrente:${randomUUID()}:${H}`, { leido: "si" }),
        "ENTRADA_INVALIDA",
        "leido",
      );
    });

    it("un aviso con instante hace más de 60 días no sale en la lista", async () => {
      const banco = await crearCuenta(app, otro, {
        nombre: "Banco",
        tipo: "banco",
        saldoInicial: "100000",
      });
      const anual = (concepto: string) => ({
        tipo: "gasto",
        concepto,
        monto: "1000",
        variable: false,
        periodicidad: "anual",
        primerVencimiento: H,
        cuentaOrigenId: banco.id,
      });
      // Antelación 3: el de H − 58 dispara en H − 61; el de H − 57, en H − 60.
      const viejo = await plantilla(otro, anual("Viejo"), { vence: dia(-58), creada: -90 });
      const limite = await plantilla(otro, anual("Límite"), { vence: dia(-57), creada: -90 });

      const lista = await avisos(otro);
      expect(recurrentesDe(lista, viejo.id)).toEqual([]);
      const [visible] = recurrentesDe(lista, limite.id);
      expect(visible).toMatchObject({ vencimiento: dia(-57), instante: ochoDe(-60) });
      otroVisible = visible!;
    });

    it("una clave con el id de una fuente de otro usuario → 404 AVISO_NO_ENCONTRADO", async () => {
      esperarError(
        await api(app, u).patch(`/avisos/${otroVisible.clave}`, { leido: true }),
        "AVISO_NO_ENCONTRADO",
      );
      const { count } = await admin
        .from("avisos_leidos")
        .select("clave", { count: "exact", head: true })
        .eq("clave", otroVisible.clave);
      expect(count).toBe(0);
    });

    it("POST /avisos/leer-todos → 204; después, 0 no leídos", async () => {
      expect(await conteo()).toBeGreaterThan(0);
      const r = await api(app, u).post("/avisos/leer-todos");
      expect(r.status).toBe(204);
      const lista = await avisos();
      expect(lista.noLeidos).toBe(0);
      expect(lista.avisos.every((a) => a.leido)).toBe(true);
      expect(await conteo()).toBe(0);
      // Sin pendientes, no escribe y sigue en 204.
      expect((await api(app, u).post("/avisos/leer-todos")).status).toBe(204);
    });
  });
});
