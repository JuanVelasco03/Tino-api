/**
 * Cuentas de inversión con el cliente del usuario (RN-19): las políticas RLS
 * garantizan que solo toca sus propias filas (RN-12).
 *
 * - Lectura: cuentas de tipo `inversion`, `inversion_activos`,
 *   `inversion_operaciones` e `inversion_precios`.
 * - Escritura: `crear_inversion` (cuenta, activos, operaciones iniciales y
 *   primeros precios) y `registrar_operacion` (operación y, si el activo es
 *   nuevo, el activo y su primer precio), atómicas. Las ediciones y
 *   eliminaciones de operaciones van por UPDATE y DELETE directos con RLS; el
 *   historial lo escribe el trigger (RN-13). Los precios manuales, por INSERT.
 * - Precios automáticos (SPEC 11): `guardar_precios_automaticos` guarda los
 *   cierres e intradías del proveedor y marca los activos consultados; el modo
 *   de cotización del activo, por UPDATE directo con permisos de columna.
 *
 * Montos cifrados (SPEC 05): el efectivo inicial con la AAD de la cuenta; la
 * cantidad y el monto de cada operación con
 * `inversion_operaciones|<columna>|<id>`. El precio no se cifra y viaja como
 * texto: nunca pasa por `number` (REGLAS §6). Los ids los genera la API.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPO_INVERSION,
  esClaseActivo,
  esClaseOperacion,
  esCotizacion,
  esMoneda,
  esOrigenPrecio,
  type Activo,
  type ClaseActivo,
  type ClaseOperacion,
  type Cotizacion,
  type Moneda,
  type Operacion,
  type Precio,
} from "../../domain/inversion/inversion.js";
import type { PrecioObtenido } from "../../domain/precio/precio.js";
import type { InversionPatrimonio } from "../../domain/resumen/resumen.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database, TablesInsert, TablesUpdate } from "./tipos.js";

type Funciones = Database["public"]["Functions"];

const COLUMNAS_CUENTA = "id, nombre, moneda, saldo_inicial, posicion, archivada_en, creado_en";
const COLUMNAS_ACTIVO =
  "id, cuenta_id, simbolo, nombre, creado_en, cotizacion, clase, simbolo_fuente, consultado_en";
const COLUMNAS_OPERACION =
  "id, cuenta_id, activo_id, clase, cantidad, monto, fecha, creado_en, actualizado_en";

/** Cuenta de inversión sin saldo: el efectivo y el valor los calcula el dominio (RN-01). */
export type CuentaInversion = {
  id: string;
  nombre: string;
  moneda: Moneda;
  saldoInicial: bigint;
  posicion: number;
  archivadaEn: Date | null;
  creadoEn: Date;
};

export type OperacionLeida = Operacion & { cuentaId: string };

/** Modo con que nace un activo: automático si el proveedor lo cubre (SPEC 11). */
export type CotizacionNueva =
  | { cotizacion: "automatica"; clase: ClaseActivo; simboloFuente: string }
  | { cotizacion: "manual"; clase: null; simboloFuente: null };

export const COTIZACION_MANUAL: CotizacionNueva = {
  cotizacion: "manual",
  clase: null,
  simboloFuente: null,
};

export type PosicionInicialNueva = {
  simbolo: string;
  nombre: string;
  cotizacion: CotizacionNueva;
  cantidad: bigint;
  monto: bigint;
  fecha: string;
  precio: bigint;
};

export type InversionNueva = {
  nombre: string;
  moneda: Moneda;
  efectivoInicial: bigint;
  posiciones: readonly PosicionInicialNueva[];
};

export type OperacionNueva = {
  cuentaId: string;
  clase: ClaseOperacion;
  simbolo: string;
  nombre: string | null;
  cantidad: bigint;
  monto: bigint;
  fecha: string;
  /** Primer precio, si el activo es nuevo. */
  precio: bigint;
  /** Modo, si el activo es nuevo. */
  cotizacion: CotizacionNueva;
};

/**
 * Cambio de modo del activo (SPEC 11). A automático: con su clase y su símbolo
 * en el proveedor. A manual: sin símbolo, conservando la clase.
 */
