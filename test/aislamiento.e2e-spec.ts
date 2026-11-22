/**
 * Prueba de aislamiento entre usuarios (REGLAS §4). NO se borra ni se desactiva.
 *
 * `SUPABASE_SECRET_KEY` (service_role) se usa SOLO para crear y borrar los dos
 * usuarios de prueba. Todas las aserciones usan clientes con el token de cada
 * usuario, de modo que las políticas RLS evalúan al usuario real.
 * Apunta solo a Tino dev, nunca a datos reales.
 *
 * SPEC 05: los montos se escriben cifrados con la clave de la API
 * (`test/montos.ts`); la base rechaza un monto en claro. Las aserciones de
 * aislamiento son las mismas.
 *
 * SPEC 07: plantillas recurrentes, sus cierres, su historial y
 * `confirmar_ocurrencia` (security definer) atacada con una plantilla ajena.
 *
 * SPEC 08: cuentas de préstamo, `prestamos`, `prestamos_detalle`,
 * `prestamos_intereses` y `prestamos_cambios`; `crear_prestamo` y
 * `registrar_abono` (security definer) atacadas con datos ajenos.
 *
 * SPEC 09: la caché `trm`: solo SELECT e INSERT propios; UPDATE y DELETE
 * no tienen política y afectan 0 filas.
 *
 * SPEC 10: cuentas de inversión, `inversion_activos`, `inversion_operaciones`,
 * su historial e `inversion_precios`; `crear_inversion` y
 * `registrar_operacion` (security definer) atacadas con datos ajenos; permisos
 * de columna de las operaciones y moneda fija.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cifrador, conClave, contexto } from "./montos.js";

const url = process.env.SUPABASE_URL;
const clavePublicable = process.env.SUPABASE_PUBLISHABLE_KEY;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;
const configurado = Boolean(url && clavePublicable && claveSecreta && conClave);

if (!configurado) {
  console.warn(
    "[aislamiento] OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / CLAVE_MONTOS_V1). " +
      "Defínela en .env.test.local. REGLAS §4 exige que esta prueba corra.",
  );
}

type Usuario = { id: string; cliente: SupabaseClient };

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configurado)("aislamiento entre usuarios (RLS)", () => {
  const contrasena = `Aislamiento-${randomUUID()}`;
  const idsCreados: string[] = [];
  let admin: SupabaseClient;
  let a: Usuario;
  let b: Usuario;

  async function crearUsuario(): Promise<Usuario> {
    const correo = `aislamiento+${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: contrasena,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`No se pudo crear usuario: ${error?.message}`);
    idsCreados.push(data.user.id);

    const cliente = createClient(url!, clavePublicable!, opciones);
    const { error: errorEntrada } = await cliente.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    if (errorEntrada) throw new Error(`No se pudo entrar: ${errorEntrada.message}`);
    return { id: data.user.id, cliente };
  }

  beforeAll(async () => {
    admin = createClient(url!, claveSecreta!, opciones);
    a = await crearUsuario();
    b = await crearUsuario();
  });

  afterAll(async () => {
    // Borra por id aunque fallen aserciones; la cascada elimina los perfiles.
    for (const id of idsCreados) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("el trigger crea el perfil con los valores por defecto", async () => {
    const { data, error } = await a.cliente.from("perfiles").select("*").eq("id", a.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: a.id,
      nombre: null,
      moneda_base: "COP",
      zona_horaria: "America/Bogota",
      primer_uso_completado: false,
    });
  });

  it("cada usuario ve exactamente su perfil", async () => {
    for (const u of [a, b]) {
      const { data, error } = await u.cliente.from("perfiles").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: u.id }]);
    }
  });

  it("SELECT del perfil ajeno devuelve 0 filas", async () => {
    const { data, error } = await a.cliente.from("perfiles").select("id").eq("id", b.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE del perfil ajeno afecta 0 filas", async () => {
    const { data, error } = await a.cliente
      .from("perfiles")
      .update({ nombre: "intruso" })
      .eq("id", b.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: real } = await admin.from("perfiles").select("nombre").eq("id", b.id).single();
    expect(real?.nombre).toBeNull();
  });

  it("INSERT directo falla", async () => {
    const { error } = await a.cliente.from("perfiles").insert({ id: randomUUID() });
    expect(error).not.toBeNull();
  });

  it("DELETE directo no borra nada", async () => {
    const { data } = await a.cliente.from("perfiles").delete().eq("id", a.id).select();
    expect(data ?? []).toEqual([]);
    const { data: sigue } = await admin.from("perfiles").select("id").eq("id", a.id);
    expect(sigue).toEqual([{ id: a.id }]);
  });

  it("UPDATE propio funciona y actualiza actualizado_en", async () => {
    const { data: antes } = await a.cliente.from("perfiles").select("actualizado_en").single();
    const { data, error } = await a.cliente
      .from("perfiles")
      .update({ nombre: "Prueba" })
      .eq("id", a.id)
      .select("nombre, actualizado_en")
      .single();
    expect(error).toBeNull();
    expect(data?.nombre).toBe("Prueba");
    expect(new Date(data!.actualizado_en).getTime()).toBeGreaterThan(
      new Date(antes!.actualizado_en).getTime(),
    );
  });

  it("moneda_base fuera de COP/USD es rechazada", async () => {
    const { error } = await a.cliente
      .from("perfiles")
      .update({ moneda_base: "EUR" })
      .eq("id", a.id);
    expect(error).not.toBeNull();
  });

  describe("cuentas (SPEC 03)", () => {
    let cuentaA: string;
    let cuentaB: string;

    async function crearCuenta(u: Usuario, nombre: string): Promise<string> {
      const id = randomUUID();
      const saldo_inicial = cifrador().cifrar(1000n, contexto.cuenta(u.id, id, "saldo_inicial"));
      const { data, error } = await u.cliente
        .from("cuentas")
        .insert({ id, nombre, tipo: "banco", saldo_inicial })
        .select("id")
        .single();
      if (error || !data) throw new Error(`No se pudo crear la cuenta: ${error?.message}`);
      return data.id as string;
    }

    beforeAll(async () => {
      cuentaA = await crearCuenta(a, "Cuenta A");
      cuentaB = await crearCuenta(b, "Cuenta B");
    });

    it("cada usuario ve solo su cuenta en cuentas", async () => {
      for (const [u, propia] of [
        [a, cuentaA],
        [b, cuentaB],
      ] as const) {
        const { data, error } = await u.cliente.from("cuentas").select("id");
        expect(error).toBeNull();
        expect(data).toEqual([{ id: propia }]);
      }
    });

    it("UPDATE de la cuenta ajena afecta 0 filas", async () => {
      const { data, error } = await a.cliente
        .from("cuentas")
        .update({ nombre: "intruso" })
        .eq("id", cuentaB)
        .select();
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: real } = await admin
        .from("cuentas")
        .select("nombre")
        .eq("id", cuentaB)
        .single();
      expect(real?.nombre).toBe("Cuenta B");
    });

    it("DELETE de la cuenta ajena afecta 0 filas", async () => {
      const { data, error } = await a.cliente.from("cuentas").delete().eq("id", cuentaB).select();
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: sigue } = await admin.from("cuentas").select("id").eq("id", cuentaB);
      expect(sigue).toEqual([{ id: cuentaB }]);
    });

    it("INSERT con usuario_id ajeno falla", async () => {
      const id = randomUUID();
      const { error } = await a.cliente.from("cuentas").insert({
        id,
        usuario_id: b.id,
        nombre: "Ajena",
        tipo: "efectivo",
        saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(b.id, id, "saldo_inicial")),
      });
      expect(error).not.toBeNull();
    });

    it("cambiar el saldo inicial propio deja 1 fila en cuentas_cambios, invisible para el otro", async () => {
      const { error } = await a.cliente
        .from("cuentas")
        .update({
          saldo_inicial: cifrador().cifrar(2000n, contexto.cuenta(a.id, cuentaA, "saldo_inicial")),
        })
        .eq("id", cuentaA);
      expect(error).toBeNull();

      const { data: propias } = await a.cliente
        .from("cuentas_cambios")
        .select("cuenta_id, usuario_id, campo")
        .eq("cuenta_id", cuentaA);
      expect(propias).toEqual([{ cuenta_id: cuentaA, usuario_id: a.id, campo: "saldo_inicial" }]);

      const { data: ajenas, error: errorAjenas } = await b.cliente
        .from("cuentas_cambios")
        .select("id");
      expect(errorAjenas).toBeNull();
      expect(ajenas).toEqual([]);
    });

    it("INSERT directo en cuentas_cambios falla", async () => {
      const ctx = contexto.cuenta(a.id, cuentaA, "saldo_inicial");
      const { error } = await a.cliente.from("cuentas_cambios").insert({
        cuenta_id: cuentaA,
        usuario_id: a.id,
        campo: "saldo_inicial",
        valor_anterior: cifrador().cifrar(0n, ctx),
        valor_nuevo: cifrador().cifrar(1n, ctx),
      });
      expect(error).not.toBeNull();
    });

    it("reordenar_cuentas con ids ajenos lanza ORDEN_INVALIDO", async () => {
      const { error } = await a.cliente.rpc("reordenar_cuentas", {
        p_naturaleza: "activo",
        p_ids: [cuentaA, cuentaB],
      });
      expect(error?.message).toBe("ORDEN_INVALIDO");

      const { error: soloAjena } = await a.cliente.rpc("reordenar_cuentas", {
        p_naturaleza: "activo",
        p_ids: [cuentaB],
      });
      expect(soloAjena?.message).toBe("ORDEN_INVALIDO");
    });
  });

  describe("movimientos, categorías y reglas (SPEC 04)", () => {
    type Datos = { cuenta: string; comida: string; movimiento: string; regla: string };
    let datosA: Datos;
    let datosB: Datos;
    const hoy = new Date().toISOString().slice(0, 10);

    async function categoria(u: Usuario, nombre: string): Promise<string> {
      const { data, error } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", nombre)
        .single();
      if (error || !data) throw new Error(`Sin categoría ${nombre}: ${error?.message}`);
      return data.id as string;
    }

    /** Monto de un movimiento y de sus partes, cifrados como lo hace la API. */
    const monto = (u: Usuario, id: string, valor: bigint) =>
      cifrador().cifrar(valor, contexto.movimiento(u.id, id));
    const parte = (u: Usuario, id: string, categoriaId: string, valor: bigint) => ({
      categoria_id: categoriaId,
      monto: cifrador().cifrar(valor, contexto.parte(u.id, id, categoriaId)),
    });

    async function preparar(u: Usuario, nombreCuenta: string, concepto: string): Promise<Datos> {
      const idCuenta = randomUUID();
      const { data: cuenta, error } = await u.cliente
        .from("cuentas")
        .insert({
          id: idCuenta,
          nombre: nombreCuenta,
          tipo: "banco",
          saldo_inicial: cifrador().cifrar(
            100000n,
            contexto.cuenta(u.id, idCuenta, "saldo_inicial"),
          ),
        })
        .select("id")
        .single();
      if (error || !cuenta) throw new Error(`No se pudo crear la cuenta: ${error?.message}`);
      const comida = await categoria(u, "Comida");

      const idMov = randomUUID();
      const { data: movimiento, error: errorMov } = await u.cliente.rpc("registrar_movimiento", {
        p_id: idMov,
        p_tipo: "gasto",
        p_monto: monto(u, idMov, 15000n),
        p_fecha: hoy,
        p_descripcion: concepto,
        p_nota: null,
        p_cuenta_origen_id: cuenta.id,
        p_cuenta_destino_id: null,
        p_categoria_id: null,
        p_partes: [
          parte(u, idMov, comida, 10000n),
          parte(u, idMov, await categoria(u, "Mercado"), 5000n),
        ],
      });
      if (errorMov) throw new Error(`No se pudo registrar: ${errorMov.message}`);

      // Una edición para que haya fila en movimientos_cambios.
      const { error: errorEdicion } = await u.cliente.rpc("reemplazar_movimiento", {
        p_id: movimiento,
        p_tipo: "gasto",
        p_monto: monto(u, idMov, 15000n),
        p_fecha: hoy,
        p_descripcion: `${concepto} editado`,
        p_nota: null,
        p_cuenta_origen_id: cuenta.id,
        p_cuenta_destino_id: null,
        p_categoria_id: comida,
        p_partes: null,
      });
      if (errorEdicion) throw new Error(`No se pudo editar: ${errorEdicion.message}`);
      // Y otro dividido, para que haya partes visibles.
      const idDividido = randomUUID();
      const { error: errorDividido } = await u.cliente.rpc("registrar_movimiento", {
        p_id: idDividido,
        p_tipo: "gasto",
        p_monto: monto(u, idDividido, 3000n),
        p_fecha: hoy,
        p_descripcion: concepto,
        p_nota: null,
        p_cuenta_origen_id: cuenta.id,
        p_cuenta_destino_id: null,
        p_categoria_id: null,
        p_partes: [
          parte(u, idDividido, comida, 1000n),
          parte(u, idDividido, await categoria(u, "Ocio"), 2000n),
        ],
      });
      if (errorDividido) throw new Error(`No se pudo dividir: ${errorDividido.message}`);

      const { data: regla } = await u.cliente
        .from("reglas_categoria")
        .select("id")
        .eq("palabra_clave", "almuerzo")
        .single();
      return { cuenta: cuenta.id, comida, movimiento: movimiento as string, regla: regla!.id };
    }

    beforeAll(async () => {
      datosA = await preparar(a, "Mov A", "Almuerzo A");
      datosB = await preparar(b, "Mov B", "Almuerzo B");
    });

    it("el usuario nuevo tiene sus 15 categorías y sus reglas sembradas", async () => {
      for (const u of [a, b]) {
        const { data: categorias } = await u.cliente.from("categorias").select("usuario_id");
        expect(categorias).toHaveLength(15);
        expect(categorias!.every((c) => c.usuario_id === u.id)).toBe(true);

        const { data: reglas } = await u.cliente.from("reglas_categoria").select("usuario_id");
        expect(reglas!.length).toBeGreaterThan(0);
        expect(reglas!.every((r) => r.usuario_id === u.id)).toBe(true);
      }
    });

    it("nadie ve movimientos, partes, historial, categorías ni reglas ajenos", async () => {
      for (const [u, otro] of [
        [a, b],
        [b, a],
      ] as const) {
        for (const tabla of [
          "movimientos",
          "movimientos_detalle",
          "movimiento_partes",
          "movimientos_cambios",
          "categorias",
          "reglas_categoria",
        ]) {
          const { data, error } = await u.cliente.from(tabla).select("usuario_id");
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.some((f) => f.usuario_id === otro.id)).toBe(false);
        }
      }
    });

    it("INSERT, UPDATE y DELETE directos en movimientos y movimiento_partes no cambian nada", async () => {
      const idNuevo = randomUUID();
      const { error: insercion } = await a.cliente.from("movimientos").insert({
        id: idNuevo,
        usuario_id: a.id,
        tipo: "gasto",
        monto: monto(a, idNuevo, 1n),
        fecha: hoy,
        cuenta_origen_id: datosA.cuenta,
      });
      expect(insercion).not.toBeNull();

      const { error: insercionParte } = await a.cliente.from("movimiento_partes").insert({
        movimiento_id: datosA.movimiento,
        usuario_id: a.id,
        ...parte(a, datosA.movimiento, datosA.comida, 1n),
      });
      expect(insercionParte).not.toBeNull();

      for (const tabla of ["movimientos", "movimiento_partes"]) {
        const { data: actualizadas } = await a.cliente
          .from(tabla)
          .update({ monto: monto(a, datosA.movimiento, 1n) })
          .neq("monto", "")
          .select("id");
        expect(actualizadas ?? []).toEqual([]);
        const { data: borradas } = await a.cliente
          .from(tabla)
          .delete()
          .neq("monto", "")
          .select("id");
        expect(borradas ?? []).toEqual([]);
      }

      const { data: real } = await admin
        .from("movimientos")
        .select("monto")
        .eq("id", datosA.movimiento)
        .single();
      expect(cifrador().descifrar(real?.monto, contexto.movimiento(a.id, datosA.movimiento))).toBe(
        15000n,
      );
    });

    it("registrar_movimiento con la cuenta o la categoría ajena falla", async () => {
      const idNuevo = randomUUID();
      const base = {
        p_id: idNuevo,
        p_tipo: "gasto",
        p_monto: monto(a, idNuevo, 1000n),
        p_fecha: hoy,
        p_descripcion: null,
        p_nota: null,
        p_cuenta_destino_id: null,
        p_partes: null,
      };
      const conCuentaAjena = await a.cliente.rpc("registrar_movimiento", {
        ...base,
        p_cuenta_origen_id: datosB.cuenta,
        p_categoria_id: null,
      });
      expect(conCuentaAjena.error?.code).toBe("23503");

      const conCategoriaAjena = await a.cliente.rpc("registrar_movimiento", {
        ...base,
        p_cuenta_origen_id: datosA.cuenta,
        p_categoria_id: datosB.comida,
      });
      expect(conCategoriaAjena.error?.code).toBe("23503");

      const conParteAjena = await a.cliente.rpc("registrar_movimiento", {
        ...base,
        p_cuenta_origen_id: datosA.cuenta,
        p_categoria_id: null,
        p_partes: [parte(a, idNuevo, datosA.comida, 500n), parte(a, idNuevo, datosB.comida, 500n)],
      });
      expect(conParteAjena.error?.message).toBe("CATEGORIA_INVALIDA:partes");
    });

    it("reemplazar_movimiento y eliminar_movimiento sobre el ajeno lanzan MOVIMIENTO_NO_ENCONTRADO", async () => {
      const reemplazo = await a.cliente.rpc("reemplazar_movimiento", {
        p_id: datosB.movimiento,
        p_tipo: "gasto",
        p_monto: monto(a, datosB.movimiento, 1n),
        p_fecha: hoy,
        p_descripcion: null,
        p_nota: null,
        p_cuenta_origen_id: datosA.cuenta,
        p_cuenta_destino_id: null,
        p_categoria_id: null,
        p_partes: null,
      });
      expect(reemplazo.error?.message).toBe("MOVIMIENTO_NO_ENCONTRADO");

      const eliminacion = await a.cliente.rpc("eliminar_movimiento", { p_id: datosB.movimiento });
      expect(eliminacion.error?.message).toBe("MOVIMIENTO_NO_ENCONTRADO");

      const { data: sigue } = await admin
        .from("movimientos")
        .select("monto")
        .eq("id", datosB.movimiento)
        .single();
      expect(cifrador().descifrar(sigue?.monto, contexto.movimiento(b.id, datosB.movimiento))).toBe(
        15000n,
      );
    });

    it("los gastos del día y conceptos_frecuentes solo cuentan lo propio", async () => {
      const { data: gastos, error } = await a.cliente
        .from("movimientos")
        .select("id, usuario_id, monto")
        .eq("fecha", hoy)
        .eq("tipo", "gasto");
      expect(error).toBeNull();
      expect(gastos!.every((g) => g.usuario_id === a.id)).toBe(true);
      const total = gastos!.reduce(
        (suma, g) => suma + cifrador().descifrar(g.monto, contexto.movimiento(a.id, g.id)),
        0n,
      );
      expect(total).toBe(18000n);

      const { data: frecuentes } = await a.cliente.rpc("conceptos_frecuentes", {
        p_desde: "2000-01-01",
        p_limite: 6,
      });
      const descripciones = (frecuentes as { descripcion: string }[]).map((f) => f.descripcion);
      expect(descripciones).toEqual(expect.arrayContaining(["Almuerzo A"]));
      expect(descripciones.some((d) => d.includes("B"))).toBe(false);
    });

    it("PATCH directo de una regla ajena afecta 0 filas", async () => {
      const { data } = await a.cliente
        .from("reglas_categoria")
        .update({ categoria_id: datosA.comida })
        .eq("id", datosB.regla)
        .select("id");
      expect(data).toEqual([]);
    });
  });

  describe("recurrentes (SPEC 07)", () => {
    type Datos = { cuenta: string; categoria: string; recurrente: string; movimiento: string };
    let datosA: Datos;
    let datosB: Datos;
    const hoy = new Date().toISOString().slice(0, 10);
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const montoRecurrente = (u: Usuario, id: string, valor: bigint) =>
      cifrador().cifrar(valor, contexto.recurrente(u.id, id));
    const montoMovimiento = (u: Usuario, id: string, valor: bigint) =>
      cifrador().cifrar(valor, contexto.movimiento(u.id, id));

    function plantilla(u: Usuario, id: string, cuenta: string, categoria: string | null) {
      return {
        id,
        tipo: "gasto",
        concepto: "Internet",
        monto: montoRecurrente(u, id, 89900n),
        cuenta_origen_id: cuenta,
        categoria_id: categoria,
        periodicidad: "mensual",
        primer_vencimiento: hoy,
        generar_desde: hoy,
      };
    }

    async function preparar(u: Usuario, nombreCuenta: string): Promise<Datos> {
      const cuenta = randomUUID();
      const { error: errorCuenta } = await u.cliente.from("cuentas").insert({
        id: cuenta,
        nombre: nombreCuenta,
        tipo: "banco",
        saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(u.id, cuenta, "saldo_inicial")),
      });
      if (errorCuenta) throw new Error(`No se pudo crear la cuenta: ${errorCuenta.message}`);
      const { data: servicios } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", "Servicios")
        .single();
      const categoria = servicios!.id as string;

      const recurrente = randomUUID();
      const { error } = await u.cliente
        .from("recurrentes")
        .insert(plantilla(u, recurrente, cuenta, categoria));
      if (error) throw new Error(`No se pudo crear la plantilla: ${error.message}`);

      // Una edición para que haya fila en recurrentes_cambios.
      const { error: errorEdicion } = await u.cliente
        .from("recurrentes")
        .update({ concepto: "Internet hogar" })
        .eq("id", recurrente);
      if (errorEdicion) throw new Error(`No se pudo editar: ${errorEdicion.message}`);

      // Un cierre omitido (RLS directa) y uno confirmado (función).
      const { error: errorOmision } = await u.cliente
        .from("recurrentes_cierres")
        .insert({ recurrente_id: recurrente, vencimiento: manana, estado: "omitida" });
      if (errorOmision) throw new Error(`No se pudo omitir: ${errorOmision.message}`);

      const movimiento = randomUUID();
      const { error: errorConfirmacion } = await u.cliente.rpc("confirmar_ocurrencia", {
        p_recurrente_id: recurrente,
        p_vencimiento: hoy,
        p_movimiento_id: movimiento,
        p_monto: montoMovimiento(u, movimiento, 89900n),
      });
      if (errorConfirmacion) throw new Error(`No se pudo confirmar: ${errorConfirmacion.message}`);

      return { cuenta, categoria, recurrente, movimiento };
    }

    beforeAll(async () => {
      datosA = await preparar(a, "Rec A");
      datosB = await preparar(b, "Rec B");
    });

    it("nadie ve plantillas, detalle, cierres ni historial ajenos", async () => {
      for (const [u, otro] of [
        [a, b],
        [b, a],
      ] as const) {
        for (const tabla of [
          "recurrentes",
          "recurrentes_detalle",
          "recurrentes_cierres",
          "recurrentes_cambios",
        ]) {
          const { data, error } = await u.cliente.from(tabla).select("usuario_id");
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.some((f) => f.usuario_id === otro.id)).toBe(false);
        }
      }
    });

    it("INSERT de plantilla con la cuenta o la categoría ajena falla", async () => {
      const { error: errorCuenta } = await a.cliente
        .from("recurrentes")
        .insert(plantilla(a, randomUUID(), datosB.cuenta, null));
      expect(errorCuenta?.code).toBe("23503");

      const { error: errorCategoria } = await a.cliente
        .from("recurrentes")
        .insert(plantilla(a, randomUUID(), datosA.cuenta, datosB.categoria));
      expect(errorCategoria?.code).toBe("23503");
    });

    it("INSERT de cierre con la plantilla ajena falla", async () => {
      const { error } = await a.cliente
        .from("recurrentes_cierres")
        .insert({ recurrente_id: datosB.recurrente, vencimiento: "2030-01-01", estado: "omitida" });
      expect(error).not.toBeNull();

      const { data } = await admin
        .from("recurrentes_cierres")
        .select("id")
        .eq("recurrente_id", datosB.recurrente)
        .eq("vencimiento", "2030-01-01");
      expect(data).toEqual([]);
    });

    it("INSERT directo de un cierre confirmada falla por RLS", async () => {
      const { error } = await a.cliente.from("recurrentes_cierres").insert({
        recurrente_id: datosA.recurrente,
        vencimiento: "2030-01-01",
        estado: "confirmada",
        movimiento_id: datosA.movimiento,
      });
      expect(error?.code).toBe("42501");
    });

    it("UPDATE y DELETE sobre filas ajenas afectan 0 filas", async () => {
      const { data: actualizadas, error: errorUpdate } = await a.cliente
        .from("recurrentes")
        .update({ concepto: "intruso" })
        .eq("id", datosB.recurrente)
        .select("id");
      expect(errorUpdate).toBeNull();
      expect(actualizadas).toEqual([]);

      const { data: borradas, error: errorDelete } = await a.cliente
        .from("recurrentes")
        .delete()
        .eq("id", datosB.recurrente)
        .select("id");
      expect(errorDelete).toBeNull();
      expect(borradas).toEqual([]);

      const { data: cierresBorrados } = await a.cliente
        .from("recurrentes_cierres")
        .delete()
        .eq("recurrente_id", datosB.recurrente)
        .select("id");
      expect(cierresBorrados ?? []).toEqual([]);

      const { data: plantillaB } = await admin
        .from("recurrentes")
        .select("concepto")
        .eq("id", datosB.recurrente)
        .single();
      expect(plantillaB?.concepto).toBe("Internet hogar");
      const { data: cierresB } = await admin
        .from("recurrentes_cierres")
        .select("id")
        .eq("recurrente_id", datosB.recurrente);
      expect(cierresB).toHaveLength(2);
    });

    it("un cierre confirmado no se borra por RLS directa, ni siquiera el propio", async () => {
      const { data } = await a.cliente
        .from("recurrentes_cierres")
        .delete()
        .eq("movimiento_id", datosA.movimiento)
        .select("id");
      expect(data ?? []).toEqual([]);
    });

    it("confirmar_ocurrencia sobre la plantilla ajena lanza RECURRENTE_NO_ENCONTRADO", async () => {
      const movimiento = randomUUID();
      const { error } = await a.cliente.rpc("confirmar_ocurrencia", {
        p_recurrente_id: datosB.recurrente,
        p_vencimiento: "2030-01-01",
        p_movimiento_id: movimiento,
        p_monto: montoMovimiento(a, movimiento, 1n),
      });
      expect(error?.message).toBe("RECURRENTE_NO_ENCONTRADO");

      const { data } = await admin.from("movimientos").select("id").eq("id", movimiento);
      expect(data).toEqual([]);
    });
  });

  describe("préstamos (SPEC 08)", () => {
    type Datos = { cuenta: string; prestamo: string; intereses: string };
    let datosA: Datos;
    let datosB: Datos;
    const hoy = new Date().toISOString().slice(0, 10);

    const montoMovimiento = (u: Usuario, id: string, valor: bigint) =>
      cifrador().cifrar(valor, contexto.movimiento(u.id, id));

    function argumentosPrestamo(u: Usuario, cuentaPropia: string, nombre: string) {
      const prestamo = randomUUID();
      const movimiento = randomUUID();
      return {
        p_cuenta_id: prestamo,
        p_tipo: "prestamo_otorgado",
        p_nombre: nombre,
        p_saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(u.id, prestamo, "saldo_inicial")),
        p_tasa_mensual_cpb: 100,
        p_fecha_acordada: null,
        p_movimiento_id: movimiento,
        p_monto: montoMovimiento(u, movimiento, 600000n),
        p_fecha: hoy,
        p_cuenta_propia_id: cuentaPropia,
        p_descripcion: `Préstamo a ${nombre}`,
      };
    }

    function argumentosAbono(u: Usuario, prestamo: string, cuentaPropia: string, interes: string) {
      const capital = randomUUID();
      const movimientoInteres = randomUUID();
      return {
        p_prestamo_id: prestamo,
        p_cuenta_propia_id: cuentaPropia,
        p_fecha: hoy,
        p_capital_id: capital,
        p_capital: montoMovimiento(u, capital, 100000n),
        p_interes_id: movimientoInteres,
        p_interes: montoMovimiento(u, movimientoInteres, 12000n),
        p_categoria_interes_id: interes,
        p_descripcion_capital: "Abono",
        p_descripcion_interes: "Intereses",
      };
    }

    async function preparar(u: Usuario, nombreCuenta: string): Promise<Datos> {
      const cuenta = randomUUID();
      const { error: errorCuenta } = await u.cliente.from("cuentas").insert({
        id: cuenta,
        nombre: nombreCuenta,
        tipo: "banco",
        saldo_inicial: cifrador().cifrar(1000000n, contexto.cuenta(u.id, cuenta, "saldo_inicial")),
      });
      if (errorCuenta) throw new Error(`No se pudo crear la cuenta: ${errorCuenta.message}`);

      const { data: categoria } = await u.cliente
        .from("categorias")
        .select("id")
        .eq("nombre", "Intereses")
        .eq("tipo", "ingreso")
        .single();
      const intereses = categoria!.id as string;

      const argumentos = argumentosPrestamo(u, cuenta, "Camila");
      const { error: errorPrestamo } = await u.cliente.rpc("crear_prestamo", argumentos);
      if (errorPrestamo) throw new Error(`No se pudo crear el préstamo: ${errorPrestamo.message}`);

      const { error: errorAbono } = await u.cliente.rpc(
        "registrar_abono",
        argumentosAbono(u, argumentos.p_cuenta_id, cuenta, intereses),
      );
      if (errorAbono) throw new Error(`No se pudo abonar: ${errorAbono.message}`);

      // Un cambio de fecha acordada para que haya fila en prestamos_cambios.
      const { error: errorFecha } = await u.cliente
        .from("prestamos")
        .update({ fecha_acordada: "2030-01-01" })
        .eq("cuenta_id", argumentos.p_cuenta_id);
      if (errorFecha) throw new Error(`No se pudo cambiar la fecha: ${errorFecha.message}`);

      return { cuenta, prestamo: argumentos.p_cuenta_id, intereses };
    }

    beforeAll(async () => {
      datosA = await preparar(a, "Pres A");
      datosB = await preparar(b, "Pres B");
    });

    it("nadie ve cuentas de préstamo, prestamos, detalle, intereses ni historial ajenos", async () => {
      for (const [u, otro, propio] of [
        [a, b, datosA],
        [b, a, datosB],
      ] as const) {
        const { data: cuentasPrestamo, error: errorCuentas } = await u.cliente
          .from("cuentas")
          .select("id, usuario_id")
          .in("tipo", ["prestamo_otorgado", "deuda_contraida"]);
        expect(errorCuentas).toBeNull();
        expect(cuentasPrestamo).toEqual([{ id: propio.prestamo, usuario_id: u.id }]);

        for (const tabla of ["prestamos", "prestamos_intereses", "prestamos_cambios"]) {
          const { data, error } = await u.cliente.from(tabla).select("usuario_id");
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.some((f) => f.usuario_id === otro.id)).toBe(false);
        }

        const { data: detalle, error: errorDetalle } = await u.cliente
          .from("prestamos_detalle")
          .select("id");
        expect(errorDetalle).toBeNull();
        expect(detalle).toEqual([{ id: propio.prestamo }]);
      }
    });

    it("crear_prestamo con la cuenta propia ajena lanza CUENTA_INVALIDA", async () => {
      const argumentos = argumentosPrestamo(a, datosB.cuenta, "Intruso");
      const { error } = await a.cliente.rpc("crear_prestamo", argumentos);
      expect(error?.message).toBe("CUENTA_INVALIDA:cuentaId");

      const { data } = await admin.from("cuentas").select("id").eq("id", argumentos.p_cuenta_id);
      expect(data).toEqual([]);
    });

    it("registrar_abono sobre el préstamo ajeno lanza PRESTAMO_NO_ENCONTRADO", async () => {
      const argumentos = argumentosAbono(a, datosB.prestamo, datosA.cuenta, datosA.intereses);
      const { error } = await a.cliente.rpc("registrar_abono", argumentos);
      expect(error?.message).toBe("PRESTAMO_NO_ENCONTRADO");

      const { data } = await admin
        .from("movimientos")
        .select("id")
        .in("id", [argumentos.p_capital_id, argumentos.p_interes_id]);
      expect(data).toEqual([]);
    });

    it("UPDATE de prestamos ajeno afecta 0 filas", async () => {
      const { data, error } = await a.cliente
        .from("prestamos")
        .update({ fecha_acordada: "2031-01-01" })
        .eq("cuenta_id", datosB.prestamo)
        .select("cuenta_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: real } = await admin
        .from("prestamos")
        .select("fecha_acordada")
        .eq("cuenta_id", datosB.prestamo)
        .single();
      expect(real?.fecha_acordada).toBe("2030-01-01");
    });

    it("INSERT directo en cuentas con tipo de préstamo falla por RLS", async () => {
      const id = randomUUID();
      const { error } = await a.cliente.from("cuentas").insert({
        id,
        nombre: "Directo",
        tipo: "prestamo_otorgado",
        saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(a.id, id, "saldo_inicial")),
      });
      expect(error?.code).toBe("42501");
    });

    it("UPDATE directo de tasa_mensual_cpb falla por permisos", async () => {
      const { error } = await a.cliente
        .from("prestamos")
        .update({ tasa_mensual_cpb: 500 })
        .eq("cuenta_id", datosA.prestamo);
      expect(error?.code).toBe("42501");

      const { data: real } = await admin
        .from("prestamos")
        .select("tasa_mensual_cpb")
        .eq("cuenta_id", datosA.prestamo)
        .single();
      expect(real?.tasa_mensual_cpb).toBe(100);
    });

    it("INSERT directo en prestamos o prestamos_intereses falla", async () => {
      const { error: errorPrestamo } = await a.cliente
        .from("prestamos")
        .insert({ cuenta_id: datosA.cuenta, tasa_mensual_cpb: 0 });
      expect(errorPrestamo).not.toBeNull();

      const { data: movimiento } = await a.cliente
        .from("movimientos")
        .select("id")
        .eq("tipo", "gasto")
        .limit(1)
        .single();
      const { error: errorInteres } = await a.cliente
        .from("prestamos_intereses")
        .insert({ movimiento_id: movimiento!.id, prestamo_id: datosA.prestamo });
      expect(errorInteres).not.toBeNull();
    });
  });

  describe("trm (SPEC 09)", () => {
    const filaA = { vigente_desde: "2026-01-10", vigente_hasta: "2026-01-12", valor_cent: 400000 };
    const filaB = { vigente_desde: "2026-01-10", vigente_hasta: "2026-01-12", valor_cent: 410000 };

    beforeAll(async () => {
      const { error: errorA } = await a.cliente.from("trm").insert(filaA);
      if (errorA) throw new Error(`No se pudo sembrar trm de A: ${errorA.message}`);
      const { error: errorB } = await b.cliente.from("trm").insert(filaB);
      if (errorB) throw new Error(`No se pudo sembrar trm de B: ${errorB.message}`);
    });

    it("cada usuario ve solo su fila de trm", async () => {
      for (const [u, fila] of [
        [a, filaA],
        [b, filaB],
      ] as const) {
        const { data, error } = await u.cliente.from("trm").select("usuario_id, valor_cent");
        expect(error).toBeNull();
        expect(data).toEqual([{ usuario_id: u.id, valor_cent: fila.valor_cent }]);
      }
    });

    it("INSERT con usuario_id ajeno falla", async () => {
      const { error } = await a.cliente.from("trm").insert({
        usuario_id: b.id,
        vigente_desde: "2026-02-01",
        vigente_hasta: "2026-02-01",
        valor_cent: 1,
      });
      expect(error?.code).toBe("42501");
      const { data } = await admin.from("trm").select("vigente_desde").eq("usuario_id", b.id);
      expect(data).toEqual([{ vigente_desde: filaB.vigente_desde }]);
    });

    it("UPDATE y DELETE, propios o ajenos, afectan 0 filas", async () => {
      for (const duenio of [a, b]) {
        const { data: actualizadas, error: errorUpdate } = await a.cliente
          .from("trm")
          .update({ valor_cent: 1 })
          .eq("usuario_id", duenio.id)
          .select("usuario_id");
        expect(errorUpdate).toBeNull();
        expect(actualizadas).toEqual([]);

        const { data: borradas, error: errorDelete } = await a.cliente
          .from("trm")
          .delete()
          .eq("usuario_id", duenio.id)
          .select("usuario_id");
        expect(errorDelete).toBeNull();
        expect(borradas).toEqual([]);
      }

      const { data: reales } = await admin
        .from("trm")
        .select("usuario_id, valor_cent")
        .in("usuario_id", [a.id, b.id]);
      expect(reales).toHaveLength(2);
      expect(reales).toEqual(
        expect.arrayContaining([
          { usuario_id: a.id, valor_cent: filaA.valor_cent },
          { usuario_id: b.id, valor_cent: filaB.valor_cent },
        ]),
      );
    });
  });

  describe("inversiones (SPEC 10)", () => {
    type Datos = { cuenta: string; activo: string; operacion: string };
    let datosA: Datos;
    let datosB: Datos;
    const hoy = new Date().toISOString().slice(0, 10);

    const cifrarOperacion = (u: Usuario, id: string, columna: "cantidad" | "monto", v: bigint) =>
      cifrador().cifrar(v, contexto.operacion(u.id, id, columna));

    async function preparar(u: Usuario, nombre: string): Promise<Datos> {
      const cuenta = randomUUID();
      const activo = randomUUID();
      const operacion = randomUUID();
      const { error } = await u.cliente.rpc("crear_inversion", {
        p_cuenta_id: cuenta,
        p_nombre: nombre,
        p_moneda: "USD",
        p_saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(u.id, cuenta, "saldo_inicial")),
        p_posiciones: [
          {
            operacion_id: operacion,
            activo_id: activo,
            simbolo: "VOO",
            nombre: "Vanguard S&P 500 ETF",
            cantidad: cifrarOperacion(u, operacion, "cantidad", 200000000n),
            monto: cifrarOperacion(u, operacion, "monto", 100000n),
            fecha: hoy,
            precio_cent: 50000,
          },
        ],
      });
      if (error) throw new Error(`No se pudo crear la inversión: ${error.message}`);

      // Una edición para que haya fila en inversion_operaciones_cambios.
      const { error: errorEdicion } = await u.cliente
        .from("inversion_operaciones")
        .update({ monto: cifrarOperacion(u, operacion, "monto", 90000n) })
        .eq("id", operacion);
      if (errorEdicion) throw new Error(`No se pudo editar: ${errorEdicion.message}`);

      // Un precio manual además del primero.
      const { error: errorPrecio } = await u.cliente
        .from("inversion_precios")
        .insert({ activo_id: activo, precio_cent: 56240, fecha: hoy });
      if (errorPrecio) throw new Error(`No se pudo insertar el precio: ${errorPrecio.message}`);

      return { cuenta, activo, operacion };
    }

    beforeAll(async () => {
      datosA = await preparar(a, "Inv A");
      datosB = await preparar(b, "Inv B");
    });

    it("nadie ve cuentas de inversión, activos, operaciones, historial ni precios ajenos", async () => {
      for (const [u, otro, propio] of [
        [a, b, datosA],
        [b, a, datosB],
      ] as const) {
        const { data: cuentas, error: errorCuentas } = await u.cliente
          .from("cuentas")
          .select("id, usuario_id")
          .eq("tipo", "inversion");
        expect(errorCuentas).toBeNull();
        expect(cuentas).toEqual([{ id: propio.cuenta, usuario_id: u.id }]);

        for (const tabla of [
          "inversion_activos",
          "inversion_operaciones",
          "inversion_operaciones_cambios",
          "inversion_precios",
        ]) {
          const { data, error } = await u.cliente.from(tabla).select("usuario_id");
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.some((f) => f.usuario_id === otro.id)).toBe(false);
        }
      }
    });

    it("registrar_operacion sobre la cuenta ajena lanza INVERSION_NO_ENCONTRADA", async () => {
      const operacion = randomUUID();
      const { error } = await a.cliente.rpc("registrar_operacion", {
        p_operacion_id: operacion,
        p_cuenta_id: datosB.cuenta,
        p_activo_id: randomUUID(),
        p_simbolo: "BTC",
        p_nombre: "Bitcoin",
        p_clase: "inicial",
        p_cantidad: cifrarOperacion(a, operacion, "cantidad", 1n),
        p_monto: cifrarOperacion(a, operacion, "monto", 1n),
        p_fecha: hoy,
        p_precio_cent: 1,
      });
      expect(error?.message).toBe("INVERSION_NO_ENCONTRADA");

      const { data } = await admin.from("inversion_operaciones").select("id").eq("id", operacion);
      expect(data).toEqual([]);
    });

    it("INSERT de un precio sobre el activo ajeno falla por la FK", async () => {
      const { error } = await a.cliente
        .from("inversion_precios")
        .insert({ activo_id: datosB.activo, precio_cent: 1, fecha: hoy });
      expect(error?.code).toBe("23503");

      const { data } = await admin
        .from("inversion_precios")
        .select("precio_cent")
        .eq("activo_id", datosB.activo)
        .eq("precio_cent", 1);
      expect(data).toEqual([]);
    });

    it("UPDATE y DELETE de una operación ajena afectan 0 filas", async () => {
      const { data: actualizadas, error: errorUpdate } = await a.cliente
        .from("inversion_operaciones")
        .update({ fecha: "2020-01-01" })
        .eq("id", datosB.operacion)
        .select("id");
      expect(errorUpdate).toBeNull();
      expect(actualizadas).toEqual([]);

      const { data: borradas, error: errorDelete } = await a.cliente
        .from("inversion_operaciones")
        .delete()
        .eq("id", datosB.operacion)
        .select("id");
      expect(errorDelete).toBeNull();
      expect(borradas).toEqual([]);

      const { data: real } = await admin
        .from("inversion_operaciones")
        .select("fecha")
        .eq("id", datosB.operacion)
        .single();
      expect(real?.fecha).toBe(hoy);
    });

    it("INSERT directo en cuentas con tipo inversion falla por RLS", async () => {
      const id = randomUUID();
      const { error } = await a.cliente.from("cuentas").insert({
        id,
        nombre: "Directa",
        tipo: "inversion",
        saldo_inicial: cifrador().cifrar(0n, contexto.cuenta(a.id, id, "saldo_inicial")),
      });
      expect(error?.code).toBe("42501");
    });

    it("UPDATE de clase o activo_id falla por permisos", async () => {
      const { error: errorClase } = await a.cliente
        .from("inversion_operaciones")
        .update({ clase: "compra" })
        .eq("id", datosA.operacion);
      expect(errorClase?.code).toBe("42501");

      const { error: errorActivo } = await a.cliente
        .from("inversion_operaciones")
        .update({ activo_id: randomUUID() })
        .eq("id", datosA.operacion);
      expect(errorActivo?.code).toBe("42501");

      const { data: real } = await admin
        .from("inversion_operaciones")
        .select("clase, activo_id")
        .eq("id", datosA.operacion)
        .single();
      expect(real).toEqual({ clase: "inicial", activo_id: datosA.activo });
    });

    it("UPDATE de moneda lanza MONEDA_FIJA", async () => {
      const { error } = await a.cliente
        .from("cuentas")
        .update({ moneda: "COP" })
        .eq("id", datosA.cuenta);
      expect(error?.message).toBe("MONEDA_FIJA");
    });

    it("UPDATE y DELETE de precios, propios o ajenos, afectan 0 filas", async () => {
      for (const activo of [datosA.activo, datosB.activo]) {
        const { data: actualizadas, error: errorUpdate } = await a.cliente
          .from("inversion_precios")
          .update({ precio_cent: 1 })
          .eq("activo_id", activo)
          .select("id");
        expect(errorUpdate).toBeNull();
        expect(actualizadas).toEqual([]);

        const { data: borradas, error: errorDelete } = await a.cliente
          .from("inversion_precios")
          .delete()
          .eq("activo_id", activo)
          .select("id");
        expect(errorDelete).toBeNull();
        expect(borradas).toEqual([]);
      }

      const { data: reales } = await admin
        .from("inversion_precios")
        .select("precio_cent")
        .in("activo_id", [datosA.activo, datosB.activo]);
      expect(reales).toHaveLength(4);
    });
  });
});
