/**
 * Préstamos con el cliente del usuario (RN-19): las políticas RLS garantizan
 * que solo toca sus propias filas (RN-12).
 *
 * - Lectura: `prestamos_detalle` (cuenta + préstamo), los movimientos que tocan
 *   las cuentas de préstamo (`movimientos_detalle`) y los intereses enlazados
 *   en `prestamos_intereses` con sus movimientos.
 * - Escritura: `crear_prestamo` (cuenta, préstamo y desembolso) y
 *   `registrar_abono` (capital e interés), atómicas; `registrar_movimiento`
 *   para desembolsos adicionales y condonaciones. El nombre se cambia en
 *   `cuentas` y la fecha acordada en `prestamos`, por RLS directa; el
 *   historial lo escriben los triggers (RN-13).
 *
 * Montos cifrados (SPEC 05): el saldo inicial (0) con la AAD de la cuenta y
 * cada movimiento con la de `movimientos`. Los ids los genera la API.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPOS_MOVIMIENTO,
  type Ref,
  type TipoMovimiento,
} from "../../domain/movimiento/movimiento.js";
import {
  TIPOS_PRESTAMO,
  esTipoPrestamo,
  type InteresDePrestamo,
  type MovimientoDePrestamo,
  type Prestamo,
  type TipoPrestamo,
} from "../../domain/prestamo/prestamo.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

const COLUMNAS_PRESTAMO = "id, nombre, tipo, tasa_mensual_cpb, fecha_acordada, creado_en";

const COLUMNAS_MOVIMIENTO =
  "id, tipo, monto, fecha, creado_en, cuenta_origen_id, cuenta_origen_nombre, " +
  "cuenta_destino_id, cuenta_destino_nombre, categoria_id, categoria_nombre";

type Funciones = Database["public"]["Functions"];

type FilaPrestamo = {
  id: string | null;
  nombre: string | null;
  tipo: string | null;
  tasa_mensual_cpb: number | null;
  fecha_acordada: string | null;
  creado_en: string | null;
};

type FilaMovimiento = {
  id: string | null;
  tipo: string | null;
  monto: unknown;
  fecha: string | null;
  creado_en: string | null;
  cuenta_origen_id: string | null;
  cuenta_origen_nombre: string | null;
  cuenta_destino_id: string | null;
  cuenta_destino_nombre: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
};

type FilaInteres = {
  movimiento_id: string;
  prestamo_id: string;
  movimiento_capital_id: string | null;
};

/** Interés con el préstamo al que pertenece. */
export type InteresLeido = InteresDePrestamo & { prestamoId: string };

export type DatosAlta = {
  tipo: TipoPrestamo;
  nombre: string;
  tasaCpb: number;
  fechaAcordada: string | null;
  monto: bigint;
  fecha: string;
  cuentaId: string;
  descripcion: string;
};

export type DatosDesembolso = {
  monto: bigint;
  fecha: string;
  cuentaId: string;
  descripcion: string;
};

export type DatosAbono = {
  cuentaId: string;
  fecha: string;
  capital: bigint | null;
  interes: bigint | null;
  categoriaInteresId: string | null;
  descripcionCapital: string;
  descripcionInteres: string;
};

export type DatosCondonacion = {
  monto: bigint;
  fecha: string;
  categoriaId: string;
  descripcion: string;
};

function requerido<T>(valor: T | null, columna: string): T {
  if (valor === null) throw new Error(`prestamos: ${columna} llegó nulo.`);
  return valor;
}

function aTipoMovimiento(valor: string | null): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

function aRef(id: string | null, nombre: string | null): Ref | null {
  return id === null ? null : { id, nombre: requerido(nombre, "nombre") };
}

function aPrestamo(f: FilaPrestamo): Prestamo {
  const tipo = requerido(f.tipo, "tipo");
  if (!esTipoPrestamo(tipo)) throw new Error(`Tipo de préstamo desconocido: ${tipo}`);
  return {
    id: requerido(f.id, "id"),
    nombre: requerido(f.nombre, "nombre"),
    tipo,
    tasaCpb: requerido(f.tasa_mensual_cpb, "tasa_mensual_cpb"),
    fechaAcordada: f.fecha_acordada,
    creadoEn: new Date(requerido(f.creado_en, "creado_en")),
  };
}

/**
 * Traduce el error de Postgres a un código del catálogo; si no, error interno
 * sin filtrar detalle. `campoCategoria`: el campo del cuerpo que lleva la
 * categoría del movimiento escrito.
 */