export type CambioCotizacion =
  | { cotizacion: "automatica"; clase: ClaseActivo; simboloFuente: string }
  | { cotizacion: "manual" };

export type CambioOperacionDatos = { cantidad?: bigint; monto?: bigint; fecha?: string };

type FilaCuenta = {
  id: string;
  nombre: string;
  moneda: string;
  saldo_inicial: string;
  posicion: number;
  archivada_en: string | null;
  creado_en: string;
};

type FilaActivo = {
  id: string;
  cuenta_id: string;
  simbolo: string;
  nombre: string;
  creado_en: string;
  cotizacion: string;
  clase: string | null;
  simbolo_fuente: string | null;
  consultado_en: string | null;
};

type FilaOperacion = {
  id: string;
  cuenta_id: string;
  activo_id: string;
  clase: string;
  cantidad: string;
  monto: string;
  fecha: string;
  creado_en: string;
  actualizado_en: string;
};

type FilaPrecio = {
  activo_id: string;
  precio_cent: string;
  fecha: string;
  origen: string;
  cotizado_en: string;
};

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  const deFuncion = desdeFuncion(error);
  if (deFuncion) return deFuncion;
  if (error.code === "23505" && error.message.includes("cuentas_nombre_unico")) {
    return new ErrorApi("NOMBRE_DUPLICADO");
  }
  if (error.code === "23505" && error.message.includes("inversion_activos_simbolo_unico")) {
    return new ErrorApi("ACTIVO_DUPLICADO");
  }
  if (error.code === "23503" && error.message.includes("inversion_precios_activo_fkey")) {
    return new ErrorApi("ACTIVO_NO_ENCONTRADO");
  }
  return errorInterno(error);
}

function aMoneda(valor: string): Moneda {
  if (!esMoneda(valor)) throw new Error(`Moneda desconocida: ${valor}`);
  return valor;
}

function aClase(valor: string): ClaseOperacion {
  if (!esClaseOperacion(valor)) throw new Error(`Clase de operación desconocida: ${valor}`);
  return valor;
}

function aCotizacion(valor: string): Cotizacion {
  if (!esCotizacion(valor)) throw new Error(`Cotización desconocida: ${valor}`);
  return valor;
}

function aClaseActivo(valor: string | null): ClaseActivo | null {
  if (valor === null) return null;
  if (!esClaseActivo(valor)) throw new Error(`Clase de activo desconocida: ${valor}`);
  return valor;
}

function aActivo(f: FilaActivo): Activo {
  return {
    id: f.id,
    cuentaId: f.cuenta_id,
    simbolo: f.simbolo,
    nombre: f.nombre,
    creadoEn: new Date(f.creado_en),
    cotizacion: aCotizacion(f.cotizacion),
    clase: aClaseActivo(f.clase),
    simboloFuente: f.simbolo_fuente,
    consultadoEn: f.consultado_en === null ? null : new Date(f.consultado_en),
  };
}

