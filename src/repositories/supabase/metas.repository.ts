/**
 * Metas de ahorro con el cliente del usuario (RN-19): las políticas RLS
 * garantizan que solo toca sus propias filas (RN-12).
 *
 * - Lectura: `metas`, `metas_movimientos` con su transferencia
 *   (`movimientos_detalle`) y las cuentas de las metas.
 * - Escritura: `crear_meta` (meta y apartado inicial) y `registrar_aporte`
 *   (aporte o retiro y, con origen, su transferencia), atómicas;
 *   `registrar_movimiento` para el aporte a una meta de modo `cuenta`;
 *   `reemplazar_movimiento` y `eliminar_movimiento` para editar o borrar un
 *   aporte con origen. Lo demás, por UPDATE y DELETE directos con RLS. El
 *   historial lo escriben los triggers (RN-13).
 *
 * Montos cifrados (SPEC 05): el objetivo y el avance al cumplirse con
 * `metas|<columna>|<id>`; el aporte sin origen con
 * `metas_movimientos|monto|<id>`; la transferencia con la AAD de
 * `movimientos`. Los ids los genera la API.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import { esMoneda } from "../../domain/inversion/inversion.js";
import { resolverAporte } from "../../domain/meta/avance.js";
import {
  esModoMeta,
  esTipoAporte,
  type Aporte,
  type CuentaDeMeta,
  type Meta,
  type ModoMeta,
  type TipoAporte,
} from "../../domain/meta/meta.js";
import type { FechaMeta } from "../../domain/meta/validar.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database, TablesUpdate } from "./tipos.js";

type Funciones = Database["public"]["Functions"];

const COLUMNAS_META =
  "id, nombre, cuenta_id, modo, objetivo, fecha_meta, fecha_meta_es_mes, cumplida_en, " +
  "avance_cumplida, archivada_en, creado_en";

const COLUMNAS_APORTE =
  "id, meta_id, tipo, monto, fecha, motivo, inicial, movimiento_id, creado_en";

type FilaMeta = {
  id: string;
  nombre: string;
  cuenta_id: string;
  modo: string;
  objetivo: string;
  fecha_meta: string | null;
  fecha_meta_es_mes: boolean;
  cumplida_en: string | null;
  avance_cumplida: string | null;
  archivada_en: string | null;
  creado_en: string;
};

type FilaAporte = {
  id: string;
  meta_id: string;
  tipo: string;
  monto: string | null;
  fecha: string | null;
  motivo: string | null;
  inicial: boolean;
  movimiento_id: string | null;
  creado_en: string;
};

type FilaTransferencia = {
  id: string | null;
  monto: unknown;
  fecha: string | null;
  cuenta_origen_id: string | null;
  cuenta_origen_nombre: string | null;
};

export type AporteNuevo = {
  tipo: TipoAporte;
  monto: bigint;
  fecha: string;
  motivo: string | null;
  cuentaOrigenId: string | null;
  /** Descripción de la transferencia, si tiene origen. */
  descripcion: string;
};

export type MetaNueva = {
  nombre: string;
  cuentaId: string;
  modo: ModoMeta;
  objetivo: bigint;
  fechaMeta: FechaMeta | null;
  aporteInicial: Omit<AporteNuevo, "tipo" | "motivo"> | null;
};

export type CambiosMeta = {
  nombre?: string;
  cuentaId?: string;
  modo?: ModoMeta;
  objetivo?: bigint;
  fechaMeta?: FechaMeta | null;
};

export type TransferenciaNueva = {
  monto: bigint;
  fecha: string;
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  descripcion: string;
};

