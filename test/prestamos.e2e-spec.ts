/**
 * /prestamos de punta a punta (SPEC 08): alta, desembolsos, propuesta y abonos,
 * condonación, cambios, efecto en cuentas y resumen, guardas en movimientos y
 * recurrentes, e id ajeno.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para comprobaciones directas en la base. La API nunca lo usa (REGLAS §4).
 * Apunta solo a Tino dev, nunca a datos reales.
 *
 * Las pruebas comparten estado y corren en orden: cada una parte de la anterior.
 */
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CuentaDto, ListaCuentasDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { sumarDias } from "../src/domain/fecha/mes.js";
import type { ListaMovimientosDto, MovimientoDto } from "../src/movimientos/dto.js";
import type { PrestamoDetalleDto, PrestamosDto, PropuestaAbonoDto } from "../src/prestamos/dto.js";
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
    "[prestamos] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

/** Zona por defecto del perfil (SPEC 02): la de los usuarios de prueba. */
const ZONA = "America/Bogota";

describe("/prestamos", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/prestamos"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let otro: UsuarioPrueba;
    let nequi: CuentaDto;
    let bancolombia: CuentaDto;
    let otrosGastos: string;
    let camila: PrestamoDetalleDto;
    let mama: PrestamoDetalleDto;
    let patrimonioInicial: bigint;

    const H = fechaLocal(new Date(), ZONA);
    const dia = (n: number) => sumarDias(H, n);

    const cuentas = async (): Promise<ListaCuentasDto> => {
      const r = await api(app, u).get("/cuentas");
      expect(r.status).toBe(200);
      return r.body as ListaCuentasDto;
    };
    const saldo = async (id: string): Promise<string | undefined> => {
      const lista = await cuentas();
      return [...lista.activos.cuentas, ...lista.pasivos.cuentas].find((c) => c.id === id)?.saldo;
    };
    const detalle = async (id: string): Promise<PrestamoDetalleDto> => {
      const r = await api(app, u).get(`/prestamos/${id}`);
      expect(r.status).toBe(200);
      return r.body as PrestamoDetalleDto;
    };
    const lista = async (): Promise<PrestamosDto> => {
      const r = await api(app, u).get("/prestamos");
      expect(r.status).toBe(200);
      return r.body as PrestamosDto;
    };
    const abonar = (id: string, cuerpo: object) =>
      api(app, u).post(`/prestamos/${id}/abonos`, cuerpo);
    const condonar = (id: string, monto: string) =>
      api(app, u).post(`/prestamos/${id}/condonaciones`, { monto, categoriaId: otrosGastos });
    const filaDe = (d: PrestamoDetalleDto, clase: string) =>
      d.historial.find((f) => f.clase === clase);

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Prestamos");
      admin = fabrica.admin;
      u = await fabrica.crear();
      otro = await fabrica.crear();
      nequi = await crearCuenta(app, u, {
        nombre: "Nequi",
        tipo: "banco",
        saldoInicial: "1000000",
      });
      bancolombia = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "2000000",
      });
      const { data } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", "Otros gastos")
        .single();
      otrosGastos = data!.id as string;
      patrimonioInicial = BigInt((await cuentas()).patrimonioNeto);
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    it("un perfil nuevo tiene «Intereses» de gasto y de ingreso; los existentes también", async () => {
      const { data: propias } = await u.cliente
        .from("categorias")
        .select("tipo")
        .eq("nombre", "Intereses");
      expect(propias!.map((k) => k.tipo).toSorted((x, y) => x.localeCompare(y))).toEqual([
        "gasto",
        "ingreso",
      ]);

      const { data: perfiles } = await admin.from("perfiles").select("id");
      const { data: intereses } = await admin
        .from("categorias")
        .select("usuario_id, tipo")
        .eq("nombre", "Intereses");
      for (const p of perfiles!) {
        const tipos = intereses!.filter((k) => k.usuario_id === p.id).map((k) => k.tipo);
        expect(tipos.toSorted((x, y) => x.localeCompare(y))).toEqual(["gasto", "ingreso"]);
      }
    });

    it("GET /prestamos sin préstamos → totales en cero y lista vacía", async () => {
      expect(await lista()).toEqual({
        fechaHoy: H,
        teDeben: { total: "0", personas: 0, interesesCausados: "0" },
        debes: { total: "0", personas: 0, interesesCausados: "0", conIntereses: false },
        posicionNeta: "0",
        prestamos: [],
      });
    });

    it("POST /prestamos: otorgado a Camila desde Nequi, vencido", async () => {
      const r = await api(app, u).post("/prestamos", {
        tipo: "prestamo_otorgado",
        nombre: "Camila",
        monto: "600000",
        cuentaId: nequi.id,
        fecha: dia(-60),
        tasaMensual: "1",
        fechaAcordada: dia(-27),
      });
      expect(r.status).toBe(201);
      camila = r.body as PrestamoDetalleDto;
      expect(camila).toMatchObject({
        nombre: "Camila",
        tipo: "prestamo_otorgado",
        estado: "te_debe",
        capitalPendiente: "600000",
        desde: dia(-60),
        fechaAcordada: dia(-27),
        vencido: true,
        cierre: null,
        tasaMensual: "1",
        totalPrestado: "600000",
        fechaHoy: H,
      });
      expect(camila.historial).toEqual([
        expect.objectContaining({
          clase: "desembolso",
          fecha: dia(-60),
          cuenta: { id: nequi.id, nombre: "Nequi" },
          capital: "600000",
          saldoCapital: "600000",
        }),
      ]);

      const c = await cuentas();
      expect(c.activos.cuentas.find((x) => x.id === nequi.id)?.saldo).toBe("400000");
      expect(c.activos.cuentas.some((x) => x.id === camila.id)).toBe(false);
      expect(c.prestamos).toEqual({ teDeben: "600000", debes: "0" });
      expect(BigInt(c.patrimonioNeto)).toBe(patrimonioInicial);
    });

    it("repetir con «camila» y el mismo tipo → 409 PRESTAMO_EXISTENTE; como contraída → 201", async () => {
      esperarError(
        await api(app, u).post("/prestamos", {
          tipo: "prestamo_otorgado",
          nombre: " camila ",
          monto: "1000",
          cuentaId: nequi.id,
        }),
        "PRESTAMO_EXISTENTE",
        "nombre",
      );

      const r = await api(app, u).post("/prestamos", {
        tipo: "deuda_contraida",
        nombre: "camila",
        monto: "100000",
        cuentaId: nequi.id,
      });
      expect(r.status).toBe(201);
      const contraida = r.body as PrestamoDetalleDto;
      expect(contraida).toMatchObject({ estado: "le_debes", desde: H, tasaMensual: "0" });

      // Se salda de una vez para no alterar los totales de las pruebas siguientes.
      const pago = await abonar(contraida.id, {
        cuentaId: nequi.id,
        fecha: H,
        capital: "100000",
        interes: "0",
      });
      expect(pago.status).toBe(201);
      expect(pago.body).toMatchObject({ estado: "saldado", cierre: { fecha: H, forma: "pago" } });
      expect(await saldo(nequi.id)).toBe("400000");

      // Condonar una contraída no está permitido.
      esperarError(await condonar(contraida.id, "1"), "CONDONACION_NO_PERMITIDA");
    });

    it("propuesta de abono a H−40 con 112.000 → 4.000 de interés y 108.000 a capital", async () => {
      const r = await api(app, u).get(
        `/prestamos/${camila.id}/propuesta-abono?fecha=${dia(-40)}&monto=112000`,
      );
      expect(r.status).toBe(200);
      expect(r.body as PropuestaAbonoDto).toEqual({
        fecha: dia(-40),
        monto: "112000",
        interes: "4000",
        capital: "108000",
        interesesCausados: "4000",
        capitalPendiente: "600000",
      });
    });

    it("propuesta con fecha o monto inválidos → 400", async () => {
      esperarError(
        await api(app, u).get(`/prestamos/${camila.id}/propuesta-abono?fecha=2026-02-30&monto=1`),
        "FECHA_INVALIDA",
        "fecha",
      );
      esperarError(
        await api(app, u).get(`/prestamos/${camila.id}/propuesta-abono?fecha=${H}&monto=1.5`),
        "MONTO_INVALIDO",
        "monto",
      );
    });

    it("POST abonos: transferencia + ingreso con «Intereses»; detalle e historial", async () => {
      const r = await abonar(camila.id, {
        cuentaId: nequi.id,
        fecha: dia(-40),
        capital: "100000",
        interes: "12000",
      });
      expect(r.status).toBe(201);
      camila = r.body as PrestamoDetalleDto;
      expect(camila).toMatchObject({
        capitalPendiente: "500000",
        interesesCobrados: "12000",
        interesesCausados: "6667",
        totalAbonado: "100000",
        ultimoAbono: dia(-40),
      });
      expect(camila.historial.map((f) => [f.clase, f.capital, f.interes, f.saldoCapital])).toEqual([
        ["desembolso", "600000", "0", "600000"],
        ["abono", "-100000", "12000", "500000"],
      ]);

      const mes = dia(-40).slice(0, 7);
      const movs = await api(app, u).get(`/movimientos?mes=${mes}`);
      const delDia = (movs.body as ListaMovimientosDto).movimientos.filter(
        (m) => m.fecha === dia(-40),
      );
      expect(delDia).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tipo: "transferencia",
            descripcion: "Abono de Camila",
            monto: "100000",
            categoria: null,
          }),
          expect.objectContaining({
            tipo: "ingreso",
            descripcion: "Intereses de Camila",
            monto: "12000",
            categoria: expect.objectContaining({ nombre: "Intereses" }),
          }),
        ]),
      );
      expect(await saldo(nequi.id)).toBe("512000");
    });

    it("GET /resumen del mes de H−40 cuenta el interés como ingreso, no el desembolso ni el abono", async () => {
      const r = await api(app, u).get(`/resumen?mes=${dia(-40).slice(0, 7)}`);
      expect(r.status).toBe(200);
      const resumen = r.body as ResumenDto;
      expect(resumen.ingresos.actual).toBe("12000");
      expect(resumen.gastos.actual).toBe("0");
    });

    it("abonos inválidos: excede, vacío, fecha anterior y cuenta archivada", async () => {
      const base = { cuentaId: nequi.id, fecha: H, capital: "100000", interes: "0" };
      esperarError(
        await abonar(camila.id, { ...base, capital: "600000" }),
        "ABONO_EXCEDE_CAPITAL",
        "capital",
      );
      esperarError(await abonar(camila.id, { ...base, capital: "0" }), "ABONO_VACIO", "capital");
      esperarError(
        await abonar(camila.id, { ...base, fecha: dia(-61) }),
        "FECHA_ANTERIOR_AL_PRESTAMO",
        "fecha",
      );

      const archivada = await crearCuenta(app, u, {
        nombre: "Ahorro",
        tipo: "banco",
        saldoInicial: "0",
      });
      expect((await api(app, u).post(`/cuentas/${archivada.id}/archivar`)).status).toBe(200);
      esperarError(
        await abonar(camila.id, { ...base, cuentaId: archivada.id, interes: "1000" }),
        "CUENTA_ARCHIVADA",
        "cuentaId",
      );
      const { data } = await admin
        .from("movimientos")
        .select("id")
        .or(`cuenta_origen_id.eq.${archivada.id},cuenta_destino_id.eq.${archivada.id}`);
      expect(data).toEqual([]);
      expect((await detalle(camila.id)).historial).toHaveLength(2);
    });

    let condonacion: MovimientoDto;

    it("condonar 200.000: gasto de hoy, capital 300.000, patrimonio baja 200.000", async () => {
      const antes = BigInt((await cuentas()).patrimonioNeto);
      const r = await condonar(camila.id, "200000");
      expect(r.status).toBe(201);
      condonacion = r.body as MovimientoDto;
      expect(condonacion).toMatchObject({
        tipo: "gasto",
        fecha: H,
        monto: "200000",
        descripcion: "Condonación a Camila",
        cuentaOrigen: { id: camila.id, nombre: "Camila" },
        categoria: { id: otrosGastos, nombre: "Otros gastos" },
      });
      const d = await detalle(camila.id);
      expect(d).toMatchObject({
        capitalPendiente: "300000",
        totalCondonado: "200000",
        totalAbonado: "300000",
      });
      expect(filaDe(d, "condonacion")).toMatchObject({ cuenta: null, capital: "-200000" });
      expect(BigInt((await cuentas()).patrimonioNeto)).toBe(antes - 200000n);
    });

    it("condonar más de lo pendiente → 422 CONDONACION_EXCEDE_CAPITAL", async () => {
      esperarError(await condonar(camila.id, "300001"), "CONDONACION_EXCEDE_CAPITAL", "monto");
    });

    it("DELETE de la condonación devuelve el capital y deja historial", async () => {
      expect((await api(app, u).delete(`/movimientos/${condonacion.id}`)).status).toBe(204);
      expect((await detalle(camila.id)).capitalPendiente).toBe("500000");
      const { data } = await admin
        .from("movimientos_cambios")
        .select("operacion")
        .eq("movimiento_id", condonacion.id);
      expect(data).toEqual([{ operacion: "eliminacion" }]);
    });

    it("condonar todo: saldado por condonación, sin causados ni gasto por intereses", async () => {
      expect((await condonar(camila.id, "500000")).status).toBe(201);
      const d = await detalle(camila.id);
      expect(d).toMatchObject({
        estado: "saldado",
        capitalPendiente: "0",
        desde: null,
        vencido: false,
        cierre: { fecha: H, forma: "condonacion" },
        interesesCausados: "0",
      });
      const { data: gastos } = await admin
        .from("movimientos")
        .select("descripcion")
        .eq("usuario_id", u.id)
        .eq("tipo", "gasto");
      expect(gastos).toEqual([{ descripcion: "Condonación a Camila" }]);

      esperarError(
        await abonar(camila.id, { cuentaId: nequi.id, fecha: H, capital: "1", interes: "0" }),
        "PRESTAMO_SALDADO",
      );
      esperarError(await condonar(camila.id, "1"), "PRESTAMO_SALDADO");
    });

    it("un desembolso de 50.000 reabre el préstamo saldado", async () => {
      const r = await api(app, u).post(`/prestamos/${camila.id}/desembolsos`, {
        monto: "50000",
        cuentaId: nequi.id,
      });
      expect(r.status).toBe(201);
      camila = r.body as PrestamoDetalleDto;
      expect(camila).toMatchObject({
        estado: "te_debe",
        capitalPendiente: "50000",
        desde: H,
        cierre: null,
      });
      expect(camila.historial.at(-1)).toMatchObject({ clase: "desembolso", capital: "50000" });
    });

    it("un desembolso desde una cuenta de préstamo → 422 CUENTA_DE_PRESTAMO", async () => {
      esperarError(
        await api(app, u).post(`/prestamos/${camila.id}/desembolsos`, {
          monto: "1",
          cuentaId: camila.id,
        }),
        "CUENTA_DE_PRESTAMO",
        "cuentaId",
      );
    });

    it("contraída de Mamá hacia Bancolombia, sin tasa; abono de 200.000", async () => {
      const r = await api(app, u).post("/prestamos", {
        tipo: "deuda_contraida",
        nombre: "Mamá",
        monto: "900000",
        cuentaId: bancolombia.id,
      });
      expect(r.status).toBe(201);
      mama = r.body as PrestamoDetalleDto;
      expect(mama).toMatchObject({ estado: "le_debes", capitalPendiente: "900000" });
      expect(await saldo(bancolombia.id)).toBe("2900000");

      const l = await lista();
      expect(l.debes).toEqual({
        total: "900000",
        personas: 1,
        interesesCausados: "0",
        conIntereses: false,
      });
      expect(l.posicionNeta).toBe((BigInt(l.teDeben.total) - 900000n).toString());
      expect(l.prestamos.map((p) => [p.nombre, p.estado])).toEqual([
        ["Camila", "te_debe"],
        ["Mamá", "le_debes"],
        ["camila", "saldado"],
      ]);

      const abono = await abonar(mama.id, {
        cuentaId: bancolombia.id,
        fecha: H,
        capital: "200000",
        interes: "0",
      });
      expect(abono.status).toBe(201);
      expect(abono.body).toMatchObject({ capitalPendiente: "700000" });
      expect(filaDe(abono.body as PrestamoDetalleDto, "abono")).toMatchObject({
        cuenta: { id: bancolombia.id, nombre: "Bancolombia" },
        capital: "-200000",
      });
      expect((await cuentas()).prestamos.debes).toBe("700000");
    });

    it("PATCH fecha acordada y nombre dejan historial; PATCH {} → 400 SIN_CAMBIOS", async () => {
      const r = await api(app, u).patch(`/prestamos/${camila.id}`, { fechaAcordada: null });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ fechaAcordada: null, vencido: false });

      const n = await api(app, u).patch(`/prestamos/${camila.id}`, { nombre: "Camila Ortiz" });
      expect(n.status).toBe(200);
      expect(n.body).toMatchObject({ nombre: "Camila Ortiz" });

      const { data } = await u.cliente
        .from("prestamos_cambios")
        .select("campo, valor_anterior, valor_nuevo")
        .eq("prestamo_id", camila.id)
        .order("cambiado_en");
      expect(data).toEqual([
        { campo: "fecha_acordada", valor_anterior: dia(-27), valor_nuevo: null },
        { campo: "nombre", valor_anterior: "Camila", valor_nuevo: "Camila Ortiz" },
      ]);

      esperarError(await api(app, u).patch(`/prestamos/${camila.id}`, {}), "SIN_CAMBIOS");

      // «camila» (contraída) no puede llamarse como otra contraída; sí como un otorgado.
      const contraida = (await lista()).prestamos.find((p) => p.nombre === "camila")!;
      esperarError(
        await api(app, u).patch(`/prestamos/${contraida.id}`, { nombre: "mamá" }),
        "PRESTAMO_EXISTENTE",
        "nombre",
      );
      expect(
        (await api(app, u).patch(`/prestamos/${contraida.id}`, { nombre: "Camila Ortiz" })).status,
      ).toBe(200);
    });

    it("tasa con tres decimales → 400 TASA_INVALIDA; fecha acordada anterior → 400", async () => {
      const base = {
        tipo: "prestamo_otorgado",
        nombre: "Andrés",
        monto: "80000",
        cuentaId: nequi.id,
        fecha: dia(-5),
      };
      esperarError(
        await api(app, u).post("/prestamos", { ...base, tasaMensual: "1.234" }),
        "TASA_INVALIDA",
        "tasaMensual",
      );
      esperarError(
        await api(app, u).post("/prestamos", { ...base, fechaAcordada: dia(-6) }),
        "FECHA_ACORDADA_ANTERIOR",
        "fechaAcordada",
      );
    });

    it("POST /movimientos y /recurrentes con la cuenta de Camila → 422 CUENTA_DE_PRESTAMO", async () => {
      esperarError(
        await api(app, u).post("/movimientos", {
          tipo: "transferencia",
          monto: "1000",
          cuentaOrigenId: nequi.id,
          cuentaDestinoId: camila.id,
        }),
        "CUENTA_DE_PRESTAMO",
        "cuentaDestinoId",
      );
      esperarError(
        await api(app, u).post("/recurrentes", {
          tipo: "transferencia",
          concepto: "Cuota",
          monto: "1000",
          variable: false,
          periodicidad: "mensual",
          primerVencimiento: H,
          cuentaOrigenId: nequi.id,
          cuentaDestinoId: camila.id,
        }),
        "CUENTA_DE_PRESTAMO",
        "cuentaDestinoId",
      );
    });

    it("PUT del abono: el monto cambia el capital; el tipo, no", async () => {
      const abono = filaDe(await detalle(camila.id), "abono")!;
      const cuerpo = {
        tipo: "transferencia",
        monto: "80000",
        fecha: dia(-40),
        descripcion: "Abono de Camila",
        cuentaOrigenId: camila.id,
        cuentaDestinoId: nequi.id,
      };
      const r = await api(app, u).put(`/movimientos/${abono.movimientoId}`, cuerpo);
      expect(r.status).toBe(200);
      expect((await detalle(camila.id)).capitalPendiente).toBe("70000");

      esperarError(
        await api(app, u).put(`/movimientos/${abono.movimientoId}`, {
          ...cuerpo,
          tipo: "gasto",
          cuentaDestinoId: null,
        }),
        "MOVIMIENTO_DE_PRESTAMO",
        "tipo",
      );
      esperarError(
        await api(app, u).put(`/movimientos/${abono.movimientoId}`, {
          ...cuerpo,
          cuentaDestinoId: mama.id,
        }),
        "CUENTA_DE_PRESTAMO",
        "cuentaDestinoId",
      );
      esperarError(
        await api(app, u).put(`/movimientos/${abono.movimientoId}`, {
          ...cuerpo,
          monto: "700001",
        }),
        "CAPITAL_NEGATIVO",
      );
    });

    it("PUT del interés no cambia su tipo", async () => {
      const abono = filaDe(await detalle(camila.id), "abono")!;
      esperarError(
        await api(app, u).put(`/movimientos/${abono.movimientoInteresId}`, {
          tipo: "gasto",
          monto: "12000",
          fecha: dia(-40),
          cuentaOrigenId: nequi.id,
        }),
        "MOVIMIENTO_DE_PRESTAMO",
        "tipo",
      );
    });

    it("DELETE del desembolso con abonos vivos → 422 CAPITAL_NEGATIVO", async () => {
      const desembolso = filaDe(await detalle(camila.id), "desembolso")!;
      esperarError(
        await api(app, u).delete(`/movimientos/${desembolso.movimientoId}`),
        "CAPITAL_NEGATIVO",
      );
    });

    it("DELETE del capital de un abono con interés deja el interés como fila propia", async () => {
      const abono = filaDe(await detalle(camila.id), "abono")!;
      expect((await api(app, u).delete(`/movimientos/${abono.movimientoId}`)).status).toBe(204);
      const d = await detalle(camila.id);
      expect(d.capitalPendiente).toBe("150000");
      expect(filaDe(d, "interes")).toEqual({
        fecha: dia(-40),
        clase: "interes",
        cuenta: { id: nequi.id, nombre: "Nequi" },
        categoria: null,
        capital: "0",
        interes: "12000",
        saldoCapital: "600000",
        movimientoId: null,
        movimientoInteresId: abono.movimientoInteresId,
      });
    });

    it("/cuentas/:id trata un préstamo como inexistente; el orden solo exige las visibles", async () => {
      esperarError(
        await api(app, u).patch(`/cuentas/${camila.id}`, { nombre: "X" }),
        "CUENTA_NO_ENCONTRADA",
      );
      esperarError(await api(app, u).delete(`/cuentas/${camila.id}`), "CUENTA_NO_ENCONTRADA");
      esperarError(
        await api(app, u).post(`/cuentas/${camila.id}/archivar`),
        "CUENTA_NO_ENCONTRADA",
      );
      esperarError(
        await api(app, u).patch("/perfil", { cuentaPredeterminadaId: camila.id }),
        "CUENTA_INVALIDA",
        "cuentaPredeterminadaId",
      );
      const orden = await api(app, u).put("/cuentas/orden", {
        naturaleza: "activo",
        ids: [bancolombia.id, nequi.id],
      });
      expect(orden.status).toBe(204);
    });

    it("GET /resumen: patrimonio de hoy = patrimonioNeto de GET /cuentas", async () => {
      const r = await api(app, u).get("/resumen");
      expect(r.status).toBe(200);
      const resumen = r.body as ResumenDto;
      const c = await cuentas();
      expect(resumen.patrimonio.hoy).toBe(c.patrimonioNeto);
      expect(resumen.cuentasActivas).toBe(2);
    });

    it("un id ajeno en cualquier ruta /prestamos/:id → 404 PRESTAMO_NO_ENCONTRADO", async () => {
      const intruso = api(app, otro);
      const id = camila.id;
      const cuenta = randomUUID();
      for (const r of [
        await intruso.get(`/prestamos/${id}`),
        await intruso.patch(`/prestamos/${id}`, { nombre: "X" }),
        await intruso.post(`/prestamos/${id}/desembolsos`, { monto: "1", cuentaId: cuenta }),
        await intruso.get(`/prestamos/${id}/propuesta-abono?fecha=${H}&monto=1`),
        await intruso.post(`/prestamos/${id}/abonos`, {
          cuentaId: cuenta,
          fecha: H,
          capital: "1",
          interes: "0",
        }),
        await intruso.post(`/prestamos/${id}/condonaciones`, { monto: "1", categoriaId: cuenta }),
      ]) {
        esperarError(r, "PRESTAMO_NO_ENCONTRADO");
      }
      expect((await api(app, otro).get("/prestamos")).body).toMatchObject({ prestamos: [] });
    });

    it("en la BD, los montos de los préstamos van cifrados y prestamos no tiene montos", async () => {
      const ids = [camila.id, mama.id];
      const { data: movimientos } = await admin
        .from("movimientos")
        .select("monto")
        .or(`cuenta_origen_id.in.(${ids.join(",")}),cuenta_destino_id.in.(${ids.join(",")})`);
      expect(movimientos!.length).toBeGreaterThan(0);
      for (const m of movimientos!) expect(m.monto).toMatch(FORMATO_CIFRADO);

      const { data: fila } = await admin
        .from("prestamos")
        .select("*")
        .eq("cuenta_id", camila.id)
        .single();
      expect(Object.keys(fila!).toSorted((x, y) => x.localeCompare(y))).toEqual([
        "actualizado_en",
        "creado_en",
        "cuenta_id",
        "fecha_acordada",
        "tasa_mensual_cpb",
        "usuario_id",
      ]);
      expect(fila!.tasa_mensual_cpb).toBe(100);
    });
  });
});
