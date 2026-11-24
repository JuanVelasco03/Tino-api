/**
 * Movimientos con el cliente del usuario (RN-19). Lee de la vista
 * `movimientos_detalle` (RLS por security_invoker) y escribe solo por las
 * funciones `registrar_movimiento`, `reemplazar_movimiento` y
 * `eliminar_movimiento`: la tabla no tiene políticas de escritura.
 *
 * Montos cifrados (SPEC 05): el monto y el de cada parte se cifran con
 * `CifradorMontos` antes de llamar a las funciones y se descifran al leer. El
 * `id` del movimiento lo genera la API para atar el cifrado a la fila (AAD).
 *
 * Préstamos (SPEC 08): `tiposDeCuenta`, `esInteresDePrestamo` y `efectosDe`
 * dan al servicio lo que necesita para `CUENTA_DE_PRESTAMO`,
 * `MOVIMIENTO_DE_PRESTAMO` y `CAPITAL_NEGATIVO`.
 *
 * Inversiones (SPEC 10): `monto_destino` se cifra con su propia AAD
 * (`movimientos|monto_destino|<id>`) y la tasa implícita llega calculada por
 * el dominio. La moneda la fija la función de Postgres desde las cuentas.
 *
 * Detalle de cuenta (SPEC 14): `listarDeCuenta` agrega el estado de
 * conciliación por lado, que la vista no trae; se lee de `movimientos`.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import { esMoneda, type Moneda } from "../../domain/inversion/inversion.js";
import {
  TIPOS_MOVIMIENTO_GUARDADO,
  type Movimiento,
  type MovimientoEntrada,
  type Ref,
  type TipoMovimientoGuardado,
} from "../../domain/movimiento/movimiento.js";
import type { MovimientoConciliable } from "../../domain/cuenta/historial.js";
import { TASA_UNITARIA } from "../../domain/movimiento/tasa.js";
import type { MovimientoConId } from "../../domain/prestamo/validar.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

const COLUMNAS =
  "id, tipo, monto, monto_destino, moneda, tasa::text, fecha, descripcion, nota, " +
  "cuenta_origen_id, cuenta_origen_nombre, cuenta_destino_id, cuenta_destino_nombre, " +
  "categoria_id, categoria_nombre, partes, creado_en, actualizado_en";

type Funciones = Database["public"]["Functions"];

type FilaDetalle = {
  id: string | null;
  tipo: string | null;
  monto: unknown;
  monto_destino: unknown;
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

/** Textos cifrados guardados de un movimiento: el monto, el de destino y, por categoría, el de cada parte. */
type MontosGuardados = {
  monto: string | null;
  montoDestino: string | null;
  partes: ReadonlyMap<string, string>;
};

const SIN_GUARDADOS: MontosGuardados = { monto: null, montoDestino: null, partes: new Map() };

/** Tipo y moneda de una cuenta, para las guardas del servicio. */
export type DatosCuenta = { tipo: string; moneda: Moneda };

function requerido<T>(valor: T | null, columna: string): T {
  if (valor === null) throw new Error(`movimientos_detalle.${columna} llegó nulo.`);
  return valor;
}

