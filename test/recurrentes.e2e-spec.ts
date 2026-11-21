/**
 * /recurrentes de punta a punta (SPEC 07): plantillas, bandeja, confirmar,
 * omitir, deshacer, pausa, historial, comprometido e ingresos esperados,
 * cuentas archivadas y aislamiento entre dos usuarios.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba,
 * para comprobaciones directas en la base y para fechar `primer_vencimiento`
 * y `generar_desde` en el pasado (la API no lo admite). La API nunca lo usa
 * (REGLAS §4). Apunta solo a Tino dev, nunca a datos reales.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CuentaDto, ListaCuentasDto } from "../src/cuentas/dto.js";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { sumarDias } from "../src/domain/fecha/mes.js";
import type { ListaMovimientosDto, MovimientoDto } from "../src/movimientos/dto.js";
import type { OcurrenciaDto, RecurrenteDto, RecurrentesDto } from "../src/recurrentes/dto.js";
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
    "[recurrentes] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

/** Zona por defecto del perfil (SPEC 02): la de los usuarios de prueba. */
const ZONA = "America/Bogota";

describe("/recurrentes", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/recurrentes"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;
    let u: UsuarioPrueba;
    let otro: UsuarioPrueba;
    let nequi: CuentaDto;
    let bancolombia: CuentaDto;
    let servicios: string;
    let salarioCategoria: string;

    const H = fechaLocal(new Date(), ZONA);
    const mes = H.slice(0, 7);
    const dia = (n: number) => sumarDias(H, n);
    const enMes = (fecha: string) => fecha.slice(0, 7) === mes;

    // Plantillas que se usan en varias pruebas.
    let internet: RecurrenteDto;
    let lejana: RecurrenteDto;
    let luz: RecurrenteDto;
    let movimientoInternet: MovimientoDto;

    const gasto = (extra: object = {}) => ({
      tipo: "gasto",
      concepto: "Internet",
      monto: "89900",
      variable: false,
      periodicidad: "mensual",
      primerVencimiento: dia(3),
      cuentaOrigenId: nequi.id,
      categoriaId: servicios,
      ...extra,
    });

    async function crearPlantilla(cuerpo: object): Promise<RecurrenteDto> {
      const respuesta = await api(app, u).post("/recurrentes", cuerpo);
      expect(respuesta.status).toBe(201);
      return respuesta.body as RecurrenteDto;
    }

    async function pantalla(): Promise<RecurrentesDto> {
      const respuesta = await api(app, u).get("/recurrentes");
      expect(respuesta.status).toBe(200);
      return respuesta.body as RecurrentesDto;
    }

    function plantillaDe(p: RecurrentesDto, id: string): RecurrenteDto {
      const r = p.recurrentes.find((x) => x.id === id);
      if (!r) throw new Error(`Sin plantilla ${id}`);
      return r;
    }

    const enBandeja = (p: RecurrentesDto, id: string, vencimiento: string) =>
      p.bandeja.find((o) => o.recurrenteId === id && o.vencimiento === vencimiento);

    async function saldo(cuentaId: string): Promise<string> {
      const respuesta = await api(app, u).get("/cuentas");
      const lista = respuesta.body as ListaCuentasDto;
      const cuenta = [...lista.activos.cuentas, ...lista.pasivos.cuentas].find(
        (c) => c.id === cuentaId,
      );
      return cuenta!.saldo;
    }

    async function cambios(recurrenteId: string, operacion: string): Promise<number> {
      const { data, error } = await admin
        .from("recurrentes_cambios")
        .select("id")
        .eq("recurrente_id", recurrenteId)
        .eq("operacion", operacion);
      expect(error).toBeNull();
      return data!.length;
    }

    async function categoria(nombre: string): Promise<string> {
      const { data } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", nombre)
        .single();
      return data!.id as string;
    }

    beforeAll(async () => {
      fabrica = crearFabricaUsuarios("Recurrentes");
      admin = fabrica.admin;
      u = await fabrica.crear();
      otro = await fabrica.crear();
      nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "500000" });
      bancolombia = await crearCuenta(app, u, {
        nombre: "Bancolombia",
        tipo: "banco",
        saldoInicial: "2000000",
      });
      servicios = await categoria("Servicios");
      salarioCategoria = await categoria("Salario");
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    it("POST crea un gasto mensual sin tocar saldos; su ocurrencia queda por confirmar", async () => {
      internet = await crearPlantilla(gasto());
      expect(internet).toMatchObject({
        tipo: "gasto",
        concepto: "Internet",
        monto: "89900",
        variable: false,
        periodicidad: "mensual",
        primerVencimiento: dia(3),
        ultimoDia: false,
        cuentaOrigen: { id: nequi.id, nombre: "Nequi" },
        cuentaDestino: null,
        categoria: { id: servicios, nombre: "Servicios" },
        pausada: false,
        pausadaDesde: null,
        ultimoConfirmado: null,
        proximoVencimiento: dia(3),
      });

      const { data } = await admin
        .from("recurrentes")
        .select("monto")
        .eq("id", internet.id)
        .single();
      expect(data!.monto).toMatch(/^v1\./);
      expect(data!.monto).toMatch(FORMATO_CIFRADO);

      const p = await pantalla();
      expect(p.fechaHoy).toBe(H);
      expect(p.mes).toBe(mes);
      expect(p.ventanaDias).toBe(7);
      expect(enBandeja(p, internet.id, dia(3))).toEqual({
        recurrenteId: internet.id,
        vencimiento: dia(3),
        estado: "por_confirmar",
        monto: "89900",
        estimado: false,
        movimientoId: null,
      });
      expect(await saldo(nequi.id)).toBe("500000");
    });

    it("una plantilla con primer vencimiento en H+8 no está en la bandeja: es programada", async () => {
      lejana = await crearPlantilla(gasto({ concepto: "Seguro", primerVencimiento: dia(8) }));
      const p = await pantalla();
      expect(p.bandeja.some((o) => o.recurrenteId === lejana.id)).toBe(false);
      const r = plantillaDe(p, lejana.id);
      expect(r.proximoVencimiento).toBe(dia(8));
      if (enMes(dia(8))) {
        expect(r.ocurrenciasDelMes).toEqual([
          expect.objectContaining({ vencimiento: dia(8), estado: "programada" }),
        ]);
      }
    });

    it("valida primer vencimiento, último día, categoría de transferencia y cuentas iguales", async () => {
      esperarError(
        await api(app, u).post("/recurrentes", gasto({ primerVencimiento: dia(-1) })),
        "PRIMER_VENCIMIENTO_PASADO",
        "primerVencimiento",
      );
      esperarError(
        await api(app, u).post("/recurrentes", gasto({ periodicidad: "semanal", ultimoDia: true })),
        "ULTIMO_DIA_NO_PERMITIDO",
        "ultimoDia",
      );
      const transferencia = {
        ...gasto({ tipo: "transferencia", categoriaId: null }),
        cuentaDestinoId: bancolombia.id,
      };
      esperarError(
        await api(app, u).post("/recurrentes", { ...transferencia, categoriaId: servicios }),
        "CATEGORIA_NO_PERMITIDA",
        "categoriaId",
      );
      esperarError(
        await api(app, u).post("/recurrentes", { ...transferencia, cuentaDestinoId: nequi.id }),
        "CUENTAS_IGUALES",
        "cuentaDestinoId",
      );
      esperarError(
        await api(app, u).post("/recurrentes", gasto({ periodicidad: "diaria" })),
        "PERIODICIDAD_INVALIDA",
        "periodicidad",
      );
      esperarError(
        await api(app, u).post("/recurrentes", gasto({ concepto: " " })),
        "CONCEPTO_REQUERIDO",
        "concepto",
      );
      esperarError(
        await api(app, u).post("/recurrentes", gasto({ primerVencimiento: "2027-02-30" })),
        "FECHA_INVALIDA",
        "primerVencimiento",
      );
    });

    it("confirmar crea el movimiento con fecha = vencimiento y la ocurrencia queda pagada", async () => {
      const respuesta = await api(app, u).post(`/recurrentes/${internet.id}/confirmar`, {
        vencimiento: dia(3),
      });
      expect(respuesta.status).toBe(201);
      movimientoInternet = respuesta.body as MovimientoDto;
      expect(movimientoInternet).toMatchObject({
        tipo: "gasto",
        fecha: dia(3),
        descripcion: "Internet",
        monto: "89900",
        cuentaOrigen: { id: nequi.id, nombre: "Nequi" },
        categoria: { id: servicios, nombre: "Servicios" },
      });
      expect(await saldo(nequi.id)).toBe("410100");

      const p = await pantalla();
      expect(enBandeja(p, internet.id, dia(3))).toBeUndefined();
      const r = plantillaDe(p, internet.id);
      expect(r.ultimoConfirmado).toEqual({ monto: "89900", vencimiento: dia(3) });
      if (enMes(dia(3))) {
        expect(r.ocurrenciasDelMes[0]).toEqual({
          recurrenteId: internet.id,
          vencimiento: dia(3),
          estado: "pagada",
          monto: "89900",
          estimado: false,
          movimientoId: movimientoInternet.id,
        });
      }
    });

    it("repetir la confirmación → 409 OCURRENCIA_CERRADA, sin un segundo movimiento", async () => {
      esperarError(
        await api(app, u).post(`/recurrentes/${internet.id}/confirmar`, { vencimiento: dia(3) }),
        "OCURRENCIA_CERRADA",
        "vencimiento",
      );
      const { data } = await admin
        .from("movimientos")
        .select("id")
        .eq("usuario_id", u.id)
        .eq("descripcion", "Internet");
      expect(data).toHaveLength(1);
    });

    it("un vencimiento fuera del calendario o programado → 422 OCURRENCIA_INVALIDA", async () => {
      esperarError(
        await api(app, u).post(`/recurrentes/${internet.id}/confirmar`, { vencimiento: dia(4) }),
        "OCURRENCIA_INVALIDA",
        "vencimiento",
      );
      esperarError(
        await api(app, u).post(`/recurrentes/${lejana.id}/confirmar`, { vencimiento: dia(8) }),
        "OCURRENCIA_INVALIDA",
        "vencimiento",
      );
      esperarError(
        await api(app, u).post(`/recurrentes/${lejana.id}/omitir`, { vencimiento: dia(8) }),
        "OCURRENCIA_INVALIDA",
        "vencimiento",
      );
    });

    it("confirmar con un monto inválido → MONTO_REQUERIDO o MONTO_INVALIDO", async () => {
      esperarError(
        await api(app, u).post(`/recurrentes/${lejana.id}/confirmar`, {
          vencimiento: dia(8),
          monto: "0",
        }),
        "MONTO_REQUERIDO",
        "monto",
      );
      esperarError(
        await api(app, u).post(`/recurrentes/${lejana.id}/confirmar`, {
          vencimiento: dia(8),
          monto: "12,5",
        }),
        "MONTO_INVALIDO",
        "monto",
      );
    });

    it("una variable confirmada con otro monto deja ese monto como estimado de la siguiente", async () => {
      const gas = await crearPlantilla({
        tipo: "gasto",
        concepto: "Gas",
        monto: "32400",
        variable: true,
        periodicidad: "semanal",
        primerVencimiento: H,
        cuentaOrigenId: bancolombia.id,
      });
      let p = await pantalla();
      expect(enBandeja(p, gas.id, H)).toMatchObject({ monto: "32400", estimado: true });

      const confirmacion = await api(app, u).post(`/recurrentes/${gas.id}/confirmar`, {
        vencimiento: H,
        monto: "35120",
      });
      expect(confirmacion.status).toBe(201);
      expect((confirmacion.body as MovimientoDto).monto).toBe("35120");

      p = await pantalla();
      expect(plantillaDe(p, gas.id).ultimoConfirmado).toEqual({ monto: "35120", vencimiento: H });
      expect(enBandeja(p, gas.id, dia(7))).toEqual({
        recurrenteId: gas.id,
        vencimiento: dia(7),
        estado: "por_confirmar",
        monto: "35120",
        estimado: true,
        movimientoId: null,
      });

      // Al eliminarla: el movimiento se queda, hay foto en el historial y no quedan cierres.
      const eliminacion = await api(app, u).delete(`/recurrentes/${gas.id}`);
      expect(eliminacion.status).toBe(204);
      const movimientos = (await api(app, u).get(`/movimientos?mes=${mes}`))
        .body as ListaMovimientosDto;
      expect(
        movimientos.movimientos.some((m) => m.id === (confirmacion.body as MovimientoDto).id),
      ).toBe(true);
      expect(await cambios(gas.id, "eliminacion")).toBe(1);
      const { data: cierres } = await admin
        .from("recurrentes_cierres")
        .select("id")
        .eq("recurrente_id", gas.id);
      expect(cierres).toEqual([]);
      esperarError(await api(app, u).delete(`/recurrentes/${gas.id}`), "RECURRENTE_NO_ENCONTRADO");
    });

    it("borrar el movimiento confirmado devuelve la ocurrencia a la bandeja y el saldo", async () => {
      const respuesta = await api(app, u).delete(`/movimientos/${movimientoInternet.id}`);
      expect(respuesta.status).toBe(204);

      const p = await pantalla();
      expect(enBandeja(p, internet.id, dia(3))).toMatchObject({ estado: "por_confirmar" });
      expect(plantillaDe(p, internet.id).ultimoConfirmado).toBeNull();
      expect(await saldo(nequi.id)).toBe("500000");

      const { data } = await admin
        .from("movimientos_cambios")
        .select("operacion")
        .eq("movimiento_id", movimientoInternet.id);
      expect(data).toEqual([{ operacion: "eliminacion" }]);
    });

    it("omitir saca la ocurrencia de la bandeja y del comprometido; deshacer la devuelve", async () => {
      const antes = await pantalla();
      const respuesta = await api(app, u).post(`/recurrentes/${internet.id}/omitir`, {
        vencimiento: dia(3),
      });
      expect(respuesta.status).toBe(204);

      const despues = await pantalla();
      expect(enBandeja(despues, internet.id, dia(3))).toBeUndefined();
      if (enMes(dia(3))) {
        expect(plantillaDe(despues, internet.id).ocurrenciasDelMes[0]).toMatchObject({
          vencimiento: dia(3),
          estado: "omitida",
        });
        expect(BigInt(despues.comprometido.porConfirmar.monto)).toBe(
          BigInt(antes.comprometido.porConfirmar.monto) - 89900n,
        );
        expect(despues.comprometido.porConfirmar.cantidad).toBe(
          antes.comprometido.porConfirmar.cantidad - 1,
        );
      }
      esperarError(
        await api(app, u).post(`/recurrentes/${internet.id}/omitir`, { vencimiento: dia(3) }),
        "OCURRENCIA_CERRADA",
        "vencimiento",
      );

      const deshacer = await api(app, u).delete(`/recurrentes/${internet.id}/omisiones/${dia(3)}`);
      expect(deshacer.status).toBe(204);
      expect(enBandeja(await pantalla(), internet.id, dia(3))).toMatchObject({
        estado: "por_confirmar",
      });
      esperarError(
        await api(app, u).delete(`/recurrentes/${internet.id}/omisiones/${dia(3)}`),
        "OMISION_NO_ENCONTRADA",
      );
      esperarError(
        await api(app, u).delete(`/recurrentes/${internet.id}/omisiones/2027-02-30`),
        "FECHA_INVALIDA",
        "vencimiento",
      );
    });

    it("con el calendario fechado en H−3, esa ocurrencia es vencida y va primera en la bandeja", async () => {
      luz = await crearPlantilla(gasto({ concepto: "Luz", monto: "120000", primerVencimiento: H }));
      const { error } = await admin
        .from("recurrentes")
        .update({ primer_vencimiento: dia(-3), generar_desde: dia(-3) })
        .eq("id", luz.id);
      expect(error).toBeNull();

      const p = await pantalla();
      expect(p.bandeja[0]).toEqual({
        recurrenteId: luz.id,
        vencimiento: dia(-3),
        estado: "vencida",
        monto: "120000",
        estimado: false,
        movimientoId: null,
      });
    });

    it("comprometido suma gastos y transferencias del mes, no ingresos; el ingreso va en esperados", async () => {
      const ahorro = await crearPlantilla({
        tipo: "transferencia",
        concepto: "Ahorro",
        monto: "50000",
        variable: false,
        periodicidad: "mensual",
        primerVencimiento: H,
        cuentaOrigenId: nequi.id,
        cuentaDestinoId: bancolombia.id,
      });
      const salario = await crearPlantilla({
        tipo: "ingreso",
        concepto: "Salario",
        monto: "4200000",
        variable: false,
        periodicidad: "mensual",
        primerVencimiento: H,
        cuentaDestinoId: bancolombia.id,
        categoriaId: salarioCategoria,
      });

      const p = await pantalla();
      const salidas = p.recurrentes
        .filter((r) => r.tipo !== "ingreso")
        .flatMap((r) => r.ocurrenciasDelMes)
        .filter((o) => o.estado !== "omitida");
      const suma = (lista: OcurrenciaDto[]) => lista.reduce((s, o) => s + BigInt(o.monto), 0n);
      expect(BigInt(p.comprometido.total)).toBe(suma(salidas));
      expect(
        BigInt(p.comprometido.pagado.monto) +
          BigInt(p.comprometido.porConfirmar.monto) +
          BigInt(p.comprometido.programado.monto),
      ).toBe(BigInt(p.comprometido.total));
      expect(salidas.some((o) => o.recurrenteId === ahorro.id && o.vencimiento === H)).toBe(true);

      expect(p.ingresosEsperados).toEqual([
        {
          recurrenteId: salario.id,
          vencimiento: H,
          estado: "por_confirmar",
          monto: "4200000",
          estimado: false,
          movimientoId: null,
        },
      ]);
      // El salario no suma al comprometido.
      const sinSalario = suma(salidas.filter((o) => o.recurrenteId !== salario.id));
      expect(BigInt(p.comprometido.total)).toBe(sinSalario);

      await api(app, u).delete(`/recurrentes/${ahorro.id}`);
      await api(app, u).delete(`/recurrentes/${salario.id}`);
    });

    it("pausar saca lo que aún no vence y conserva lo vencido; reanudar reinicia desde hoy", async () => {
      const edicionesAntes = await cambios(luz.id, "edicion");

      for (const r of [internet, luz]) {
        const respuesta = await api(app, u).patch(`/recurrentes/${r.id}`, { pausada: true });
        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({ pausada: true, pausadaDesde: dia(1) });
      }
      let p = await pantalla();
      expect(enBandeja(p, internet.id, dia(3))).toBeUndefined();
      expect(enBandeja(p, luz.id, dia(-3))).toMatchObject({ estado: "vencida" });

      // Al estado que ya tiene: 200 sin cambios.
      const repetida = await api(app, u).patch(`/recurrentes/${luz.id}`, { pausada: true });
      expect(repetida.status).toBe(200);
      expect(repetida.body).toMatchObject({ pausada: true, pausadaDesde: dia(1) });

      const reanudada = await api(app, u).patch(`/recurrentes/${luz.id}`, { pausada: false });
      expect(reanudada.status).toBe(200);
      expect(reanudada.body).toMatchObject({ pausada: false, pausadaDesde: null });
      const { data } = await admin
        .from("recurrentes")
        .select("generar_desde, pausada_desde")
        .eq("id", luz.id)
        .single();
      expect(data).toEqual({ generar_desde: H, pausada_desde: null });

      // Lo del tiempo en pausa no vuelve.
      p = await pantalla();
      expect(enBandeja(p, luz.id, dia(-3))).toBeUndefined();
      // Una fila por cada cambio de estado (pausa y reanudación), ninguna por la repetida.
      expect(await cambios(luz.id, "edicion")).toBe(edicionesAntes + 2);

      await api(app, u).patch(`/recurrentes/${internet.id}`, { pausada: false });
    });

    it("PUT que cambia el monto deja una fila edicion; uno idéntico no deja fila", async () => {
      const cuerpo = gasto({ monto: "95000" });
      const antes = await cambios(internet.id, "edicion");

      const respuesta = await api(app, u).put(`/recurrentes/${internet.id}`, cuerpo);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ monto: "95000", primerVencimiento: dia(3) });
      expect(await cambios(internet.id, "edicion")).toBe(antes + 1);

      const identico = await api(app, u).put(`/recurrentes/${internet.id}`, cuerpo);
      expect(identico.status).toBe(200);
      expect(await cambios(internet.id, "edicion")).toBe(antes + 1);

      // Sin cambiar el calendario, la ocurrencia abierta refleja el monto nuevo.
      expect(enBandeja(await pantalla(), internet.id, dia(3))).toMatchObject({ monto: "95000" });
    });

    it("PUT que cambia la periodicidad con primer vencimiento pasado → 400", async () => {
      // Luz tiene primer_vencimiento en H−3.
      esperarError(
        await api(app, u).put(
          `/recurrentes/${luz.id}`,
          gasto({ concepto: "Luz", periodicidad: "bimestral", primerVencimiento: dia(-3) }),
        ),
        "PRIMER_VENCIMIENTO_PASADO",
        "primerVencimiento",
      );
      // Sin cambiar el calendario, el primer vencimiento pasado se admite.
      const respuesta = await api(app, u).put(
        `/recurrentes/${luz.id}`,
        gasto({ concepto: "Luz", monto: "130000", primerVencimiento: dia(-3) }),
      );
      expect(respuesta.status).toBe(200);
    });

    it("cuentas archivadas: no se asignan, y confirmar falla sin crear movimiento", async () => {
      const vieja = await crearCuenta(app, u, {
        nombre: "Vieja",
        tipo: "efectivo",
        saldoInicial: "0",
      });
      const seguro = await crearPlantilla(
        gasto({ concepto: "Seguro moto", primerVencimiento: H, cuentaOrigenId: vieja.id }),
      );
      expect((await api(app, u).post(`/cuentas/${vieja.id}/archivar`)).status).toBe(200);

      esperarError(
        await api(app, u).post("/recurrentes", gasto({ cuentaOrigenId: vieja.id })),
        "CUENTA_ARCHIVADA",
        "cuentaOrigenId",
      );

      // La plantilla sigue generando ocurrencias.
      expect(enBandeja(await pantalla(), seguro.id, H)).toMatchObject({ estado: "por_confirmar" });
      esperarError(
        await api(app, u).post(`/recurrentes/${seguro.id}/confirmar`, { vencimiento: H }),
        "CUENTA_ARCHIVADA",
        "cuentaOrigenId",
      );
      const { data } = await admin
        .from("movimientos")
        .select("id")
        .eq("usuario_id", u.id)
        .eq("descripcion", "Seguro moto");
      expect(data).toEqual([]);
      const { data: cierres } = await admin
        .from("recurrentes_cierres")
        .select("id")
        .eq("recurrente_id", seguro.id);
      expect(cierres).toEqual([]);
    });

    it("DELETE /cuentas/:id de una cuenta sin movimientos con una plantilla → 409", async () => {
      const daviplata = await crearCuenta(app, u, {
        nombre: "Daviplata",
        tipo: "banco",
        saldoInicial: "0",
      });
      await crearPlantilla(gasto({ concepto: "Celular", cuentaOrigenId: daviplata.id }));
      esperarError(await api(app, u).delete(`/cuentas/${daviplata.id}`), "CUENTA_CON_RECURRENTES");
    });

    it("un id ajeno en cualquier ruta /recurrentes/:id → 404 RECURRENTE_NO_ENCONTRADO", async () => {
      const ajeno = api(app, otro);
      const id = internet.id;
      for (const respuesta of [
        await ajeno.put(`/recurrentes/${id}`, gasto()),
        await ajeno.patch(`/recurrentes/${id}`, { pausada: true }),
        await ajeno.post(`/recurrentes/${id}/confirmar`, { vencimiento: dia(3) }),
        await ajeno.post(`/recurrentes/${id}/omitir`, { vencimiento: dia(3) }),
        await ajeno.delete(`/recurrentes/${id}/omisiones/${dia(3)}`),
        await ajeno.delete(`/recurrentes/${id}`),
      ]) {
        esperarError(respuesta, "RECURRENTE_NO_ENCONTRADO");
      }

      const p = (await ajeno.get("/recurrentes")).body as RecurrentesDto;
      expect(p.recurrentes).toEqual([]);
      expect(p.bandeja).toEqual([]);
      expect(p.comprometido.total).toBe("0");

      // La plantilla sigue intacta para su dueño.
      expect(plantillaDe(await pantalla(), id).pausada).toBe(false);
    });

    it("un id que no es UUID → 400 ENTRADA_INVALIDA", async () => {
      esperarError(await api(app, u).delete("/recurrentes/no-es-uuid"), "ENTRADA_INVALIDA");
    });
  });
});
