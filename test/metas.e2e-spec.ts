/**
 * /metas de punta a punta (SPEC 13): los criterios de aceptación con usuarios
 * reales. Cubre también los cambios en /cuentas (CUENTA_CON_METAS) y
 * /movimientos (MOVIMIENTO_DE_META).
 *
 * La fuente de TRM se reemplaza por una falsa que vale 4.120,00 en todas las
 * fechas: las e2e no dependen de la red. Para reproducir los ejemplos del
 * diseño, la fecha de creación de algunas metas se lleva al pasado con la
 * clave de servicio, antes de registrar sus aportes.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba,
 * para fechar metas y para comprobar filas en la base. La API nunca lo usa
 * (REGLAS §4). Apunta solo a Tino dev, nunca a datos reales.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { restarDias, sumarDias, sumarMeses, ultimoDia } from "../src/domain/fecha/mes.js";
import type { Trm } from "../src/domain/trm/trm.js";
import type { InversionDetalleDto } from "../src/inversiones/dto.js";
import type {
  FilaAporteDto,
  FilaValorDto,
  MetaDetalleDto,
  MetaDto,
  MetasDto,
} from "../src/metas/dto.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";
import { FORMATO_CIFRADO, cifrador, contexto } from "./montos.js";
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
    "[metas] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

const ZONA = "America/Bogota";
const TRM = 412_000n;

const fuente = {
  obtenerEn: async (fecha: string): Promise<Trm | null> => ({
    valorCent: TRM,
    vigenteDesde: fecha,
    vigenteHasta: fecha,
  }),
  obtenerRango: async (desde: string, hasta: string): Promise<Trm[] | null> => [
    { valorCent: TRM, vigenteDesde: desde, vigenteHasta: hasta },
  ],
};

describe("/metas", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp([{ proveedor: TrmFuente, valor: fuente }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/metas"), "NO_AUTENTICADO");
  });

  // Cada prueba hace varias peticiones contra Supabase: el plazo por defecto (5 s) no alcanza.
  describe.skipIf(!conUsuarios)("con usuarios reales", { timeout: 60_000 }, () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let nubank: CuentaDto;
    let bancolombia: CuentaDto;
    let tarjeta: CuentaDto;
    let etoro: InversionDetalleDto;
    let fondo: MetaDetalleDto;
    let viaje: MetaDetalleDto;
    let moto: MetaDetalleDto;
    let cuota: MetaDetalleDto;

    const H = fechaLocal(new Date(), ZONA);
    const MES = H.slice(0, 7);

    const detalle = async (id: string): Promise<MetaDetalleDto> => {
      const r = await api(app, u).get(`/metas/${id}`);
      expect(r.status).toBe(200);
      return r.body as MetaDetalleDto;
    };
    const lista = async (): Promise<MetasDto> => {
      const r = await api(app, u).get("/metas");
      expect(r.status).toBe(200);
      return r.body as MetasDto;
    };
    const crear = async (cuerpo: object): Promise<MetaDetalleDto> => {
      const r = await api(app, u).post("/metas", cuerpo);
      expect(r.status).toBe(201);
      return r.body as MetaDetalleDto;
    };
    const aportar = async (id: string, cuerpo: object): Promise<MetaDetalleDto> => {
      const r = await api(app, u).post(`/metas/${id}/aportes`, cuerpo);
      expect(r.status).toBe(201);
      return r.body as MetaDetalleDto;
    };
    /** Lleva la creación de la meta a `fecha` (mediodía en Bogotá). */
    const fecharCreacion = async (id: string, fecha: string) => {
      const { error } = await admin
        .from("metas")
        .update({ creado_en: `${fecha}T17:00:00Z` })
        .eq("id", id);
      if (error) throw new Error(`No se pudo fechar la meta: ${error.message}`);
    };
    const filas = (d: MetaDetalleDto) => d.historial as FilaAporteDto[];

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Metas");
      admin = fabrica.admin;
      u = await fabrica.crear();
      nubank = await crearCuenta(app, u, {
        nombre: "Nubank",
        tipo: "banco",
        saldoInicial: "2500000",
      });
      bancolombia = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "10000000",
      });
      tarjeta = await crearCuenta(app, u, {
        nombre: "Visa",
        tipo: "tarjeta_credito",
        saldoInicial: "0",
        cupo: "1000000",
        tarjeta: { diaCorte: 15, diaPago: 30 },
      });
      const r = await api(app, u).post("/inversiones", {
        nombre: "eToro",
        moneda: "USD",
        efectivoInicial: "775000",
      });
      expect(r.status).toBe(201);
      etoro = r.body as InversionDetalleDto;
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    it("GET /metas sin metas: grupos vacíos, totales en 0 y la TRM de hoy", async () => {
      expect(await lista()).toMatchObject({
        fechaHoy: H,
        trm: { valor: "4120.00" },
        totales: { avance: "0", objetivo: "0", incompleto: false },
        activas: [],
        cumplidas: [],
      });
    });

    it("por apartado sobre una tarjeta o una inversión → 422 CUENTA_NO_ADMITIDA", async () => {
      for (const cuentaId of [tarjeta.id, etoro.id]) {
        esperarError(
          await api(app, u).post("/metas", {
            nombre: "X",
            cuentaId,
            modo: "apartado",
            objetivo: "1000",
          }),
          "CUENTA_NO_ADMITIDA",
          "cuentaId",
        );
      }
    });

    it("fechaMeta de ayer → 422 FECHA_META_PASADA; nombre vacío → 400 NOMBRE_INVALIDO", async () => {
      const base = { nombre: "X", cuentaId: nubank.id, modo: "apartado", objetivo: "1000" };
      esperarError(
        await api(app, u).post("/metas", { ...base, fechaMeta: restarDias(H, 1) }),
        "FECHA_META_PASADA",
        "fechaMeta",
      );
      esperarError(
        await api(app, u).post("/metas", { ...base, nombre: "  " }),
        "NOMBRE_INVALIDO",
        "nombre",
      );
      esperarError(
        await api(app, u).post("/metas", { ...base, objetivo: "0" }),
        "MONTO_INVALIDO",
        "objetivo",
      );
      esperarError(
        await api(app, u).post("/metas", { ...base, modo: "todo" }),
        "MODO_INVALIDO",
        "modo",
      );
    });

    it("fondo de emergencia del diseño: porcentaje 2533, 316.667 al mes, llegada en 18 meses", async () => {
      fondo = await crear({
        nombre: "Fondo de emergencia",
        cuentaId: nubank.id,
        modo: "apartado",
        objetivo: "7500000",
      });
      const creada = `${sumarMeses(MES, -5)}-15`;
      await fecharCreacion(fondo.id, creada);
      for (const [meses, monto] of [
        [-5, "400000"],
        [-4, "350000"],
        [-3, "300000"],
        [-2, "350000"],
        [-1, "250000"],
      ] as const) {
        await aportar(fondo.id, {
          tipo: "aporte",
          monto,
          fecha: `${sumarMeses(MES, meses)}-15`,
        });
      }
      await aportar(fondo.id, {
        tipo: "retiro",
        monto: "100000",
        fecha: ultimoDia(sumarMeses(MES, -1)),
        motivo: "arreglo de la nevera",
      });
      fondo = await aportar(fondo.id, { tipo: "aporte", monto: "350000", fecha: H });

      expect(fondo).toMatchObject({
        modo: "apartado",
        cuenta: { id: nubank.id, nombre: "Nubank", tipo: "banco", moneda: "COP" },
        objetivo: "7500000",
        avance: "1900000",
        falta: "5600000",
        porcentaje: 2533,
        fechaMeta: null,
        cumplidaEl: null,
        creadaEl: creada,
        ritmo: {
          tipo: "promedio",
          promedioMensual: "316667",
          mesEstimado: sumarMeses(MES, 18),
        },
      });
      expect(filas(fondo).map((f) => [f.tipo, f.monto, f.acumulado])).toEqual([
        ["aporte", "350000", "1900000"],
        ["retiro", "100000", "1550000"],
        ["aporte", "250000", "1650000"],
        ["aporte", "350000", "1400000"],
        ["aporte", "300000", "1050000"],
        ["aporte", "350000", "750000"],
        ["aporte", "400000", "400000"],
      ]);
      expect(filas(fondo)[1]!.motivo).toBe("arreglo de la nevera");
    });

    it("el viaje: dos metas por apartado conviven; ritmo de 34 días; nota de apartados", async () => {
      viaje = await crear({
        nombre: "Viaje a Cartagena",
        cuentaId: nubank.id,
        modo: "apartado",
        objetivo: "1800000",
        fechaMeta: sumarDias(H, 34),
        aporteInicial: { monto: "600000" },
      });
      expect(viaje.ritmo).toEqual({ tipo: "dias", falta: "1200000", dias: 34, vencida: false });
      expect(filas(viaje)).toMatchObject([{ inicial: true, monto: "600000", fecha: H }]);

      const deFondo = await detalle(fondo.id);
      expect(deFondo.apartados).toEqual({
        saldoCuenta: "2500000",
        apartadoAqui: "1900000",
        otras: [{ metaId: viaje.id, nombre: "Viaje a Cartagena", apartado: "600000" }],
        libre: "0",
        excedido: false,
      });

      const metas = await lista();
      expect(metas.activas.map((m) => m.id)).toEqual([viaje.id, fondo.id]);
      expect(metas.totales).toEqual({ avance: "2500000", objetivo: "9300000", incompleto: false });
    });

    it("un aporte sin origen mayor que el saldo libre → 422 SALDO_LIBRE_INSUFICIENTE", async () => {
      esperarError(
        await api(app, u).post(`/metas/${viaje.id}/aportes`, {
          tipo: "aporte",
          monto: "1",
          fecha: H,
        }),
        "SALDO_LIBRE_INSUFICIENTE",
        "monto",
      );
    });

    it("un aporte con origen crea la transferencia; editarla en /movimientos cambia el aporte", async () => {
      const d = await aportar(viaje.id, {
        tipo: "aporte",
        monto: "150000",
        fecha: H,
        cuentaOrigenId: bancolombia.id,
      });
      const fila = filas(d).find((f) => f.movimientoId !== null)!;
      expect(fila).toMatchObject({
        monto: "150000",
        cuentaOrigen: { id: bancolombia.id, nombre: "Bancolombia" },
        acumulado: "750000",
      });
      expect(d.avance).toBe("750000");

      const movimientos = await api(app, u).get(`/movimientos?mes=${MES}`);
      const transferencia = (movimientos.body.movimientos as { id: string }[]).find(
        (m) => m.id === fila.movimientoId,
      );
      expect(transferencia).toMatchObject({
        tipo: "transferencia",
        monto: "150000",
        categoria: null,
        descripcion: "Aporte a Viaje a Cartagena",
        cuentaOrigen: { id: bancolombia.id },
        cuentaDestino: { id: nubank.id },
      });

      const cuerpo = {
        tipo: "transferencia",
        monto: "200000",
        fecha: H,
        descripcion: "Aporte a Viaje a Cartagena",
        cuentaOrigenId: bancolombia.id,
        cuentaDestinoId: nubank.id,
      };
      const r = await api(app, u).put(`/movimientos/${fila.movimientoId}`, cuerpo);
      expect(r.status).toBe(200);
      expect(filas(await detalle(viaje.id)).find((f) => f.id === fila.id)?.monto).toBe("200000");

      esperarError(
        await api(app, u).put(`/movimientos/${fila.movimientoId}`, {
          ...cuerpo,
          tipo: "gasto",
          cuentaDestinoId: null,
        }),
        "MOVIMIENTO_DE_META",
        "tipo",
      );

      // Borrar el aporte con origen borra también su transferencia.
      const borrado = await api(app, u).delete(`/metas/${viaje.id}/aportes/${fila.id}`);
      expect(borrado.status).toBe(204);
      const { data } = await admin.from("movimientos").select("id").eq("id", fila.movimientoId!);
      expect(data).toEqual([]);
      expect((await detalle(viaje.id)).avance).toBe("600000");
    });

    it("retiros: mayor que lo apartado → 422; borrar el aporte que lo pagó, también", async () => {
      esperarError(
        await api(app, u).post(`/metas/${viaje.id}/aportes`, {
          tipo: "retiro",
          monto: "600001",
          fecha: H,
        }),
        "APARTADO_INSUFICIENTE",
        "monto",
      );
      const d = await aportar(viaje.id, { tipo: "retiro", monto: "600000", fecha: H });
      const inicial = filas(d).find((f) => f.inicial)!;
      const retiro = filas(d).find((f) => f.tipo === "retiro")!;
      esperarError(
        await api(app, u).delete(`/metas/${viaje.id}/aportes/${inicial.id}`),
        "APARTADO_INSUFICIENTE",
        "monto",
      );
      esperarError(
        await api(app, u).post(`/metas/${viaje.id}/aportes`, {
          tipo: "retiro",
          monto: "1",
          fecha: H,
          cuentaOrigenId: bancolombia.id,
        }),
        "ORIGEN_NO_ADMITIDO",
        "cuentaOrigenId",
      );
      expect((await api(app, u).delete(`/metas/${viaje.id}/aportes/${retiro.id}`)).status).toBe(
        204,
      );
    });

    it("un gasto que deja la cuenta por debajo de lo apartado se registra y la marca excedida", async () => {
      const gasto = await api(app, u).post("/movimientos", {
        tipo: "gasto",
        monto: "1000000",
        cuentaOrigenId: nubank.id,
      });
      expect(gasto.status).toBe(201);
      expect((await detalle(fondo.id)).apartados).toMatchObject({
        saldoCuenta: "1500000",
        libre: "-1000000",
        excedido: true,
      });
      expect((await api(app, u).delete(`/movimientos/${gasto.body.id}`)).status).toBe(204);
    });

    it("una meta que llega al objetivo pasa a cumplidas; un retiro posterior deja el uso", async () => {
      moto = await crear({
        nombre: "Arreglo de la moto",
        cuentaId: bancolombia.id,
        modo: "apartado",
        objetivo: "850000",
      });
      await fecharCreacion(moto.id, restarDias(H, 10));
      await aportar(moto.id, { tipo: "aporte", monto: "250000", fecha: restarDias(H, 5) });
      moto = await aportar(moto.id, { tipo: "aporte", monto: "600000", fecha: restarDias(H, 3) });
      expect(moto).toMatchObject({
        cumplidaEl: restarDias(H, 3),
        avance: "850000",
        porcentaje: 10000,
        ritmo: null,
        uso: null,
      });

      esperarError(
        await api(app, u).post(`/metas/${moto.id}/aportes`, {
          tipo: "aporte",
          monto: "1",
          fecha: H,
        }),
        "META_CUMPLIDA",
      );
      esperarError(await api(app, u).post(`/metas/${moto.id}/archivar`), "APARTADO_NO_CERO");
      esperarError(
        await api(app, u).patch(`/metas/${moto.id}`, { nombre: "Moto" }),
        "META_CUMPLIDA",
      );

      moto = await aportar(moto.id, {
        tipo: "retiro",
        monto: "850000",
        fecha: restarDias(H, 1),
        motivo: "en el taller",
      });
      expect(moto).toMatchObject({
        cumplidaEl: restarDias(H, 3),
        avance: "850000",
        uso: { fecha: restarDias(H, 1), motivo: "en el taller" },
      });
      const metas = await lista();
      expect(metas.cumplidas.map((m) => m.id)).toEqual([moto.id]);
      expect(metas.activas.map((m) => m.id)).not.toContain(moto.id);
    });

    it("archivar: solo una cumplida con apartado 0; restaurar la devuelve", async () => {
      esperarError(await api(app, u).post(`/metas/${viaje.id}/archivar`), "META_NO_CUMPLIDA");
      esperarError(await api(app, u).post(`/metas/${moto.id}/restaurar`), "META_NO_ARCHIVADA");

      const r = await api(app, u).post(`/metas/${moto.id}/archivar`);
      expect(r.status).toBe(200);
      expect((r.body as MetaDto).archivadaEn).not.toBeNull();
      const metas = await lista();
      expect([...metas.activas, ...metas.cumplidas].map((m) => m.id)).not.toContain(moto.id);
      const archivadas = await api(app, u).get("/metas/archivadas");
      expect((archivadas.body as MetaDto[]).map((m) => m.id)).toEqual([moto.id]);
      expect((await detalle(moto.id)).archivadaEn).not.toBeNull();
      esperarError(
        await api(app, u).post(`/metas/${moto.id}/aportes`, {
          tipo: "retiro",
          monto: "1",
          fecha: H,
        }),
        "META_ARCHIVADA",
      );

      const restaurada = await api(app, u).post(`/metas/${moto.id}/restaurar`);
      expect(restaurada.status).toBe(200);
      expect((await lista()).cumplidas.map((m) => m.id)).toContain(moto.id);
    });

    it("toda la cuenta sobre una inversión USD: 201, avance en COP a la TRM de hoy", async () => {
      cuota = await crear({
        nombre: "Cuota inicial apartamento",
        cuentaId: etoro.id,
        modo: "cuenta",
        objetivo: "45000000",
        fechaMeta: sumarMeses(MES, 13),
      });
      expect(cuota).toMatchObject({
        modo: "cuenta",
        cuenta: { id: etoro.id, tipo: "inversion", moneda: "USD" },
        avance: "31930000",
        falta: "13070000",
        fechaMeta: sumarMeses(MES, 13),
        ritmo: { tipo: "meses", falta: "13070000", meses: 13, cuotaMensual: "1005385" },
        apartados: null,
        inversion: { valorMercado: "775000", moneda: "USD", trm: { valor: "4120.00" } },
      });
      const historial = cuota.historial as FilaValorDto[];
      expect(historial).toEqual([
        { tipo: "hoy", fecha: H, valor: "31930000", variacion: null, trm: expect.any(Object) },
      ]);

      // Un mes se guarda como su último día.
      const { data } = await admin
        .from("metas")
        .select("fecha_meta, fecha_meta_es_mes")
        .eq("id", cuota.id)
        .single();
      expect(data).toEqual({
        fecha_meta: ultimoDia(sumarMeses(MES, 13)),
        fecha_meta_es_mes: true,
      });

      esperarError(
        await api(app, u).post(`/metas/${cuota.id}/aportes`, {
          tipo: "retiro",
          monto: "1",
          fecha: H,
        }),
        "RETIRO_NO_ADMITIDO",
        "tipo",
      );
      esperarError(
        await api(app, u).post(`/metas/${cuota.id}/aportes`, {
          tipo: "aporte",
          monto: "1",
          fecha: H,
          cuentaOrigenId: bancolombia.id,
        }),
        "META_DE_INVERSION",
      );
    });

    it("otra meta sobre una cuenta con meta de toda la cuenta → 409, en cualquier modo", async () => {
      esperarError(
        await api(app, u).post("/metas", {
          nombre: "Otra",
          cuentaId: etoro.id,
          modo: "cuenta",
          objetivo: "1000",
        }),
        "CUENTA_CON_META_EXCLUSIVA",
        "cuentaId",
      );
      // Nubank tiene metas por apartado: tampoco admite una de toda la cuenta.
      esperarError(
        await api(app, u).post("/metas", {
          nombre: "Otra",
          cuentaId: nubank.id,
          modo: "cuenta",
          objetivo: "1000",
        }),
        "CUENTA_CON_META_EXCLUSIVA",
        "cuentaId",
      );
      const davivienda = await crearCuenta(app, u, {
        nombre: "Davivienda",
        tipo: "banco",
        saldoInicial: "0",
      });
      await crear({ nombre: "Casa", cuentaId: davivienda.id, modo: "cuenta", objetivo: "1000" });
      esperarError(
        await api(app, u).post("/metas", {
          nombre: "Otra",
          cuentaId: davivienda.id,
          modo: "apartado",
          objetivo: "1000",
        }),
        "CUENTA_CON_META_EXCLUSIVA",
        "cuentaId",
      );
    });

    it("una meta sobre inversión que llega queda cumplida guardada y sigue cumplida si el valor baja", async () => {
      // Con objetivo 30.000.000 y 31.930.000 de avance, la lectura la cumple.
      const { error } = await admin
        .from("metas")
        .update({
          objetivo: cifrador().cifrar(30_000_000n, contexto.meta(u.id, cuota.id, "objetivo")),
        })
        .eq("id", cuota.id);
      expect(error).toBeNull();
      const cumplida = await detalle(cuota.id);
      expect(cumplida).toMatchObject({ cumplidaEl: H, avance: "31930000", ritmo: null });
      const { data } = await admin
        .from("metas")
        .select("cumplida_en, avance_cumplida")
        .eq("id", cuota.id)
        .single();
      expect(data!.cumplida_en).toBe(H);
      expect(data!.avance_cumplida).toMatch(FORMATO_CIFRADO);

      // Sale dinero de la inversión: el valor baja, la meta sigue cumplida con su avance.
      const salida = await api(app, u).post("/movimientos", {
        tipo: "transferencia",
        monto: "200000",
        montoDestino: "8240000",
        cuentaOrigenId: etoro.id,
        cuentaDestinoId: bancolombia.id,
      });
      expect(salida.status).toBe(201);
      const despues = await detalle(cuota.id);
      expect(despues).toMatchObject({ cumplidaEl: H, avance: "31930000" });
      expect(despues.inversion?.valorMercado).toBe("575000");
    });

    it("toda la cuenta en un banco: aporte con origen, cierres mensuales y su variación", async () => {
      const ahorro = await crearCuenta(app, u, {
        nombre: "Ahorro",
        tipo: "banco",
        saldoInicial: "1000000",
      });
      const casa = await crear({
        nombre: "Casa propia",
        cuentaId: ahorro.id,
        modo: "cuenta",
        objetivo: "5000000",
      });
      const creada = `${sumarMeses(MES, -2)}-10`;
      await fecharCreacion(casa.id, creada);
      esperarError(
        await api(app, u).post(`/metas/${casa.id}/aportes`, {
          tipo: "aporte",
          monto: "1",
          fecha: H,
        }),
        "ORIGEN_REQUERIDO",
        "cuentaOrigenId",
      );
      const d = await aportar(casa.id, {
        tipo: "aporte",
        monto: "500000",
        fecha: H,
        cuentaOrigenId: bancolombia.id,
      });
      expect(d.avance).toBe("1500000");
      expect(d.historial as FilaValorDto[]).toEqual([
        { tipo: "cierre", fecha: creada, valor: "1000000", variacion: null, trm: null },
        {
          tipo: "cierre",
          fecha: ultimoDia(sumarMeses(MES, -2)),
          valor: "1000000",
          variacion: "0",
          trm: null,
        },
        {
          tipo: "cierre",
          fecha: ultimoDia(sumarMeses(MES, -1)),
          valor: "1000000",
          variacion: "0",
          trm: null,
        },
        { tipo: "hoy", fecha: H, valor: "1500000", variacion: "500000", trm: null },
      ]);
    });

    it("cambiar el modo de una meta con aportes → 409 META_CON_APORTES", async () => {
      esperarError(
        await api(app, u).patch(`/metas/${fondo.id}`, { modo: "cuenta" }),
        "META_CON_APORTES",
        "modo",
      );
    });

    it("cambiar la cuenta de una meta por apartado mueve su apartado y valida el saldo libre", async () => {
      const efectivo = await crearCuenta(app, u, {
        nombre: "Billetera",
        tipo: "efectivo",
        saldoInicial: "100000",
      });
      esperarError(
        await api(app, u).patch(`/metas/${viaje.id}`, { cuentaId: efectivo.id }),
        "SALDO_LIBRE_INSUFICIENTE",
        "monto",
      );
      const nequi = await crearCuenta(app, u, {
        nombre: "Nequi",
        tipo: "banco",
        saldoInicial: "1000000",
      });
      const r = await api(app, u).patch(`/metas/${viaje.id}`, { cuentaId: nequi.id });
      expect(r.status).toBe(200);
      expect((r.body as MetaDetalleDto).apartados).toMatchObject({
        saldoCuenta: "1000000",
        apartadoAqui: "600000",
        otras: [],
        libre: "400000",
      });
      expect((await detalle(fondo.id)).apartados).toMatchObject({ otras: [], libre: "600000" });
    });

    it("editar el objetivo y borrar un aporte dejan filas en metas_cambios", async () => {
      const r = await api(app, u).patch(`/metas/${fondo.id}`, {
        objetivo: "8000000",
        fechaMeta: sumarMeses(MES, 6),
      });
      expect(r.status).toBe(200);
      expect((r.body as MetaDetalleDto).fechaMeta).toBe(sumarMeses(MES, 6));
      const ultimo = filas(r.body as MetaDetalleDto)[0]!;
      expect((await api(app, u).delete(`/metas/${fondo.id}/aportes/${ultimo.id}`)).status).toBe(
        204,
      );

      const { data } = await admin
        .from("metas_cambios")
        .select("entidad, entidad_id, campo, valor_anterior, valor_nuevo")
        .eq("meta_id", fondo.id);
      const campos = (data ?? []).map((c) => c.campo);
      expect(campos).toEqual(expect.arrayContaining(["objetivo", "fecha_meta", "eliminado"]));
      const objetivo = data!.find((c) => c.campo === "objetivo")!;
      expect(objetivo.valor_anterior).toMatch(FORMATO_CIFRADO);
      expect(objetivo.valor_nuevo).toMatch(FORMATO_CIFRADO);
      expect(data!.find((c) => c.campo === "eliminado")).toMatchObject({
        entidad: "aporte",
        entidad_id: ultimo.id,
      });
    });

    it("los montos solo se guardan cifrados", async () => {
      const { data: metas } = await admin.from("metas").select("objetivo").eq("usuario_id", u.id);
      expect(metas!.length).toBeGreaterThan(0);
      for (const m of metas!) expect(m.objetivo).toMatch(FORMATO_CIFRADO);
      const { data: aportes } = await admin
        .from("metas_movimientos")
        .select("monto, movimiento_id")
        .eq("usuario_id", u.id);
      for (const a of aportes!) {
        if (a.movimiento_id === null) expect(a.monto).toMatch(FORMATO_CIFRADO);
        else expect(a.monto).toBeNull();
      }
    });

    it("archivar o eliminar una cuenta con metas sin archivar → 409 CUENTA_CON_METAS", async () => {
      esperarError(await api(app, u).post(`/cuentas/${nubank.id}/archivar`), "CUENTA_CON_METAS");
      esperarError(await api(app, u).delete(`/cuentas/${nubank.id}`), "CUENTA_CON_METAS");
    });

    it("DELETE /metas/:id libera lo apartado y conserva las transferencias de sus aportes", async () => {
      const d = await aportar(viaje.id, {
        tipo: "aporte",
        monto: "100000",
        fecha: H,
        cuentaOrigenId: bancolombia.id,
      });
      const movimientoId = filas(d).find((f) => f.movimientoId !== null)!.movimientoId!;
      expect((await api(app, u).delete(`/metas/${viaje.id}`)).status).toBe(204);
      esperarError(await api(app, u).get(`/metas/${viaje.id}`), "META_NO_ENCONTRADA");
      const { data } = await admin.from("movimientos").select("id").eq("id", movimientoId);
      expect(data).toEqual([{ id: movimientoId }]);
      const { data: aportes } = await admin
        .from("metas_movimientos")
        .select("id")
        .eq("meta_id", viaje.id);
      expect(aportes).toEqual([]);
    });

    it("la meta de otro usuario no existe", async () => {
      const otro = await fabrica.crear();
      esperarError(await api(app, otro).get(`/metas/${fondo.id}`), "META_NO_ENCONTRADA");
      esperarError(await api(app, otro).delete(`/metas/${fondo.id}`), "META_NO_ENCONTRADA");
    });
  });
});
