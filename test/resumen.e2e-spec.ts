/**
 * /resumen de punta a punta (SPEC 06): cifras del mes comparadas, gasto por
 * categoría, patrimonio a una fecha, serie, puente del mes, estado de día uno
 * y aislamiento entre dos usuarios.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para fechar `cuentas.creado_en` en el pasado (ver `utilidades.ts`). La API
 * nunca lo usa (REGLAS §4). Apunta solo a Tino dev, nunca a datos reales.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaDto } from "../src/captura/dto.js";
import type { CuentaDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { mesAnterior, ultimoDia } from "../src/domain/fecha/mes.js";
import type { ResumenDto } from "../src/resumen/dto.js";
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
    "[resumen] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

/** Zona por defecto del perfil (SPEC 02): la de los usuarios de prueba. */
const ZONA = "America/Bogota";

/** Mes siguiente a "YYYY-MM". */
function mesSiguiente(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number) as [number, number];
  return numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, "0")}`;
}

/** Todos los números de un valor JSON, a cualquier profundidad. */
function numeros(valor: unknown): number[] {
  if (typeof valor === "number") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(numeros);
  if (valor !== null && typeof valor === "object") return Object.values(valor).flatMap(numeros);
  return [];
}

describe("/resumen", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/resumen"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let nequi: CuentaDto;
    let tarjeta: CuentaDto;

    const hoy = fechaLocal(new Date(), ZONA);
    const M = hoy.slice(0, 7);
    const M1 = mesAnterior(M);

    async function resumen(usuario: UsuarioPrueba, mes?: string): Promise<ResumenDto> {
      const ruta = mes === undefined ? "/resumen" : `/resumen?mes=${mes}`;
      const respuesta = await api(app, usuario).get(ruta);
      expect(respuesta.status).toBe(200);
      return respuesta.body as ResumenDto;
    }

    async function registrar(cuerpo: object): Promise<void> {
      const respuesta = await api(app, u).post("/movimientos", cuerpo);
      expect(respuesta.status).toBe(201);
    }

    /** Fecha `creado_en` al día 1 de M−1, a mediodía en Bogotá. Solo con el cliente de servicio. */
    async function fecharCreacion(id: string): Promise<void> {
      const { error } = await admin
        .from("cuentas")
        .update({ creado_en: `${M1}-01T12:00:00-05:00` })
        .eq("id", id);
      expect(error).toBeNull();
    }

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Resumen");
      admin = fabrica.admin;
      u = await fabrica.crear();

      nequi = await crearCuenta(app, u, {
        nombre: "Nequi",
        tipo: "banco",
        saldoInicial: "1000000",
      });
      tarjeta = await crearCuenta(app, u, {
        nombre: "Tarjeta",
        tipo: "tarjeta_credito",
        saldoInicial: "0",
        cupo: "4000000",
        tarjeta: { diaCorte: 15, diaPago: 30 },
      });
      await fecharCreacion(nequi.id);
      await fecharCreacion(tarjeta.id);

      const captura = (await api(app, u).get("/captura").expect(200)).body as CapturaDto;
      const gasto = (nombre: string) =>
        captura.categorias.gasto.find((c) => c.nombre === nombre)!.id;
      const salario = captura.categorias.ingreso.find((c) => c.nombre === "Salario")!.id;

      // M−1
      await registrar({
        tipo: "ingreso",
        monto: "2000000",
        fecha: `${M1}-02`,
        cuentaDestinoId: nequi.id,
        categoriaId: salario,
      });
      await registrar({
        tipo: "gasto",
        monto: "300000",
        fecha: `${M1}-03`,
        cuentaOrigenId: nequi.id,
        categoriaId: gasto("Comida"),
      });
      await registrar({
        tipo: "gasto",
        monto: "20000",
        fecha: `${M1}-04`,
        cuentaOrigenId: nequi.id,
        categoriaId: gasto("Transporte"),
      });
      await registrar({
        tipo: "gasto",
        monto: "100000",
        fecha: `${M1}-05`,
        cuentaOrigenId: tarjeta.id,
      });
      await registrar({
        tipo: "transferencia",
        monto: "50000",
        fecha: `${M1}-06`,
        cuentaOrigenId: nequi.id,
        cuentaDestinoId: tarjeta.id,
      });
      // Día 1 de M
      await registrar({
        tipo: "gasto",
        monto: "200000",
        fecha: `${M}-01`,
        cuentaOrigenId: nequi.id,
        categoriaId: gasto("Comida"),
      });
      await registrar({
        tipo: "gasto",
        monto: "90000",
        fecha: `${M}-01`,
        cuentaOrigenId: tarjeta.id,
        partes: [
          { categoriaId: gasto("Comida"), monto: "60000" },
          { categoriaId: gasto("Mercado"), monto: "30000" },
        ],
      });
      await registrar({
        tipo: "gasto",
        monto: "10000",
        fecha: `${M}-01`,
        cuentaOrigenId: nequi.id,
      });
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    it("sin mes responde el mes actual; ?mes=2026-13 → MES_INVALIDO; el siguiente → MES_FUTURO", async () => {
      const r = await resumen(u);
      expect(r).toMatchObject({
        mes: M,
        mesAnterior: M1,
        desde: `${M}-01`,
        hasta: ultimoDia(M),
        fechaHoy: hoy,
      });
      esperarError(await api(app, u).get("/resumen?mes=2026-13"), "MES_INVALIDO", "mes");
      esperarError(await api(app, u).get(`/resumen?mes=${mesSiguiente(M)}`), "MES_FUTURO", "mes");
    });

    it("cifras de M comparadas con M−1", async () => {
      const r = await resumen(u, M);
      expect(r.cantidadMovimientos).toBe(3);
      expect(r.tieneMovimientos).toBe(true);
      expect(r.cuentasActivas).toBe(2);
      expect(r.inicio).toBe(`${M1}-01`);
      expect(r.ingresos).toEqual({
        actual: "0",
        anterior: "2000000",
        variacion: "-2000000",
        variacionPorcentaje: -1000,
      });
      expect(r.gastos).toEqual({
        actual: "300000",
        anterior: "420000",
        variacion: "-120000",
        variacionPorcentaje: -286,
      });
      expect(r.resultado).toEqual({
        actual: "-300000",
        anterior: "1580000",
        variacion: "-1880000",
        variacionPorcentaje: -1190,
      });
    });

    it("categorías en orden y «sin categoría» aparte", async () => {
      const r = await resumen(u, M);
      expect(r.categorias.map((c) => c.categoria.nombre)).toEqual([
        "Comida",
        "Mercado",
        "Transporte",
      ]);
      expect(r.categorias[0]).toMatchObject({
        monto: "260000",
        anterior: "300000",
        porcentaje: 867,
      });
      expect(r.categorias[1]).toMatchObject({ monto: "30000", anterior: "0", porcentaje: 100 });
      expect(r.categorias[2]).toMatchObject({
        monto: "0",
        anterior: "20000",
        variacion: "-20000",
        porcentaje: 0,
      });
      expect(r.sinCategoria).toEqual({
        monto: "10000",
        anterior: "100000",
        variacion: "-90000",
        porcentaje: 33,
        cantidad: 1,
      });
    });

    it("puente del mes, patrimonio de hoy y serie", async () => {
      const r = await resumen(u, M);
      expect(r.cambioDelMes).toEqual({
        fechaAnterior: ultimoDia(M1),
        fechaCierre: hoy,
        patrimonioAnterior: "2580000",
        resultado: "-300000",
        revaluacion: "0",
        otrosCambios: "0",
        patrimonioCierre: "2280000",
      });
      expect(r.patrimonio).toEqual({
        hoy: "2280000",
        serie: [
          { fecha: ultimoDia(M1), patrimonio: "2580000" },
          { fecha: hoy, patrimonio: "2280000" },
        ],
        variacionSerie: "-300000",
      });
    });

    it("ningún porcentaje es un número con decimales", async () => {
      for (const mes of [M, M1]) {
        for (const n of numeros(await resumen(u, mes))) expect(Number.isInteger(n)).toBe(true);
      }
    });

    it("editar el saldo inicial cambia M pero no el cierre de M−1", async () => {
      await api(app, u).patch(`/cuentas/${nequi.id}`, { saldoInicial: "1100000" }).expect(200);
      const r = await resumen(u, M);
      expect(r.cambioDelMes).toMatchObject({
        patrimonioAnterior: "2580000",
        otrosCambios: "100000",
        patrimonioCierre: "2380000",
      });
      expect(r.patrimonio.serie[0]).toEqual({ fecha: ultimoDia(M1), patrimonio: "2580000" });
    });

    it("una cuenta nueva entra en otrosCambios y en cuentasActivas", async () => {
      await crearCuenta(app, u, { nombre: "Efectivo", tipo: "efectivo", saldoInicial: "45000" });
      const r = await resumen(u, M);
      expect(r.cambioDelMes.otrosCambios).toBe("145000");
      expect(r.cuentasActivas).toBe(3);
    });

    it("M−1: el puente arranca en cero y usa el saldo inicial de antes de la edición", async () => {
      const r = await resumen(u, M1);
      expect(r.cambioDelMes).toEqual({
        fechaAnterior: ultimoDia(mesAnterior(M1)),
        fechaCierre: ultimoDia(M1),
        patrimonioAnterior: "0",
        resultado: "1580000",
        revaluacion: "0",
        otrosCambios: "1000000",
        patrimonioCierre: "2580000",
      });
    });

    it("un mes anterior a M−1 responde 200 con cifras y puente en cero", async () => {
      const r = await resumen(u, mesAnterior(M1));
      expect(r.cantidadMovimientos).toBe(0);
      for (const c of [r.ingresos, r.gastos, r.resultado]) {
        expect(c).toEqual({
          actual: "0",
          anterior: "0",
          variacion: "0",
          variacionPorcentaje: null,
        });
      }
      expect(r.categorias).toEqual([]);
      expect(r.cambioDelMes).toMatchObject({
        patrimonioAnterior: "0",
        resultado: "0",
        otrosCambios: "0",
        patrimonioCierre: "0",
      });
    });

    it("usuario nuevo con una cuenta y sin movimientos: estado de día uno, sin cifras del otro", async () => {
      const otro = await fabrica.crear();
      await crearCuenta(app, otro, { nombre: "Ahorros", tipo: "banco", saldoInicial: "975372" });
      const r = await resumen(otro);

      expect(r.tieneMovimientos).toBe(false);
      expect(r.cantidadMovimientos).toBe(0);
      expect(r.cuentasActivas).toBe(1);
      for (const c of [r.ingresos, r.gastos, r.resultado]) {
        expect(c).toEqual({
          actual: "0",
          anterior: "0",
          variacion: "0",
          variacionPorcentaje: null,
        });
      }
      expect(r.categorias).toEqual([]);
      expect(r.sinCategoria).toEqual({
        monto: "0",
        anterior: "0",
        variacion: "0",
        porcentaje: null,
        cantidad: 0,
      });
      expect(r.patrimonio).toEqual({
        hoy: "975372",
        serie: [{ fecha: hoy, patrimonio: "975372" }],
        variacionSerie: "0",
      });
      expect(r.inicio).toBe(hoy);
      // Aislamiento (RN-12): nada del primer usuario se cuela en el resumen del segundo.
      const crudo = JSON.stringify(r);
      for (const cifra of ["2580000", "2280000", "1580000", "260000", "420000"]) {
        expect(crudo).not.toContain(cifra);
      }
    });
  });
});
