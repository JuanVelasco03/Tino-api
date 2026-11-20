/**
 * Movimientos con el cliente del usuario (RN-19). Lee de la vista
 * `movimientos_detalle` (RLS por security_invoker) y escribe solo por las
 * funciones `registrar_movimiento`, `reemplazar_movimiento` y
 * `eliminar_movimiento`: la tabla no tiene políticas de escritura.
 *
 * Montos: `numeric` viaja como texto (`::text` al leer, string al escribir) y
 * se convierte a `bigint`. Si llegara un number, falla: nunca se acepta.
 */
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPOS_MOVIMIENTO,
  type Movimiento,
  type MovimientoEntrada,
  type Ref,
  type TipoMovimiento,
} from "../../domain/movimiento/movimiento.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

const COLUMNAS =
  "id, tipo, monto::text, moneda, tasa::text, fecha, descripcion, nota, " +
  "cuenta_origen_id, cuenta_origen_nombre, cuenta_destino_id, cuenta_destino_nombre, " +
  "categoria_id, categoria_nombre, partes, creado_en, actualizado_en";

type Funciones = Database["public"]["Functions"];

type FilaDetalle = {
  id: string | null;
  tipo: string | null;
  monto: unknown;
  moneda: string | null;
  tasa: unknown;
  fecha: string | null;
  descripcion: string | null;
  nota: string | null;
  cuenta_origen_id: string | null;
  cuenta_origen_nombre: string | null;
  cuenta_destino_id: string | null;
  cuenta_destino_nombre: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  partes: unknown;
  creado_en: string | null;
  actualizado_en: string | null;
};

function requerido<T>(valor: T | null, columna: string): T {
  if (valor === null) throw new Error(`movimientos_detalle.${columna} llegó nulo.`);
  return valor;
}

/** `numeric` como texto de entero. Un number o un decimal es un defecto, no un redondeo. */
function aBigint(valor: unknown, columna: string): bigint {
  if (typeof valor !== "string" || !/^-?\d+$/.test(valor)) {
    throw new Error(`movimientos_detalle.${columna} no llegó como texto entero: ${String(valor)}`);
  }
  return BigInt(valor);
}

function aTipo(valor: string | null): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

function aRef(id: string | null, nombre: string | null): Ref | null {
  return id === null ? null : { id, nombre: requerido(nombre, "nombre") };
}

function aPartes(valor: unknown): Movimiento["partes"] {
  if (!Array.isArray(valor)) throw new Error("movimientos_detalle.partes no es una lista.");
  return valor.map((p: unknown) => {
    const parte = p as { categoria_id?: unknown; categoria_nombre?: unknown; monto?: unknown };
    if (typeof parte.categoria_id !== "string" || typeof parte.categoria_nombre !== "string") {
      throw new Error("movimientos_detalle.partes tiene una parte mal formada.");
    }
    return {
      categoria: { id: parte.categoria_id, nombre: parte.categoria_nombre },
      monto: aBigint(parte.monto, "partes.monto"),
    };
  });
}

/** `numeric(18,6)` como texto sin ceros sobrantes: "1.000000" → "1", "4012.500000" → "4012.5". */
function aTasa(valor: unknown): string {
  if (typeof valor !== "string" || !/^\d+(\.\d+)?$/.test(valor)) {
    throw new Error(`movimientos_detalle.tasa no llegó como texto decimal: ${String(valor)}`);
  }
  return valor.includes(".") ? valor.replace(/0+$/, "").replace(/\.$/, "") : valor;
}

function aMovimiento(fila: FilaDetalle): Movimiento {
  return {
    id: requerido(fila.id, "id"),
    tipo: aTipo(fila.tipo),
    monto: aBigint(fila.monto, "monto"),
    moneda: "COP",
    tasa: aTasa(fila.tasa),
    fecha: requerido(fila.fecha, "fecha"),
    descripcion: fila.descripcion,
    nota: fila.nota,
    cuentaOrigen: aRef(fila.cuenta_origen_id, fila.cuenta_origen_nombre),
    cuentaDestino: aRef(fila.cuenta_destino_id, fila.cuenta_destino_nombre),
    categoria: aRef(fila.categoria_id, fila.categoria_nombre),
    partes: aPartes(fila.partes),
    creadoEn: new Date(requerido(fila.creado_en, "creado_en")),
    actualizadoEn: new Date(requerido(fila.actualizado_en, "actualizado_en")),
  };
}

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  const deFuncion = desdeFuncion(error);
  if (deFuncion) return deFuncion;
  if (error.code === "23503") {
    if (error.message.includes("movimientos_cuenta_origen_fkey")) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaOrigenId");
    }
    if (error.message.includes("movimientos_cuenta_destino_fkey")) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaDestinoId");
    }
    if (error.message.includes("movimientos_categoria_fkey")) {
      return new ErrorApi("CATEGORIA_INVALIDA", "categoriaId");
    }
    if (error.message.includes("movimiento_partes_categoria_fkey")) {
      return new ErrorApi("CATEGORIA_INVALIDA", "partes");
    }
  }
  return errorInterno(error);
}

/**
 * Argumentos comunes de las funciones de escritura. Los tipos generados
 * declaran los opcionales como no nulos y `numeric` como number; se envía
 * null y string, que PostgREST acepta.
 */
function argumentos(m: MovimientoEntrada) {
  return {
    p_tipo: m.tipo,
    p_monto: m.monto.toString(),
    p_fecha: m.fecha,
    p_descripcion: m.descripcion,
    p_nota: m.nota,
    p_cuenta_origen_id: m.cuentaOrigenId,
    p_cuenta_destino_id: m.cuentaDestinoId,
    p_categoria_id: m.categoriaId,
    p_partes:
      m.partes === null
        ? null
        : m.partes.map((p) => ({ categoria_id: p.categoriaId, monto: p.monto.toString() })),
  };
}

@Injectable()
export class MovimientosRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  /** Movimientos con fecha entre `desde` y `hasta` (inclusive), por fecha y registro, el más reciente primero. */
  async listarEntre(token: string, desde: string, hasta: string): Promise<Movimiento[]> {
    const { data, error } = await this.cliente(token)
      .from("movimientos_detalle")
      .select(COLUMNAS)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false });
    if (error) throw traducir(error);
    return (data as unknown as FilaDetalle[]).map(aMovimiento);
  }

  /** `null` si no existe o no es visible por RLS (movimiento ajeno). */
  async obtener(token: string, id: string): Promise<Movimiento | null> {
    const { data, error } = await this.cliente(token)
      .from("movimientos_detalle")
      .select(COLUMNAS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : aMovimiento(data as unknown as FilaDetalle);
  }

  /** Devuelve el id del movimiento creado. */
  async registrar(token: string, entrada: MovimientoEntrada): Promise<string> {
    const { data, error } = await this.cliente(token).rpc(
      "registrar_movimiento",
      argumentos(entrada) as unknown as Funciones["registrar_movimiento"]["Args"],
    );
    if (error) throw traducir(error);
    return data;
  }

  async reemplazar(token: string, id: string, entrada: MovimientoEntrada): Promise<void> {
    const { error } = await this.cliente(token).rpc("reemplazar_movimiento", {
      p_id: id,
      ...argumentos(entrada),
    } as unknown as Funciones["reemplazar_movimiento"]["Args"]);
    if (error) throw traducir(error);
  }

  async eliminar(token: string, id: string): Promise<void> {
    const { error } = await this.cliente(token).rpc("eliminar_movimiento", { p_id: id });
    if (error) throw traducir(error);
  }
}