@Injectable()
export class InversionesRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aCuenta(usuarioId: string, f: FilaCuenta): CuentaInversion {
    return {
      id: f.id,
      nombre: f.nombre,
      moneda: aMoneda(f.moneda),
      saldoInicial: this.cifrador.descifrar(
        f.saldo_inicial,
        contexto.cuenta(usuarioId, f.id, "saldo_inicial"),
      ),
      posicion: f.posicion,
      archivadaEn: f.archivada_en === null ? null : new Date(f.archivada_en),
      creadoEn: new Date(f.creado_en),
    };
  }

  private aOperacion(usuarioId: string, f: FilaOperacion): OperacionLeida {
    return {
      id: f.id,
      cuentaId: f.cuenta_id,
      activoId: f.activo_id,
      clase: aClase(f.clase),
      cantidad: this.cifrador.descifrar(
        f.cantidad,
        contexto.operacion(usuarioId, f.id, "cantidad"),
      ),
      monto: this.cifrador.descifrar(f.monto, contexto.operacion(usuarioId, f.id, "monto")),
      fecha: f.fecha,
      creadoEn: new Date(f.creado_en),
      actualizadoEn: new Date(f.actualizado_en),
    };
  }

  /** Inversiones del usuario; sin archivadas salvo que se pidan. Orden de Cuentas. */
  async listarCuentas(
    usuario: UsuarioAutenticado,
    incluirArchivadas = false,
  ): Promise<CuentaInversion[]> {
    let consulta = this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS_CUENTA)
      .eq("tipo", TIPO_INVERSION);
    if (!incluirArchivadas) consulta = consulta.is("archivada_en", null);
    const { data, error } = await consulta.order("posicion").order("creado_en");
    if (error) throw traducir(error);
    return (data as FilaCuenta[]).map((f) => this.aCuenta(usuario.id, f));
  }

  /** `null` si no existe, es ajena (RLS) o no es una inversión. Archivadas incluidas. */
  async obtenerCuenta(usuario: UsuarioAutenticado, id: string): Promise<CuentaInversion | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS_CUENTA)
      .eq("id", id)
      .eq("tipo", TIPO_INVERSION)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : this.aCuenta(usuario.id, data as FilaCuenta);
  }

  /** Activos de las cuentas `cuentaIds` (todas las del usuario si no se dan). */
  async activos(usuario: UsuarioAutenticado, cuentaIds?: readonly string[]): Promise<Activo[]> {
    if (cuentaIds?.length === 0) return [];
    let consulta = this.cliente(usuario.token).from("inversion_activos").select(COLUMNAS_ACTIVO);
    if (cuentaIds !== undefined) consulta = consulta.in("cuenta_id", [...cuentaIds]);
    const { data, error } = await consulta;
    if (error) throw traducir(error);
    return (data as FilaActivo[]).map(aActivo);
  }

  /**
   * Operaciones de las cuentas `cuentaIds` (todas si no se dan), descifradas,
   * por `fecha` desc y `creado_en` desc.
   */
  async operaciones(
    usuario: UsuarioAutenticado,
    cuentaIds?: readonly string[],
  ): Promise<OperacionLeida[]> {
    if (cuentaIds?.length === 0) return [];
    let consulta = this.cliente(usuario.token)
      .from("inversion_operaciones")
      .select(COLUMNAS_OPERACION);
    if (cuentaIds !== undefined) consulta = consulta.in("cuenta_id", [...cuentaIds]);
    const { data, error } = await consulta
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false });
    if (error) throw traducir(error);
    return (data as FilaOperacion[]).map((f) => this.aOperacion(usuario.id, f));
  }

  /** Precios de los activos `activoIds` (todos los del usuario si no se dan). */
  async precios(usuario: UsuarioAutenticado, activoIds?: readonly string[]): Promise<Precio[]> {
    if (activoIds?.length === 0) return [];
    let consulta = this.cliente(usuario.token)
      .from("inversion_precios")
      .select("activo_id, precio_cent::text, fecha, origen, cotizado_en");
    if (activoIds !== undefined) consulta = consulta.in("activo_id", [...activoIds]);
    const { data, error } = await consulta;
    if (error) throw traducir(error);
    return (data as unknown as FilaPrecio[]).map((f) => {
      if (!esOrigenPrecio(f.origen)) throw new Error(`Origen de precio desconocido: ${f.origen}`);
      return {
        activoId: f.activo_id,
        precio: BigInt(f.precio_cent),
        fecha: f.fecha,
        origen: f.origen,
        cotizadoEn: new Date(f.cotizado_en),
      };
    });
  }

  /**
   * Activos, operaciones y precios agrupados por cuenta, en lecturas
   * paralelas (todas las inversiones del usuario si no se dan `cuentaIds`).
   */
  async datos(
    usuario: UsuarioAutenticado,
    cuentaIds?: readonly string[],
  ): Promise<Map<string, InversionPatrimonio>> {
    if (cuentaIds?.length === 0) return new Map();
    const [activos, operaciones, precios] = await Promise.all([
      this.activos(usuario, cuentaIds),
      this.operaciones(usuario, cuentaIds),
      // Sin filtro de cuenta: los precios de un activo ajeno a `cuentaIds` se ignoran al agrupar.
      this.precios(usuario),
    ]);
    const cuentaDeActivo = new Map(activos.map((a) => [a.id, a.cuentaId]));
    const porCuenta = new Map<
      string,
      { activos: Activo[]; operaciones: Operacion[]; precios: Precio[] }
    >();
    const de = (cuentaId: string) => {
      let grupo = porCuenta.get(cuentaId);
      if (!grupo) {
        grupo = { activos: [], operaciones: [], precios: [] };
        porCuenta.set(cuentaId, grupo);
      }
      return grupo;
    };
    for (const a of activos) de(a.cuentaId).activos.push(a);
    for (const op of operaciones) de(op.cuentaId).operaciones.push(op);
    for (const p of precios) {
      const cuentaId = cuentaDeActivo.get(p.activoId);
      if (cuentaId !== undefined) de(cuentaId).precios.push(p);
    }
    return porCuenta;
  }

  /** Crea la inversión en una transacción. Devuelve su id (lo genera la API). */
  async crear(usuario: UsuarioAutenticado, datos: InversionNueva): Promise<string> {
    const cuentaId = randomUUID();
    const posiciones = datos.posiciones.map((p) => {
      const operacionId = randomUUID();
      return {
        operacion_id: operacionId,
        activo_id: randomUUID(),
        simbolo: p.simbolo,
        nombre: p.nombre,
        cotizacion: p.cotizacion.cotizacion,
        clase: p.cotizacion.clase,
        simbolo_fuente: p.cotizacion.simboloFuente,
        cantidad: this.cifrador.cifrar(
          p.cantidad,
          contexto.operacion(usuario.id, operacionId, "cantidad"),
        ),
        monto: this.cifrador.cifrar(p.monto, contexto.operacion(usuario.id, operacionId, "monto")),
        fecha: p.fecha,
        precio_cent: p.precio.toString(),
      };
    });
    const { error } = await this.cliente(usuario.token).rpc("crear_inversion", {
      p_cuenta_id: cuentaId,
      p_nombre: datos.nombre,
      p_moneda: datos.moneda,
      p_saldo_inicial: this.cifrador.cifrar(
        datos.efectivoInicial,
        contexto.cuenta(usuario.id, cuentaId, "saldo_inicial"),
      ),
      p_posiciones: posiciones,
    });
    if (error) throw traducir(error);
    return cuentaId;
  }

  /** Registra la operación en una transacción. Devuelve el id del activo. */
  async registrarOperacion(usuario: UsuarioAutenticado, datos: OperacionNueva): Promise<string> {
    const operacionId = randomUUID();
    const args = {
      p_operacion_id: operacionId,
      p_cuenta_id: datos.cuentaId,
      p_activo_id: randomUUID(),
      p_simbolo: datos.simbolo,
      p_nombre: datos.nombre,
      p_clase: datos.clase,
      p_cantidad: this.cifrador.cifrar(
        datos.cantidad,
        contexto.operacion(usuario.id, operacionId, "cantidad"),
      ),
      p_monto: this.cifrador.cifrar(
        datos.monto,
        contexto.operacion(usuario.id, operacionId, "monto"),
      ),
      p_fecha: datos.fecha,
      // bigint como texto: PostgREST lo convierte sin pasar por number.
      p_precio_cent: datos.precio.toString(),
      p_cotizacion: datos.cotizacion.cotizacion,
      p_clase_activo: datos.cotizacion.clase,
      p_simbolo_fuente: datos.cotizacion.simboloFuente,
    };
    const { data, error } = await this.cliente(usuario.token).rpc(
      "registrar_operacion",
      args as unknown as Funciones["registrar_operacion"]["Args"],
    );
    if (error) throw traducir(error);
    return data;
  }

  /**
   * UPDATE directo con RLS de la operación `id` de la cuenta `cuentaId`. Lo
   * que no cambió conserva su texto cifrado: el trigger del historial compara
   * las filas y no debe registrar cambios falsos (RN-13).
   */
  async actualizarOperacion(
    usuario: UsuarioAutenticado,
    actual: OperacionLeida,
    cambios: CambioOperacionDatos,
  ): Promise<void> {
    const guardada = await this.cliente(usuario.token)
      .from("inversion_operaciones")
      .select("cantidad, monto")
      .eq("id", actual.id)
      .maybeSingle();
    if (guardada.error) throw traducir(guardada.error);
    if (guardada.data === null) throw new ErrorApi("OPERACION_NO_ENCONTRADA");
    const textos = guardada.data as { cantidad: string; monto: string };
    const fila = {
      ...(cambios.cantidad === undefined
        ? {}
        : {
            cantidad: this.cifrador.cifrarSiCambia(
              cambios.cantidad,
              textos.cantidad,
              contexto.operacion(usuario.id, actual.id, "cantidad"),
            ),
          }),
      ...(cambios.monto === undefined
        ? {}
        : {
            monto: this.cifrador.cifrarSiCambia(
              cambios.monto,
              textos.monto,
              contexto.operacion(usuario.id, actual.id, "monto"),
            ),
          }),
      ...(cambios.fecha === undefined ? {} : { fecha: cambios.fecha }),
    } satisfies TablesUpdate<"inversion_operaciones">;
    const { data, error } = await this.cliente(usuario.token)
      .from("inversion_operaciones")
      .update(fila)
      .eq("id", actual.id)
      .eq("cuenta_id", actual.cuentaId)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("OPERACION_NO_ENCONTRADA");
  }

  /** DELETE directo con RLS; el trigger deja la foto en el historial. */
  async eliminarOperacion(
    usuario: UsuarioAutenticado,
    cuentaId: string,
    id: string,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("inversion_operaciones")
      .delete()
      .eq("id", id)
      .eq("cuenta_id", cuentaId)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("OPERACION_NO_ENCONTRADA");
  }

  /** INSERT directo de un precio manual. Un activo ajeno lo rechaza la FK compuesta. */
  async insertarPrecio(
    usuario: UsuarioAutenticado,
    activoId: string,
    precio: bigint,
    fecha: string,
  ): Promise<void> {
    const fila = { activo_id: activoId, precio_cent: precio.toString(), fecha, origen: "manual" };
    const { error } = await this.cliente(usuario.token)
      .from("inversion_precios")
      .insert(fila as unknown as TablesInsert<"inversion_precios">);
    if (error) throw traducir(error);
  }

  /**
   * Guarda lo que trajo el proveedor y marca los activos consultados, en una
   * transacción (SPEC 11). `consultados` incluye los que fallaron: así la
   * siguiente lectura no repite la consulta. La RLS limita todo a lo propio.
   */
  async guardarPreciosAutomaticos(
    usuario: UsuarioAutenticado,
    precios: readonly PrecioObtenido[],
    consultados: readonly string[],
  ): Promise<void> {
    if (precios.length === 0 && consultados.length === 0) return;
    const filas = precios.map((p) => ({
      activo_id: p.activoId,
      // bigint como texto: Postgres lo convierte sin pasar por number.
      precio_cent: p.precio.toString(),
      fecha: p.fecha,
      origen: p.origen,
      cotizado_en: p.cotizadoEn.toISOString(),
    }));
    const { error } = await this.cliente(usuario.token).rpc("guardar_precios_automaticos", {
      p_precios: filas,
      p_consultados: [...consultados],
    });
    if (error) throw traducir(error);
  }

  /**
   * UPDATE directo con RLS del modo del activo `activoId` de la cuenta
   * `cuentaId`; deja `consultado_en` en nulo. `false` si no hay tal activo.
   */
  async actualizarCotizacion(
    usuario: UsuarioAutenticado,
    cuentaId: string,
    activoId: string,
    cambio: CambioCotizacion,
  ): Promise<boolean> {
    const fila = (
      cambio.cotizacion === "automatica"
        ? {
            cotizacion: cambio.cotizacion,
            clase: cambio.clase,
            simbolo_fuente: cambio.simboloFuente,
            consultado_en: null,
          }
        : { cotizacion: cambio.cotizacion, simbolo_fuente: null, consultado_en: null }
    ) satisfies TablesUpdate<"inversion_activos">;
    const { data, error } = await this.cliente(usuario.token)
      .from("inversion_activos")
      .update(fila)
      .eq("id", activoId)
      .eq("cuenta_id", cuentaId)
      .select("id");
    if (error) throw traducir(error);
    return data.length > 0;
  }
}
