/**
 * Acceso a cuentas con el cliente del usuario: las políticas RLS de `cuentas`
 * garantizan que solo toca sus propias filas (RN-12, RN-19).
 *
 * Lee de la vista `cuentas_con_saldo` (única fuente del saldo, RN-01), escribe
 * en `cuentas` y reordena con `rpc('reordenar_cuentas')`.
 *
 * Montos: `numeric(19,0)` viaja siempre como texto (`::text` al leer, string
 * al escribir) y se convierte a `bigint`. Nunca pasa por `number`: un número
 * JSON pierde precisión por encima de 2^53.
 */
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPOS_EN_ALCANCE,
  type Cuenta,
  type TipoCuentaEnAlcance,
} from "../../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../../domain/cuenta/naturaleza.js";
import { ClienteSupabase } from "./cliente.js";
import type { Database, TablesInsert, TablesUpdate } from "./tipos.js";

const COLUMNAS =
  "id, nombre, tipo, detalle, saldo_inicial::text, saldo::text, cupo::text, posicion, archivada_en";

type FilaVista = {
  id: string | null;
  nombre: string | null;
  tipo: string | null;
  detalle: string | null;
  saldo_inicial: string | null;
  saldo: string | null;
  cupo: string | null;
  posicion: number | null;
  archivada_en: string | null;
};

export type DatosAlta = {
  nombre: string;
  tipo: TipoCuentaEnAlcance;
  detalle: string | null;
  saldoInicial: bigint;
  cupo: bigint | null;
};

export type DatosEdicion = {
  nombre?: string;
  tipo?: TipoCuentaEnAlcance;
  detalle?: string | null;
  saldoInicial?: bigint;
  cupo?: bigint;
};

/**
 * Los tipos generados declaran `numeric` como `number`. PostgREST acepta el
 * string, que es lo que se envía para no perder precisión.
 */
type ConMontosTexto<T> = {
  [K in keyof T]: K extends "saldo_inicial" | "cupo"
    ? string | Extract<T[K], null | undefined>
    : T[K];
};

function requerido<T>(valor: T | null, columna: string): T {
  if (valor === null) throw new Error(`cuentas_con_saldo.${columna} llegó nulo.`);
  return valor;
}

function aTipo(valor: string | null): TipoCuentaEnAlcance {
  const tipo = TIPOS_EN_ALCANCE.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de cuenta desconocido: ${valor}`);
  return tipo;
}

function aCuenta(fila: FilaVista): Cuenta {
  return {
    id: requerido(fila.id, "id"),
    nombre: requerido(fila.nombre, "nombre"),
    tipo: aTipo(fila.tipo),
    detalle: fila.detalle,
    saldoInicial: BigInt(requerido(fila.saldo_inicial, "saldo_inicial")),
    saldo: BigInt(requerido(fila.saldo, "saldo")),
    cupo: fila.cupo === null ? null : BigInt(fila.cupo),
    posicion: requerido(fila.posicion, "posicion"),
    archivadaEn: fila.archivada_en === null ? null : new Date(fila.archivada_en),
  };
}

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  if (error.code === "23505" && error.message.includes("cuentas_nombre_unico")) {
    return new ErrorApi("NOMBRE_DUPLICADO");
  }
  if (error.code === "P0001" && error.message === "CAMBIO_DE_NATURALEZA") {
    return new ErrorApi("CAMBIO_DE_NATURALEZA");
  }
  if (error.code === "P0001" && error.message === "ORDEN_INVALIDO") {
    return new ErrorApi("ORDEN_INVALIDO");
  }
  // El filtro lo convierte en ERROR_INTERNO; el detalle solo va al log.
  return new Error(`Postgres ${error.code}: ${error.message}`);
}

function filaEdicion(datos: DatosEdicion): ConMontosTexto<TablesUpdate<"cuentas">> {
  return {
    ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
    ...(datos.tipo === undefined ? {} : { tipo: datos.tipo }),
    ...(datos.detalle === undefined ? {} : { detalle: datos.detalle }),
    ...(datos.saldoInicial === undefined ? {} : { saldo_inicial: datos.saldoInicial.toString() }),
    ...(datos.cupo === undefined ? {} : { cupo: datos.cupo.toString() }),
  };
}

@Injectable()
export class CuentasRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  /** No archivadas, en el orden del usuario. */
  async listar(token: string): Promise<Cuenta[]> {
    const { data, error } = await this.cliente(token)
      .from("cuentas_con_saldo")
      .select(COLUMNAS)
      .is("archivada_en", null)
      .order("posicion")
      .order("creado_en");
    if (error) throw traducir(error);
    return data.map(aCuenta);
  }

  /** Archivadas, la más reciente primero. */
  async listarArchivadas(token: string): Promise<Cuenta[]> {
    const { data, error } = await this.cliente(token)
      .from("cuentas_con_saldo")
      .select(COLUMNAS)
      .not("archivada_en", "is", null)
      .order("archivada_en", { ascending: false });
    if (error) throw traducir(error);
    return data.map(aCuenta);
  }

  /** `null` si no existe o no es visible por RLS (cuenta ajena). */
  async obtener(token: string, id: string): Promise<Cuenta | null> {
    const { data, error } = await this.cliente(token)
      .from("cuentas_con_saldo")
      .select(COLUMNAS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : aCuenta(data);
  }

  private async obtenerExistente(token: string, id: string): Promise<Cuenta> {
    const cuenta = await this.obtener(token, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  /** `posicion` la asigna el trigger `asignar_posicion`; `usuario_id`, el default `auth.uid()`. */
  async crear(token: string, datos: DatosAlta): Promise<Cuenta> {
    const fila: ConMontosTexto<Omit<TablesInsert<"cuentas">, "posicion">> = {
      nombre: datos.nombre,
      tipo: datos.tipo,
      detalle: datos.detalle,
      saldo_inicial: datos.saldoInicial.toString(),
      cupo: datos.cupo === null ? null : datos.cupo.toString(),
    };
    const { data, error } = await this.cliente(token)
      .from("cuentas")
      .insert(fila as unknown as TablesInsert<"cuentas">)
      .select("id")
      .single();
    if (error) throw traducir(error);
    return this.obtenerExistente(token, data.id);
  }

  private async actualizarFila(
    token: string,
    id: string,
    fila: ConMontosTexto<TablesUpdate<"cuentas">>,
  ): Promise<Cuenta> {
    const { data, error } = await this.cliente(token)
      .from("cuentas")
      .update(fila as unknown as TablesUpdate<"cuentas">)
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return this.obtenerExistente(token, id);
  }

  actualizar(token: string, id: string, datos: DatosEdicion): Promise<Cuenta> {
    return this.actualizarFila(token, id, filaEdicion(datos));
  }

  async eliminar(token: string, id: string): Promise<void> {
    const { data, error } = await this.cliente(token)
      .from("cuentas")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
  }

  archivar(token: string, id: string): Promise<Cuenta> {
    return this.actualizarFila(token, id, { archivada_en: new Date().toISOString() });
  }

  /** El nombre nuevo, si llega, se aplica en la misma sentencia; el trigger la manda al final del grupo. */
  restaurar(token: string, id: string, nombre?: string): Promise<Cuenta> {
    return this.actualizarFila(token, id, {
      ...(nombre === undefined ? {} : { nombre }),
      archivada_en: null,
    });
  }

  async reordenar(token: string, naturaleza: Naturaleza, ids: string[]): Promise<void> {
    const { error } = await this.cliente(token).rpc("reordenar_cuentas", {
      p_naturaleza: naturaleza,
      p_ids: ids,
    });
    if (error) throw traducir(error);
  }
}
