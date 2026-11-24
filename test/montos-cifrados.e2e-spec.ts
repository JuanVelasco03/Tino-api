/**
 * Montos cifrados de punta a punta (SPEC 05). Escribe por la API, con el token
 * de un usuario real, y mira las filas crudas con el cliente de servicio para
 * comprobar que la base nunca guarda una cifra en claro.
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar el usuario de prueba y
 * para leer o alterar filas crudas, igual que `aislamiento.e2e-spec.ts`. Apunta
 * solo a Tino dev, nunca a datos reales.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapturaDto } from "../src/captura/dto.js";
import type { CuentaDto, ListaCuentasDto } from "../src/cuentas/dto.js";
import type { ListaMovimientosDto, MovimientoDto } from "../src/movimientos/dto.js";
import { cifrador, conClave, contexto, FORMATO_CIFRADO } from "./montos.js";
import {
  api,
  conUsuarios,
  crearApp,
  crearCuenta,
  crearFabricaUsuarios,
  esperarError,
  type UsuarioPrueba,
} from "./utilidades.js";

const configurado = conUsuarios && conClave;

if (!configurado) {
  console.warn(
    "[montos-cifrados] OMITIDA: falta SUPABASE_SECRET_KEY, SUPABASE_URL, " +
      "SUPABASE_PUBLISHABLE_KEY o CLAVE_MONTOS_V1.",
  );
}

/** Ningún texto crudo puede contener la cifra en claro. */
function esperarCifrado(valor: unknown, cifra: bigint): void {
  expect(typeof valor).toBe("string");
  expect(valor).toMatch(FORMATO_CIFRADO);
  expect(valor as string).not.toContain(cifra.toString());
}