function aTipo(valor: string | null): TipoMovimientoGuardado {
  const tipo = TIPOS_MOVIMIENTO_GUARDADO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

function aMoneda(valor: string | null): Moneda {
  if (valor === null || !esMoneda(valor)) throw new Error(`Moneda desconocida: ${valor}`);
  return valor;
}

function aRef(id: string | null, nombre: string | null): Ref | null {
  return id === null ? null : { id, nombre: requerido(nombre, "nombre") };
}

/** `numeric(18,6)` como texto sin ceros sobrantes: "1.000000" → "1", "4012.500000" → "4012.5". */
function aTasa(valor: unknown): string {
  if (typeof valor !== "string" || !/^\d+(\.\d+)?$/.test(valor)) {
    throw new Error(`movimientos_detalle.tasa no llegó como texto decimal: ${String(valor)}`);
  }
  return valor.includes(".") ? valor.replace(/0+$/, "").replace(/\.$/, "") : valor;
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

@Injectable()
export class MovimientosRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aPartes(usuarioId: string, movimientoId: string, valor: unknown): Movimiento["partes"] {
    if (!Array.isArray(valor)) throw new Error("movimientos_detalle.partes no es una lista.");
    return valor.map((p: unknown) => {
      const parte = p as { categoria_id?: unknown; categoria_nombre?: unknown; monto?: unknown };
      if (typeof parte.categoria_id !== "string" || typeof parte.categoria_nombre !== "string") {
        throw new Error("movimientos_detalle.partes tiene una parte mal formada.");
      }
      return {
        categoria: { id: parte.categoria_id, nombre: parte.categoria_nombre },
        monto: this.cifrador.descifrar(
          parte.monto,
          contexto.parte(usuarioId, movimientoId, parte.categoria_id),
        ),
      };
    });
  }

  private aMovimiento(usuarioId: string, fila: FilaDetalle): Movimiento {
    const id = requerido(fila.id, "id");
    return {
      id,
      tipo: aTipo(fila.tipo),
      monto: this.cifrador.descifrar(fila.monto, contexto.movimiento(usuarioId, id)),
      moneda: aMoneda(fila.moneda),
      montoDestino:
        fila.monto_destino === null
          ? null
          : this.cifrador.descifrar(fila.monto_destino, contexto.montoDestino(usuarioId, id)),
      tasa: aTasa(fila.tasa),
      fecha: requerido(fila.fecha, "fecha"),
      descripcion: fila.descripcion,
      nota: fila.nota,
      cuentaOrigen: aRef(fila.cuenta_origen_id, fila.cuenta_origen_nombre),
      cuentaDestino: aRef(fila.cuenta_destino_id, fila.cuenta_destino_nombre),
      categoria: aRef(fila.categoria_id, fila.categoria_nombre),
      partes: this.aPartes(usuarioId, id, fila.partes),
      creadoEn: new Date(requerido(fila.creado_en, "creado_en")),
      actualizadoEn: new Date(requerido(fila.actualizado_en, "actualizado_en")),
    };
  }

  /**
   * Argumentos de las funciones de escritura, con los montos cifrados. Un monto
   * igual al guardado conserva su texto: el historial compara las fotos y no
   * debe registrar cambios falsos (RN-13). Los tipos generados declaran los
   * opcionales como no nulos; se envía null, que PostgREST acepta.
   */
  private argumentos(
    usuarioId: string,
    id: string,
    m: MovimientoEntrada,
    guardados: MontosGuardados,
    tasa: string,
  ) {
    return {
      p_id: id,
      p_tipo: m.tipo,
      p_monto: this.cifrador.cifrarSiCambia(
        m.monto,
        guardados.monto,
        contexto.movimiento(usuarioId, id),
      ),
      p_fecha: m.fecha,
      p_descripcion: m.descripcion,
      p_nota: m.nota,
      p_cuenta_origen_id: m.cuentaOrigenId,
      p_cuenta_destino_id: m.cuentaDestinoId,
      p_categoria_id: m.categoriaId,
      p_monto_destino:
        m.montoDestino === null
          ? null
          : this.cifrador.cifrarSiCambia(
              m.montoDestino,
              guardados.montoDestino,
              contexto.montoDestino(usuarioId, id),
            ),
      p_tasa: tasa,
      p_partes:
        m.partes === null
          ? null
          : m.partes.map((p) => ({
              categoria_id: p.categoriaId,
              monto: this.cifrador.cifrarSiCambia(
                p.monto,
                guardados.partes.get(p.categoriaId) ?? null,
                contexto.parte(usuarioId, id, p.categoriaId),
              ),
            })),
    };
  }

  /** Vacío si el movimiento no existe o es ajeno: la función de Postgres lo rechaza después. */
  private async montosGuardados(token: string, id: string): Promise<MontosGuardados> {
    const [movimiento, partes] = await Promise.all([
      this.cliente(token)
        .from("movimientos")
        .select("monto, monto_destino")
        .eq("id", id)
        .maybeSingle(),
      this.cliente(token)
        .from("movimiento_partes")
        .select("categoria_id, monto")
        .eq("movimiento_id", id),
    ]);
    if (movimiento.error) throw traducir(movimiento.error);
    if (partes.error) throw traducir(partes.error);
    if (movimiento.data === null) return SIN_GUARDADOS;
    const filasPartes = partes.data as unknown as { categoria_id: string; monto: string }[];
    const fila = movimiento.data as unknown as { monto: string; monto_destino: string | null };
    return {
      monto: fila.monto,
      montoDestino: fila.monto_destino,
      partes: new Map(filasPartes.map((p) => [p.categoria_id, p.monto])),
    };
  }

  /** Movimientos con fecha entre `desde` y `hasta` (inclusive), por fecha y registro, el más reciente primero. */
  async listarEntre(
    usuario: UsuarioAutenticado,
    desde: string,
    hasta: string,
  ): Promise<Movimiento[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("movimientos_detalle")
      .select(COLUMNAS)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false });
    if (error) throw traducir(error);
    return (data as unknown as FilaDetalle[]).map((f) => this.aMovimiento(usuario.id, f));
  }

  /**
   * Todos los movimientos que tocan la cuenta, con su estado de conciliación
   * por lado (SPEC 14). Sin orden: lo pone el dominio.
   */
  async listarDeCuenta(
    usuario: UsuarioAutenticado,
    cuentaId: string,
  ): Promise<MovimientoConciliable[]> {
    const filtro = `cuenta_origen_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`;
    const [detalle, estados] = await Promise.all([
      this.cliente(usuario.token).from("movimientos_detalle").select(COLUMNAS).or(filtro),
      this.cliente(usuario.token)
        .from("movimientos")
        .select("id, conciliado_origen, conciliado_destino")
        .or(filtro),
    ]);
    if (detalle.error) throw traducir(detalle.error);
    if (estados.error) throw traducir(estados.error);
    const porId = new Map(estados.data.map((e) => [e.id, e]));
    return (detalle.data as unknown as FilaDetalle[]).map((f) => {
      const m = this.aMovimiento(usuario.id, f);
      const estado = porId.get(m.id);
      return {
        ...m,
        conciliadoOrigen: estado?.conciliado_origen ?? false,
        conciliadoDestino: estado?.conciliado_destino ?? false,
      };
    });
  }

  /** `null` si no existe o no es visible por RLS (movimiento ajeno). */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<Movimiento | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("movimientos_detalle")
      .select(COLUMNAS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : this.aMovimiento(usuario.id, data as unknown as FilaDetalle);
  }

  /**
   * Devuelve el id del movimiento creado (lo genera la API). `tasa`: la
   * implícita entre monedas (SPEC 10), o "1".
   */
  async registrar(
    usuario: UsuarioAutenticado,
    entrada: MovimientoEntrada,
    tasa: string = TASA_UNITARIA,
  ): Promise<string> {
    const args = this.argumentos(usuario.id, randomUUID(), entrada, SIN_GUARDADOS, tasa);
    const { data, error } = await this.cliente(usuario.token).rpc(
      "registrar_movimiento",
      args as unknown as Funciones["registrar_movimiento"]["Args"],
    );
    if (error) throw traducir(error);
    return data;
  }

  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    entrada: MovimientoEntrada,
    tasa: string = TASA_UNITARIA,
  ): Promise<void> {
    const guardados = await this.montosGuardados(usuario.token, id);
    const args = this.argumentos(usuario.id, id, entrada, guardados, tasa);
    const { error } = await this.cliente(usuario.token).rpc(
      "reemplazar_movimiento",
      args as unknown as Funciones["reemplazar_movimiento"]["Args"],
    );
    if (error) throw traducir(error);
  }

  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const { error } = await this.cliente(usuario.token).rpc("eliminar_movimiento", { p_id: id });
    if (error) throw traducir(error);
  }

  /** Tipo de cada cuenta de `ids` visible por RLS; una inexistente o ajena no aparece. */
  async tiposDeCuenta(
    usuario: UsuarioAutenticado,
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const datos = await this.datosDeCuenta(usuario, ids);
    return new Map([...datos].map(([id, d]) => [id, d.tipo]));
  }

  /** Tipo y moneda de cada cuenta de `ids` visible por RLS (SPEC 10). */
  async datosDeCuenta(
    usuario: UsuarioAutenticado,
    ids: readonly (string | null)[],
  ): Promise<Map<string, DatosCuenta>> {
    const informados = [...new Set(ids.filter((id): id is string => id !== null && id !== ""))];
    if (informados.length === 0) return new Map();
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("id, tipo, moneda")
      .in("id", informados);
    if (error) throw traducir(error);
    return new Map(data.map((f) => [f.id, { tipo: f.tipo, moneda: aMoneda(f.moneda) }]));
  }

  /** Si el movimiento es el interés de un préstamo (`prestamos_intereses`). */
  async esInteresDePrestamo(usuario: UsuarioAutenticado, id: string): Promise<boolean> {
    const { data, error } = await this.cliente(usuario.token)
      .from("prestamos_intereses")
      .select("movimiento_id")
      .eq("movimiento_id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data !== null;
  }

  /** Id de la categoría reservada de los ajustes de saldo (RN-14, SPEC 14). */
  async categoriaDeAjuste(usuario: UsuarioAutenticado): Promise<string> {
    const { data, error } = await this.cliente(usuario.token)
      .from("categorias")
      .select("id")
      .eq("tipo", "ajuste")
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) throw new Error("El usuario no tiene la categoría reservada de ajuste.");
    return data.id;
  }

  /** Si el movimiento es la transferencia de un aporte a una meta (SPEC 13). */
  async esAporteDeMeta(usuario: UsuarioAutenticado, id: string): Promise<boolean> {
    const { data, error } = await this.cliente(usuario.token)
      .from("metas_movimientos")
      .select("id")
      .eq("movimiento_id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data !== null;
  }

  /** Monto y cuentas de los movimientos que tocan alguna de las cuentas `ids`, descifrados. */
  async efectosDe(usuario: UsuarioAutenticado, ids: readonly string[]): Promise<MovimientoConId[]> {
    if (ids.length === 0) return [];
    const lista = `(${ids.join(",")})`;
    const { data, error } = await this.cliente(usuario.token)
      .from("movimientos")
      .select("id, monto, monto_destino, cuenta_origen_id, cuenta_destino_id")
      .or(`cuenta_origen_id.in.${lista},cuenta_destino_id.in.${lista}`);
    if (error) throw traducir(error);
    return data.map((m) => ({
      id: m.id,
      monto: this.cifrador.descifrar(m.monto, contexto.movimiento(usuario.id, m.id)),
      montoDestino:
        m.monto_destino === null
          ? null
          : this.cifrador.descifrar(m.monto_destino, contexto.montoDestino(usuario.id, m.id)),
      cuentaOrigenId: m.cuenta_origen_id,
      cuentaDestinoId: m.cuenta_destino_id,
    }));
  }
}