export type CambiosAporte = {
  monto: bigint;
  fecha: string;
  motivo: string | null;
  /** Solo en un aporte con origen. */
  cuentaOrigenId: string | null;
};

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  const deFuncion = desdeFuncion(error);
  if (deFuncion) return deFuncion;
  if (error.code === "23505" && error.message.includes("metas_cuenta_exclusiva")) {
    return new ErrorApi("CUENTA_CON_META_EXCLUSIVA");
  }
  if (error.code === "23503") {
    if (error.message.includes("metas_cuenta_fkey"))
      return new ErrorApi("CUENTA_INVALIDA", "cuentaId");
    if (/movimientos_cuenta_origen_fkey/.test(error.message)) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaOrigenId");
    }
  }
  return errorInterno(error);
}

function aModo(valor: string): ModoMeta {
  if (!esModoMeta(valor)) throw new Error(`Modo de meta desconocido: ${valor}`);
  return valor;
}

function aTipoAporte(valor: string): TipoAporte {
  if (!esTipoAporte(valor)) throw new Error(`Tipo de aporte desconocido: ${valor}`);
  return valor;
}

@Injectable()
export class MetasRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aMeta(usuarioId: string, f: FilaMeta): Meta {
    return {
      id: f.id,
      nombre: f.nombre,
      cuentaId: f.cuenta_id,
      modo: aModo(f.modo),
      objetivo: this.cifrador.descifrar(f.objetivo, contexto.meta(usuarioId, f.id, "objetivo")),
      fechaMeta: f.fecha_meta,
      fechaMetaEsMes: f.fecha_meta_es_mes,
      cumplidaEn: f.cumplida_en,
      avanceCumplida:
        f.avance_cumplida === null
          ? null
          : this.cifrador.descifrar(
              f.avance_cumplida,
              contexto.meta(usuarioId, f.id, "avance_cumplida"),
            ),
      archivadaEn: f.archivada_en === null ? null : new Date(f.archivada_en),
      creadoEn: new Date(f.creado_en),
    };
  }

  /** Todas las metas del usuario, archivadas incluidas. */
  async listar(usuario: UsuarioAutenticado): Promise<Meta[]> {
    const { data, error } = await this.cliente(usuario.token).from("metas").select(COLUMNAS_META);
    if (error) throw traducir(error);
    return (data as unknown as FilaMeta[]).map((f) => this.aMeta(usuario.id, f));
  }

  /** `null` si no existe o no es visible por RLS (meta ajena). */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<Meta | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("metas")
      .select(COLUMNAS_META)
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : this.aMeta(usuario.id, data as unknown as FilaMeta);
  }

  /** Cuentas visibles por RLS de `ids`, préstamos incluidos (los rechaza el dominio). */
  async cuentas(
    usuario: UsuarioAutenticado,
    ids: readonly string[],
  ): Promise<Map<string, CuentaDeMeta>> {
    const distintas = [...new Set(ids)];
    if (distintas.length === 0) return new Map();
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("id, nombre, tipo, moneda, saldo_inicial, archivada_en")
      .in("id", distintas);
    if (error) throw traducir(error);
    return new Map(
      data.map((f) => {
        if (!esMoneda(f.moneda)) throw new Error(`Moneda desconocida: ${f.moneda}`);
        const cuenta: CuentaDeMeta = {
          id: f.id,
          nombre: f.nombre,
          tipo: f.tipo,
          moneda: f.moneda,
          saldoInicial: this.cifrador.descifrar(
            f.saldo_inicial,
            contexto.cuenta(usuario.id, f.id, "saldo_inicial"),
          ),
          archivadaEn: f.archivada_en === null ? null : new Date(f.archivada_en),
        };
        return [f.id, cuenta] as const;
      }),
    );
  }

  /**
   * Aportes y retiros de todas las metas del usuario, con monto y fecha
   * resueltos: los propios o los de su transferencia (la única fuente).
   */
  async aportes(usuario: UsuarioAutenticado): Promise<Aporte[]> {
    const cliente = this.cliente(usuario.token);
    const { data, error } = await cliente.from("metas_movimientos").select(COLUMNAS_APORTE);
    if (error) throw traducir(error);
    const filas = data as unknown as FilaAporte[];
    const ids = filas.flatMap((f) => (f.movimiento_id === null ? [] : [f.movimiento_id]));

    const transferencias = new Map<
      string,
      { monto: bigint; fecha: string; cuentaOrigen: { id: string; nombre: string } | null }
    >();
    if (ids.length > 0) {
      const { data: movimientos, error: errorMovimientos } = await cliente
        .from("movimientos_detalle")
        .select("id, monto, fecha, cuenta_origen_id, cuenta_origen_nombre")
        .in("id", ids);
      if (errorMovimientos) throw traducir(errorMovimientos);
      for (const m of movimientos as unknown as FilaTransferencia[]) {
        if (m.id === null || m.fecha === null) continue;
        transferencias.set(m.id, {
          monto: this.cifrador.descifrar(m.monto, contexto.movimiento(usuario.id, m.id)),
          fecha: m.fecha,
          cuentaOrigen:
            m.cuenta_origen_id === null
              ? null
              : { id: m.cuenta_origen_id, nombre: m.cuenta_origen_nombre ?? "" },
        });
      }
    }

    return filas.map((f) =>
      resolverAporte(
        {
          id: f.id,
          metaId: f.meta_id,
          tipo: aTipoAporte(f.tipo),
          monto:
            f.monto === null
              ? null
              : this.cifrador.descifrar(f.monto, contexto.aporteMeta(usuario.id, f.id)),
          fecha: f.fecha,
          motivo: f.motivo,
          inicial: f.inicial,
          movimientoId: f.movimiento_id,
          creadoEn: new Date(f.creado_en),
        },
        f.movimiento_id === null ? null : (transferencias.get(f.movimiento_id) ?? null),
      ),
    );
  }

  /** Argumentos de `registrar_aporte` (o del apartado inicial de `crear_meta`), cifrados. */
  private argumentosAporte(usuario: UsuarioAutenticado, a: Omit<AporteNuevo, "tipo">) {
    const id = randomUUID();
    if (a.cuentaOrigenId === null) {
      return {
        id,
        monto: this.cifrador.cifrar(a.monto, contexto.aporteMeta(usuario.id, id)),
        movimiento_id: null,
        monto_movimiento: null,
      };
    }
    const movimientoId = randomUUID();
    return {
      id,
      monto: null,
      movimiento_id: movimientoId,
      monto_movimiento: this.cifrador.cifrar(
        a.monto,
        contexto.movimiento(usuario.id, movimientoId),
      ),
    };
  }

  /** Meta y apartado inicial en una sola transacción. Devuelve el id de la meta. */
  async crear(usuario: UsuarioAutenticado, datos: MetaNueva): Promise<string> {
    const id = randomUUID();
    const inicial = datos.aporteInicial;
    const aporte =
      inicial === null
        ? null
        : {
            ...this.argumentosAporte(usuario, { ...inicial, motivo: null }),
            fecha: inicial.fecha,
            motivo: null,
            cuenta_origen_id: inicial.cuentaOrigenId,
            descripcion: inicial.descripcion,
          };
    const args = {
      p_id: id,
      p_nombre: datos.nombre,
      p_cuenta_id: datos.cuentaId,
      p_modo: datos.modo,
      p_objetivo: this.cifrador.cifrar(datos.objetivo, contexto.meta(usuario.id, id, "objetivo")),
      p_fecha_meta: datos.fechaMeta?.fecha ?? null,
      p_fecha_meta_es_mes: datos.fechaMeta?.esMes ?? false,
      p_aporte: aporte,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "crear_meta",
      args as unknown as Funciones["crear_meta"]["Args"],
    );
    if (error) throw traducir(error);
    return id;
  }

  /** Aporte o retiro y, con origen, su transferencia, en una sola transacción. */
  async registrarAporte(
    usuario: UsuarioAutenticado,
    metaId: string,
    datos: AporteNuevo,
  ): Promise<void> {
    const a = this.argumentosAporte(usuario, datos);
    const args = {
      p_id: a.id,
      p_meta_id: metaId,
      p_tipo: datos.tipo,
      p_monto: a.monto,
      p_fecha: datos.fecha,
      p_motivo: datos.motivo,
      p_inicial: false,
      p_movimiento_id: a.movimiento_id,
      p_monto_movimiento: a.monto_movimiento,
      p_cuenta_origen_id: datos.cuentaOrigenId,
      p_descripcion: datos.descripcion,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "registrar_aporte",
      args as unknown as Funciones["registrar_aporte"]["Args"],
    );
    if (error) throw traducir(error);
  }

  /** Aporte a una meta de modo `cuenta`: una transferencia común (N-41). */
  async registrarTransferencia(
    usuario: UsuarioAutenticado,
    datos: TransferenciaNueva,
  ): Promise<string> {
    const id = randomUUID();
    const args = {
      p_id: id,
      p_tipo: "transferencia",
      p_monto: this.cifrador.cifrar(datos.monto, contexto.movimiento(usuario.id, id)),
      p_fecha: datos.fecha,
      p_descripcion: datos.descripcion,
      p_nota: null,
      p_cuenta_origen_id: datos.cuentaOrigenId,
      p_cuenta_destino_id: datos.cuentaDestinoId,
      p_categoria_id: null,
      p_partes: null,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "registrar_movimiento",
      args as unknown as Funciones["registrar_movimiento"]["Args"],
    );
    if (error) throw traducir(error);
    return id;
  }

  private async actualizarFila(
    usuario: UsuarioAutenticado,
    id: string,
    fila: TablesUpdate<"metas">,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("metas")
      .update(fila)
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("META_NO_ENCONTRADA");
  }

  /**
   * Un objetivo igual al guardado conserva su texto cifrado: el trigger de
   * `metas_cambios` compara textos y no debe registrar cambios falsos (RN-13).
   */
  async actualizar(
    usuario: UsuarioAutenticado,
    actual: Pick<Meta, "id">,
    cambios: CambiosMeta,
  ): Promise<void> {
    let objetivo: string | undefined;
    if (cambios.objetivo !== undefined) {
      const { data, error } = await this.cliente(usuario.token)
        .from("metas")
        .select("objetivo")
        .eq("id", actual.id)
        .maybeSingle();
      if (error) throw traducir(error);
      if (data === null) throw new ErrorApi("META_NO_ENCONTRADA");
      objetivo = this.cifrador.cifrarSiCambia(
        cambios.objetivo,
        data.objetivo,
        contexto.meta(usuario.id, actual.id, "objetivo"),
      );
    }
    const fila: TablesUpdate<"metas"> = {
      ...(cambios.nombre === undefined ? {} : { nombre: cambios.nombre }),
      ...(cambios.cuentaId === undefined ? {} : { cuenta_id: cambios.cuentaId }),
      ...(cambios.modo === undefined ? {} : { modo: cambios.modo }),
      ...(objetivo === undefined ? {} : { objetivo }),
      ...(cambios.fechaMeta === undefined
        ? {}
        : {
            fecha_meta: cambios.fechaMeta?.fecha ?? null,
            fecha_meta_es_mes: cambios.fechaMeta?.esMes ?? false,
          }),
    };
    if (Object.keys(fila).length === 0) return;
    await this.actualizarFila(usuario, actual.id, fila);
  }

  /** Borra la meta y, en cascada, sus aportes. Sus transferencias siguen en movimientos. */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("metas")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("META_NO_ENCONTRADA");
  }

  archivar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.actualizarFila(usuario, id, { archivada_en: new Date().toISOString() });
  }

  /** Los triggers validan la cuenta archivada y la exclusividad. */
  restaurar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.actualizarFila(usuario, id, { archivada_en: null });
  }

  /** Solo la primera vez: `cumplida_en is null` en el update (como SPEC 11 con los precios). */
  async guardarCumplimiento(
    usuario: UsuarioAutenticado,
    id: string,
    fecha: string,
    avance: bigint,
  ): Promise<void> {
    const { error } = await this.cliente(usuario.token)
      .from("metas")
      .update({
        cumplida_en: fecha,
        avance_cumplida: this.cifrador.cifrar(
          avance,
          contexto.meta(usuario.id, id, "avance_cumplida"),
        ),
      })
      .eq("id", id)
      .is("cumplida_en", null);
    if (error) throw traducir(error);
  }

  /**
   * Sin origen: monto, fecha y motivo en la fila, recifrando solo si el monto
   * cambió. Con origen: la transferencia con `reemplazar_movimiento` (su
   * historial queda en `movimientos_cambios`) y el motivo en la fila.
   */
  async actualizarAporte(
    usuario: UsuarioAutenticado,
    aporte: Aporte,
    cambios: CambiosAporte,
  ): Promise<void> {
    const cliente = this.cliente(usuario.token);
    if (aporte.movimientoId === null) {
      const { data, error } = await cliente
        .from("metas_movimientos")
        .select("monto")
        .eq("id", aporte.id)
        .maybeSingle();
      if (error) throw traducir(error);
      if (data === null) throw new ErrorApi("APORTE_NO_ENCONTRADO");
      const { error: errorUpdate } = await cliente
        .from("metas_movimientos")
        .update({
          monto: this.cifrador.cifrarSiCambia(
            cambios.monto,
            data.monto,
            contexto.aporteMeta(usuario.id, aporte.id),
          ),
          fecha: cambios.fecha,
          motivo: cambios.motivo,
        })
        .eq("id", aporte.id);
      if (errorUpdate) throw traducir(errorUpdate);
      return;
    }

    const movimientoId = aporte.movimientoId;
    const { data: actual, error } = await cliente
      .from("movimientos")
      .select("monto, descripcion, nota, cuenta_destino_id")
      .eq("id", movimientoId)
      .maybeSingle();
    if (error) throw traducir(error);
    if (actual === null) throw new ErrorApi("APORTE_NO_ENCONTRADO");
    const args = {
      p_id: movimientoId,
      p_tipo: "transferencia",
      p_monto: this.cifrador.cifrarSiCambia(
        cambios.monto,
        actual.monto,
        contexto.movimiento(usuario.id, movimientoId),
      ),
      p_fecha: cambios.fecha,
      p_descripcion: actual.descripcion,
      p_nota: actual.nota,
      p_cuenta_origen_id: cambios.cuentaOrigenId,
      p_cuenta_destino_id: actual.cuenta_destino_id,
      p_categoria_id: null,
      p_partes: null,
    };
    const { error: errorReemplazo } = await cliente.rpc(
      "reemplazar_movimiento",
      args as unknown as Funciones["reemplazar_movimiento"]["Args"],
    );
    if (errorReemplazo) throw traducir(errorReemplazo);
    if (cambios.motivo !== aporte.motivo) {
      const { error: errorMotivo } = await cliente
        .from("metas_movimientos")
        .update({ motivo: cambios.motivo })
        .eq("id", aporte.id);
      if (errorMotivo) throw traducir(errorMotivo);
    }
  }

  /**
   * Sin origen: borra la fila. Con origen: borra su transferencia con
   * historial (`eliminar_movimiento`, RN-13) y el aporte cae en cascada.
   */
  async eliminarAporte(usuario: UsuarioAutenticado, aporte: Aporte): Promise<void> {
    const cliente = this.cliente(usuario.token);
    if (aporte.movimientoId !== null) {
      const { error } = await cliente.rpc("eliminar_movimiento", { p_id: aporte.movimientoId });
      if (error) throw traducir(error);
      return;
    }
    const { data, error } = await cliente
      .from("metas_movimientos")
      .delete()
      .eq("id", aporte.id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("APORTE_NO_ENCONTRADO");
  }
}