describe.skipIf(!configurado)("montos cifrados en la base (SPEC 05)", () => {
  let app: INestApplication<App>;
  let fabrica: ReturnType<typeof crearFabricaUsuarios>;
  let admin: SupabaseClient;
  let u: UsuarioPrueba;
  let nequi: CuentaDto;
  let tarjeta: CuentaDto;
  let comida: string;
  let mercado: string;

  const registrar = async (cuerpo: object): Promise<MovimientoDto> => {
    const respuesta = await api(app, u).post("/movimientos", cuerpo);
    expect(respuesta.status).toBe(201);
    return respuesta.body as MovimientoDto;
  };

  const fila = async (tabla: string, columnas: string, id: string) => {
    const { data, error } = await admin.from(tabla).select(columnas).eq("id", id).single();
    expect(error).toBeNull();
    return data as unknown as Record<string, unknown>;
  };

  const partesCrudas = async (movimientoId: string) => {
    const { data, error } = await admin
      .from("movimiento_partes")
      .select("categoria_id, monto")
      .eq("movimiento_id", movimientoId)
      .order("categoria_id");
    expect(error).toBeNull();
    return data as { categoria_id: string; monto: string }[];
  };

  beforeAll(async () => {
    app = await crearApp();
    fabrica = crearFabricaUsuarios("Montos");
    admin = fabrica.admin;
    u = await fabrica.crear();

    nequi = await crearCuenta(app, u, { nombre: "Nequi", tipo: "banco", saldoInicial: "20321" });
    tarjeta = await crearCuenta(app, u, {
      nombre: "Tarjeta",
      tipo: "tarjeta_credito",
      saldoInicial: "1284300",
      cupo: "4000000",
      tarjeta: { diaCorte: 15, diaPago: 30 },
    });
    const captura = (await api(app, u).get("/captura").expect(200)).body as CapturaDto;
    comida = captura.categorias.gasto.find((c) => c.nombre === "Comida")!.id;
    mercado = captura.categorias.gasto.find((c) => c.nombre === "Mercado")!.id;
  });

  afterAll(async () => {
    try {
      await fabrica.borrarTodos();
    } finally {
      await app.close();
    }
  });

  it("saldo inicial y cupo se guardan cifrados y la API los devuelve en claro", async () => {
    const cruda = await fila("cuentas", "saldo_inicial, cupo", tarjeta.id);
    esperarCifrado(cruda.saldo_inicial, 1_284_300n);
    esperarCifrado(cruda.cupo, 4_000_000n);
    expect(cifrador().descifrar(cruda.cupo, contexto.cuenta(u.id, tarjeta.id, "cupo"))).toBe(
      4_000_000n,
    );
    // RN-18: disponible = cupo − deuda, calculado en el dominio con montos descifrados.
    expect(tarjeta).toMatchObject({
      saldoInicial: "1284300",
      saldo: "1284300",
      tarjeta: { cupo: "4000000", disponible: "2715700" },
    });

    const sinCupo = await fila("cuentas", "saldo_inicial, cupo", nequi.id);
    esperarCifrado(sinCupo.saldo_inicial, 20_321n);
    expect(sinCupo.cupo).toBeNull();
  });

  it("monto y partes de un movimiento dividido se guardan cifrados; la API los devuelve en claro", async () => {
    const dividido = await registrar({
      tipo: "gasto",
      monto: "30000",
      cuentaOrigenId: nequi.id,
      partes: [
        { categoriaId: comida, monto: "20000" },
        { categoriaId: mercado, monto: "10000" },
      ],
    });
    expect(dividido.monto).toBe("30000");
    expect(dividido.partes.map((p) => p.monto).toSorted()).toEqual(["10000", "20000"]);

    const cruda = await fila("movimientos", "monto", dividido.id);
    esperarCifrado(cruda.monto, 30_000n);
    const partes = await partesCrudas(dividido.id);
    expect(partes).toHaveLength(2);
    for (const p of partes) {
      expect(p.monto).toMatch(FORMATO_CIFRADO);
      const valor = cifrador().descifrar(
        p.monto,
        contexto.parte(u.id, dividido.id, p.categoria_id),
      );
      expect(valor).toBe(p.categoria_id === comida ? 20_000n : 10_000n);
    }

    await api(app, u).delete(`/movimientos/${dividido.id}`).expect(204);
  });

  it("dos movimientos con el mismo monto guardan textos distintos de la misma longitud", async () => {
    const a = await registrar({ tipo: "gasto", monto: "5000", cuentaOrigenId: nequi.id });
    const b = await registrar({ tipo: "gasto", monto: "5000", cuentaOrigenId: nequi.id });
    const ca = (await fila("movimientos", "monto", a.id)).monto as string;
    const cb = (await fila("movimientos", "monto", b.id)).monto as string;
    expect(ca).not.toBe(cb);
    expect(ca.length).toBe(cb.length);

    const otro = await registrar({ tipo: "gasto", monto: "5000000000", cuentaOrigenId: nequi.id });
    const cOtro = (await fila("movimientos", "monto", otro.id)).monto as string;
    expect(cOtro.length).toBe(ca.length);

    for (const m of [a, b, otro]) await api(app, u).delete(`/movimientos/${m.id}`).expect(204);
  });

  it("saldos, totales, patrimonio y gasto de hoy salen del dominio con montos cifrados", async () => {
    const gasto = await registrar({ tipo: "gasto", monto: "15000", cuentaOrigenId: nequi.id });
    const compra = await registrar({ tipo: "gasto", monto: "15000", cuentaOrigenId: tarjeta.id });
    const pago = await registrar({
      tipo: "transferencia",
      monto: "5000",
      cuentaOrigenId: nequi.id,
      cuentaDestinoId: tarjeta.id,
    });

    const lista = (await api(app, u).get("/cuentas").expect(200)).body as ListaCuentasDto;
    const saldoDe = (id: string) =>
      [...lista.activos.cuentas, ...lista.pasivos.cuentas].find((c) => c.id === id)!.saldo;
    // Nequi: 20.321 − 15.000 − 5.000. Tarjeta (deuda): 1.284.300 + 15.000 − 5.000.
    expect(saldoDe(nequi.id)).toBe("321");
    expect(saldoDe(tarjeta.id)).toBe("1294300");
    expect(lista.activos.total).toBe("321");
    expect(lista.pasivos.total).toBe("1294300");
    expect(lista.patrimonioNeto).toBe("-1293979");

    const captura = (await api(app, u).get("/captura").expect(200)).body as CapturaDto;
    expect(captura.gastosHoy).toBe("30000");

    for (const m of [gasto, compra, pago]) {
      await api(app, u).delete(`/movimientos/${m.id}`).expect(204);
    }
  });

  it("editar solo la nota no recifra el monto ni las partes", async () => {
    const cuerpo = {
      tipo: "gasto",
      monto: "8000",
      cuentaOrigenId: nequi.id,
      partes: [
        { categoriaId: comida, monto: "5000" },
        { categoriaId: mercado, monto: "3000" },
      ],
    };
    const m = await registrar(cuerpo);
    const antes = (await fila("movimientos", "monto", m.id)).monto;
    const partesAntes = await partesCrudas(m.id);

    await api(app, u)
      .put(`/movimientos/${m.id}`, { ...cuerpo, fecha: m.fecha, nota: "con nota" })
      .expect(200);

    expect((await fila("movimientos", "monto", m.id)).monto).toBe(antes);
    expect(await partesCrudas(m.id)).toEqual(partesAntes);

    // El historial registra la nota, no un cambio de monto.
    const { data: cambios } = await admin
      .from("movimientos_cambios")
      .select("antes, despues")
      .eq("movimiento_id", m.id);
    expect(cambios).toHaveLength(1);
    const [cambio] = cambios as {
      antes: Record<string, unknown>;
      despues: Record<string, unknown>;
    }[];
    expect(cambio!.antes.monto).toBe(cambio!.despues.monto);
    expect(cambio!.antes.partes).toEqual(cambio!.despues.partes);
    expect(cambio!.despues.nota).toBe("con nota");

    // Cambiar el monto sí recifra.
    await api(app, u)
      .put(`/movimientos/${m.id}`, {
        ...cuerpo,
        monto: "9000",
        partes: [
          { categoriaId: comida, monto: "6000" },
          { categoriaId: mercado, monto: "3000" },
        ],
        fecha: m.fecha,
        nota: "con nota",
      })
      .expect(200);
    const despues = (await fila("movimientos", "monto", m.id)).monto;
    expect(despues).not.toBe(antes);
    expect(cifrador().descifrar(despues, contexto.movimiento(u.id, m.id))).toBe(9000n);
    // La parte de Mercado no cambió: conserva su texto.
    const mercadoAntes = partesAntes.find((p) => p.categoria_id === mercado)!.monto;
    expect((await partesCrudas(m.id)).find((p) => p.categoria_id === mercado)!.monto).toBe(
      mercadoAntes,
    );

    await api(app, u).delete(`/movimientos/${m.id}`).expect(204);
  });

  it("editar el nombre de una cuenta, o repetir su saldo inicial, no deja historial ni recifra", async () => {
    const cuenta = await crearCuenta(app, u, {
      nombre: "Ahorros",
      tipo: "banco",
      saldoInicial: "100",
    });
    const antes = (await fila("cuentas", "saldo_inicial", cuenta.id)).saldo_inicial;

    await api(app, u).patch(`/cuentas/${cuenta.id}`, { nombre: "Ahorros 2" }).expect(200);
    await api(app, u)
      .patch(`/cuentas/${cuenta.id}`, { nombre: "Ahorros 3", saldoInicial: "100" })
      .expect(200);

    expect((await fila("cuentas", "saldo_inicial", cuenta.id)).saldo_inicial).toBe(antes);
    const { data: cambios } = await admin
      .from("cuentas_cambios")
      .select("id")
      .eq("cuenta_id", cuenta.id);
    expect(cambios).toEqual([]);

    // Cambiar la tarjeta solo de cupo no toca el saldo inicial ni deja historial.
    const tarjetaAntes = await fila("cuentas", "saldo_inicial, cupo", tarjeta.id);
    await api(app, u).patch(`/cuentas/${tarjeta.id}`, { cupo: "5000000" }).expect(200);
    const tarjetaDespues = await fila("cuentas", "saldo_inicial, cupo", tarjeta.id);
    expect(tarjetaDespues.saldo_inicial).toBe(tarjetaAntes.saldo_inicial);
    expect(tarjetaDespues.cupo).not.toBe(tarjetaAntes.cupo);
    expect(
      cifrador().descifrar(tarjetaDespues.cupo, contexto.cuenta(u.id, tarjeta.id, "cupo")),
    ).toBe(5_000_000n);

    await api(app, u).delete(`/cuentas/${cuenta.id}`).expect(204);
  });

  it("un cifrado copiado a otro movimiento hace responder 500, no un monto falso", async () => {
    const a = await registrar({ tipo: "gasto", monto: "1000", cuentaOrigenId: nequi.id });
    const b = await registrar({ tipo: "gasto", monto: "999999", cuentaOrigenId: nequi.id });
    const original = (await fila("movimientos", "monto", a.id)).monto as string;
    const deB = (await fila("movimientos", "monto", b.id)).monto as string;

    const { error } = await admin.from("movimientos").update({ monto: deB }).eq("id", a.id);
    expect(error).toBeNull();
    try {
      esperarError(
        await api(app, u).get(`/movimientos?mes=${a.fecha.slice(0, 7)}`),
        "ERROR_INTERNO",
      );
      esperarError(await api(app, u).get("/cuentas"), "ERROR_INTERNO");
    } finally {
      await admin.from("movimientos").update({ monto: original }).eq("id", a.id);
    }

    const lista = (
      await api(app, u)
        .get(`/movimientos?mes=${a.fecha.slice(0, 7)}`)
        .expect(200)
    ).body as ListaMovimientosDto;
    expect(lista.movimientos.find((m) => m.id === a.id)?.monto).toBe("1000");

    for (const m of [a, b]) await api(app, u).delete(`/movimientos/${m.id}`).expect(204);
  });

  it("un monto escrito en claro no entra: la base lo rechaza por formato", async () => {
    const m = await registrar({ tipo: "gasto", monto: "5000", cuentaOrigenId: nequi.id });
    const enClaro = await admin.from("movimientos").update({ monto: "5000" }).eq("id", m.id);
    expect(enClaro.error?.code).toBe("23514");
    const cuentaEnClaro = await admin
      .from("cuentas")
      .update({ saldo_inicial: "20321" })
      .eq("id", nequi.id);
    expect(cuentaEnClaro.error?.code).toBe("23514");

    await api(app, u).delete(`/movimientos/${m.id}`).expect(204);
  });

  it("la base ya no expone gastos_del_dia ni cuentas_con_saldo", async () => {
    const funcion = await u.cliente.rpc("gastos_del_dia", { p_fecha: "2026-01-01" });
    expect(funcion.error).not.toBeNull();
    const vista = await u.cliente.from("cuentas_con_saldo").select("id");
    expect(vista.error).not.toBeNull();
  });
});