function traducir(error: PostgrestError, campoCategoria = "categoriaId"): Error {
  const deFuncion = desdeFuncion(error);
  if (deFuncion) {
    // registrar_movimiento nombra la columna; el cuerpo de préstamos, la cuenta propia.
    if (
      deFuncion.codigo === "CUENTA_ARCHIVADA" &&
      (deFuncion.campo === "cuentaOrigenId" || deFuncion.campo === "cuentaDestinoId")
    ) {
      return new ErrorApi("CUENTA_ARCHIVADA", "cuentaId");
    }
    return deFuncion;
  }
  if (error.code === "23505" && error.message.includes("cuentas_prestamo_nombre_unico")) {
    return new ErrorApi("PRESTAMO_EXISTENTE");
  }
  if (error.code === "23503") {
    if (/movimientos_cuenta_(origen|destino)_fkey/.test(error.message)) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaId");
    }
    if (error.message.includes("movimientos_categoria_fkey")) {
      return new ErrorApi("CATEGORIA_INVALIDA", campoCategoria);
    }
  }
  return errorInterno(error);
}

@Injectable()
export class PrestamosRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aMovimiento(usuarioId: string, f: FilaMovimiento): MovimientoDePrestamo {
    const id = requerido(f.id, "id");
    return {
      id,
      tipo: aTipoMovimiento(f.tipo),
      monto: this.cifrador.descifrar(f.monto, contexto.movimiento(usuarioId, id)),
      fecha: requerido(f.fecha, "fecha"),
      creadoEn: new Date(requerido(f.creado_en, "creado_en")),
      cuentaOrigenId: f.cuenta_origen_id,
      cuentaDestinoId: f.cuenta_destino_id,
      cuentaOrigen: aRef(f.cuenta_origen_id, f.cuenta_origen_nombre),
      cuentaDestino: aRef(f.cuenta_destino_id, f.cuenta_destino_nombre),
      categoria: aRef(f.categoria_id, f.categoria_nombre),
    };
  }

  /** Todos los préstamos del usuario, saldados incluidos. */
  async listar(usuario: UsuarioAutenticado): Promise<Prestamo[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("prestamos_detalle")
      .select(COLUMNAS_PRESTAMO);
    if (error) throw traducir(error);
    return (data as FilaPrestamo[]).map(aPrestamo);
  }

  /** `null` si no existe o no es visible por RLS (préstamo ajeno). */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<Prestamo | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("prestamos_detalle")
      .select(COLUMNAS_PRESTAMO)
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : aPrestamo(data as FilaPrestamo);
  }

  /** Movimientos que tocan alguna de las cuentas de préstamo `ids`. */
  async movimientos(usuario: UsuarioAutenticado, ids: string[]): Promise<MovimientoDePrestamo[]> {
    if (ids.length === 0) return [];
    const lista = `(${ids.join(",")})`;
    const { data, error } = await this.cliente(usuario.token)
      .from("movimientos_detalle")
      .select(COLUMNAS_MOVIMIENTO)
      .or(`cuenta_origen_id.in.${lista},cuenta_destino_id.in.${lista}`);
    if (error) throw traducir(error);
    return (data as unknown as FilaMovimiento[]).map((f) => this.aMovimiento(usuario.id, f));
  }

  /** Intereses de los préstamos `ids`, con monto, fecha y cuenta de su movimiento. */
  async intereses(usuario: UsuarioAutenticado, ids: string[]): Promise<InteresLeido[]> {
    if (ids.length === 0) return [];
    const cliente = this.cliente(usuario.token);
    const { data, error } = await cliente
      .from("prestamos_intereses")
      .select("movimiento_id, prestamo_id, movimiento_capital_id")
      .in("prestamo_id", ids);
    if (error) throw traducir(error);
    const enlaces = data as FilaInteres[];
    if (enlaces.length === 0) return [];

    const { data: filas, error: errorMovimientos } = await cliente
      .from("movimientos_detalle")
      .select(COLUMNAS_MOVIMIENTO)
      .in(
        "id",
        enlaces.map((e) => e.movimiento_id),
      );
    if (errorMovimientos) throw traducir(errorMovimientos);
    const porId = new Map(
      (filas as unknown as FilaMovimiento[]).map((f) => {
        const m = this.aMovimiento(usuario.id, f);
        return [m.id, m] as const;
      }),
    );

    return enlaces.flatMap((e): InteresLeido[] => {
      const m = porId.get(e.movimiento_id);
      if (!m) return [];
      // La cuenta propia: destino en un ingreso (te deben), origen en un gasto (debes).
      const cuenta = m.cuentaDestino ?? m.cuentaOrigen;
      return [
        {
          prestamoId: e.prestamo_id,
          movimientoId: m.id,
          movimientoCapitalId: e.movimiento_capital_id,
          monto: m.monto,
          fecha: m.fecha,
          creadoEn: m.creadoEn,
          cuenta: requerido(cuenta, "cuenta del interés"),
        },
      ];
    });
  }

  /** Cuenta, préstamo y desembolso en una sola transacción. Devuelve el id del préstamo. */
  async crear(usuario: UsuarioAutenticado, datos: DatosAlta): Promise<string> {
    const cuentaId = randomUUID();
    const movimientoId = randomUUID();
    const args = {
      p_cuenta_id: cuentaId,
      p_tipo: datos.tipo,
      p_nombre: datos.nombre,
      p_saldo_inicial: this.cifrador.cifrar(
        0n,
        contexto.cuenta(usuario.id, cuentaId, "saldo_inicial"),
      ),
      p_tasa_mensual_cpb: datos.tasaCpb,
      p_fecha_acordada: datos.fechaAcordada,
      p_movimiento_id: movimientoId,
      p_monto: this.cifrador.cifrar(datos.monto, contexto.movimiento(usuario.id, movimientoId)),
      p_fecha: datos.fecha,
      p_cuenta_propia_id: datos.cuentaId,
      p_descripcion: datos.descripcion,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "crear_prestamo",
      args as unknown as Funciones["crear_prestamo"]["Args"],
    );
    if (error) throw traducir(error);
    return cuentaId;
  }

  private async registrarMovimiento(
    usuario: UsuarioAutenticado,
    m: {
      tipo: TipoMovimiento;
      monto: bigint;
      fecha: string;
      descripcion: string;
      cuentaOrigenId: string | null;
      cuentaDestinoId: string | null;
      categoriaId: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    const args = {
      p_id: id,
      p_tipo: m.tipo,
      p_monto: this.cifrador.cifrar(m.monto, contexto.movimiento(usuario.id, id)),
      p_fecha: m.fecha,
      p_descripcion: m.descripcion,
      p_nota: null,
      p_cuenta_origen_id: m.cuentaOrigenId,
      p_cuenta_destino_id: m.cuentaDestinoId,
      p_categoria_id: m.categoriaId,
      p_partes: null,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "registrar_movimiento",
      args as unknown as Funciones["registrar_movimiento"]["Args"],
    );
    if (error) throw traducir(error);
    return id;
  }

  /**
   * Transferencia que aumenta el capital: en un otorgado, de la cuenta propia
   * al préstamo; en una contraída, del préstamo a la cuenta propia (RN-08).
   */
  async desembolsar(
    usuario: UsuarioAutenticado,
    prestamo: Pick<Prestamo, "id" | "tipo">,
    datos: DatosDesembolso,
  ): Promise<string> {
    const otorgado = prestamo.tipo === "prestamo_otorgado";
    return this.registrarMovimiento(usuario, {
      tipo: "transferencia",
      monto: datos.monto,
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      cuentaOrigenId: otorgado ? datos.cuentaId : prestamo.id,
      cuentaDestinoId: otorgado ? prestamo.id : datos.cuentaId,
      categoriaId: null,
    });
  }

  /** Capital (transferencia) e interés (ingreso o gasto) en una sola transacción. */
  async abonar(usuario: UsuarioAutenticado, prestamoId: string, datos: DatosAbono): Promise<void> {
    const capitalId = randomUUID();
    const interesId = randomUUID();
    const args = {
      p_prestamo_id: prestamoId,
      p_cuenta_propia_id: datos.cuentaId,
      p_fecha: datos.fecha,
      p_capital_id: capitalId,
      p_capital:
        datos.capital === null
          ? null
          : this.cifrador.cifrar(datos.capital, contexto.movimiento(usuario.id, capitalId)),
      p_interes_id: interesId,
      p_interes:
        datos.interes === null
          ? null
          : this.cifrador.cifrar(datos.interes, contexto.movimiento(usuario.id, interesId)),
      p_categoria_interes_id: datos.categoriaInteresId,
      p_descripcion_capital: datos.descripcionCapital,
      p_descripcion_interes: datos.descripcionInteres,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "registrar_abono",
      args as unknown as Funciones["registrar_abono"]["Args"],
    );
    if (error) throw traducir(error, "categoriaInteresId");
  }

  /** Gasto con origen la cuenta del préstamo (RN-17). Devuelve el id del movimiento. */
  condonar(
    usuario: UsuarioAutenticado,
    prestamoId: string,
    datos: DatosCondonacion,
  ): Promise<string> {
    return this.registrarMovimiento(usuario, {
      tipo: "gasto",
      monto: datos.monto,
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      cuentaOrigenId: prestamoId,
      cuentaDestinoId: null,
      categoriaId: datos.categoriaId,
    });
  }

  /** El trigger `registrar_cambio_nombre_prestamo` deja el historial. */
  async cambiarNombre(usuario: UsuarioAutenticado, id: string, nombre: string): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .update({ nombre })
      .eq("id", id)
      .in("tipo", [...TIPOS_PRESTAMO])
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("PRESTAMO_NO_ENCONTRADO");
  }

  /** El trigger `registrar_cambio_prestamo` deja el historial. */
  async cambiarFechaAcordada(
    usuario: UsuarioAutenticado,
    id: string,
    fechaAcordada: string | null,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("prestamos")
      .update({ fecha_acordada: fechaAcordada })
      .eq("cuenta_id", id)
      .select("cuenta_id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("PRESTAMO_NO_ENCONTRADO");
  }
}
