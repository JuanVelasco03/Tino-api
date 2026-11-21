/**
 * Recurrentes con el cliente del usuario (RN-19): las políticas RLS garantizan
 * que solo toca sus propias filas (RN-12).
 *
 * - Plantillas: lectura de la vista `recurrentes_detalle`; escritura directa en
 *   `recurrentes` (RLS). El historial lo escribe el trigger.
 * - Cierres: omitir y deshacer la omisión con insert y delete directos (las
 *   políticas solo admiten `estado = 'omitida'`). Confirmar por
 *   `confirmar_ocurrencia`, que crea el movimiento y el cierre en una sola
 *   transacción.
 *
 * Montos cifrados (SPEC 05): el de la plantilla con la AAD
 * `<usuario>|recurrentes|monto|<id>`; el del movimiento confirmado, con la de
 * `movimientos`. El `id` de la plantilla y el del movimiento los genera la API.
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
  esPeriodicidad,
  type Cierre,
  type Periodicidad,
  type Recurrente,
  type RecurrenteEntrada,
} from "../../domain/recurrente/recurrente.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";
import type { Database, TablesInsert, TablesUpdate } from "./tipos.js";

const COLUMNAS =
  "id, tipo, concepto, monto, variable, periodicidad, primer_vencimiento, ultimo_dia, " +
  "generar_desde, pausada_desde, cuenta_origen_id, cuenta_origen_nombre, " +
  "cuenta_destino_id, cuenta_destino_nombre, categoria_id, categoria_nombre, " +
  "creado_en, actualizado_en";

const COLUMNAS_CIERRE =
  "recurrente_id, vencimiento, estado, movimiento_id, " +
  "movimiento:movimientos!recurrentes_cierres_movimiento_fkey(monto)";

/** Plantilla leída, con los nombres de sus cuentas y su categoría. */
export type PlantillaLeida = Recurrente & {
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;
  creadoEn: Date;
  actualizadoEn: Date;
};

export type LecturaRecurrentes = { plantillas: PlantillaLeida[]; cierres: Cierre[] };

/** Columnas del calendario que fija el servicio (SPEC 07, reglas de escritura). */
export type CalendarioEscrito = { generarDesde: string; pausadaDesde: string | null };

type FilaDetalle = {
  id: string | null;
  tipo: string | null;
  concepto: string | null;
  monto: unknown;
  variable: boolean | null;
  periodicidad: string | null;
  primer_vencimiento: string | null;
  ultimo_dia: boolean | null;
  generar_desde: string | null;
  pausada_desde: string | null;
  cuenta_origen_id: string | null;
  cuenta_origen_nombre: string | null;
  cuenta_destino_id: string | null;
  cuenta_destino_nombre: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
};

type FilaCierre = {
  recurrente_id: string;
  vencimiento: string;
  estado: string;
  movimiento_id: string | null;
  movimiento: { monto: unknown } | null;
};

function requerido<T>(valor: T | null, columna: string): T {
  if (valor === null) throw new Error(`recurrentes_detalle.${columna} llegó nulo.`);
  return valor;
}

function aTipo(valor: string | null): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de recurrente desconocido: ${valor}`);
  return tipo;
}

function aPeriodicidad(valor: string | null): Periodicidad {
  if (valor === null || !esPeriodicidad(valor)) {
    throw new Error(`Periodicidad desconocida: ${valor}`);
  }
  return valor;
}

function aRef(id: string | null, nombre: string | null): Ref | null {
  return id === null ? null : { id, nombre: requerido(nombre, "nombre") };
}

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  const deFuncion = desdeFuncion(error);
  if (deFuncion) return deFuncion;
  if (error.code === "23505" && error.message.includes("recurrentes_cierres_unico")) {
    return new ErrorApi("OCURRENCIA_CERRADA");
  }
  if (error.code === "23503") {
    if (error.message.includes("recurrentes_cuenta_origen_fkey")) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaOrigenId");
    }
    if (error.message.includes("recurrentes_cuenta_destino_fkey")) {
      return new ErrorApi("CUENTA_INVALIDA", "cuentaDestinoId");
    }
    if (error.message.includes("recurrentes_categoria_fkey")) {
      return new ErrorApi("CATEGORIA_INVALIDA", "categoriaId");
    }
    // Cierre de una plantilla que no existe o no es del usuario.
    if (error.message.includes("recurrentes_cierres_recurrente_fkey")) {
      return new ErrorApi("RECURRENTE_NO_ENCONTRADO");
    }
  }
  return errorInterno(error);
}

@Injectable()
export class RecurrentesRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aPlantilla(usuarioId: string, f: FilaDetalle): PlantillaLeida {
    const id = requerido(f.id, "id");
    return {
      id,
      tipo: aTipo(f.tipo),
      concepto: requerido(f.concepto, "concepto"),
      monto: this.cifrador.descifrar(f.monto, contexto.recurrente(usuarioId, id)),
      variable: requerido(f.variable, "variable"),
      periodicidad: aPeriodicidad(f.periodicidad),
      primerVencimiento: requerido(f.primer_vencimiento, "primer_vencimiento"),
      ultimoDia: requerido(f.ultimo_dia, "ultimo_dia"),
      generarDesde: requerido(f.generar_desde, "generar_desde"),
      pausadaDesde: f.pausada_desde,
      cuentaOrigenId: f.cuenta_origen_id,
      cuentaDestinoId: f.cuenta_destino_id,
      categoriaId: f.categoria_id,
      cuentaOrigen: aRef(f.cuenta_origen_id, f.cuenta_origen_nombre),
      cuentaDestino: aRef(f.cuenta_destino_id, f.cuenta_destino_nombre),
      categoria: aRef(f.categoria_id, f.categoria_nombre),
      creadoEn: new Date(requerido(f.creado_en, "creado_en")),
      actualizadoEn: new Date(requerido(f.actualizado_en, "actualizado_en")),
    };
  }

  private aCierre(usuarioId: string, f: FilaCierre): Cierre {
    if (f.estado !== "confirmada" && f.estado !== "omitida") {
      throw new Error(`Estado de cierre desconocido: ${f.estado}`);
    }
    const confirmada = f.estado === "confirmada";
    if (confirmada && (f.movimiento_id === null || f.movimiento === null)) {
      throw new Error(`Cierre confirmado sin movimiento: ${f.recurrente_id} ${f.vencimiento}`);
    }
    return {
      recurrenteId: f.recurrente_id,
      vencimiento: f.vencimiento,
      estado: f.estado,
      movimientoId: f.movimiento_id,
      montoMovimiento: confirmada
        ? this.cifrador.descifrar(
            f.movimiento!.monto,
            contexto.movimiento(usuarioId, f.movimiento_id!),
          )
        : null,
    };
  }

  /**
   * Plantillas y cierres del usuario (o solo los de la plantilla `id`), con el
   * monto actual del movimiento de cada confirmada. Dos lecturas en paralelo,
   * solo con las columnas necesarias.
   */
  async leer(usuario: UsuarioAutenticado, id?: string): Promise<LecturaRecurrentes> {
    let plantillas = this.cliente(usuario.token).from("recurrentes_detalle").select(COLUMNAS);
    let cierres = this.cliente(usuario.token).from("recurrentes_cierres").select(COLUMNAS_CIERRE);
    if (id !== undefined) {
      plantillas = plantillas.eq("id", id);
      cierres = cierres.eq("recurrente_id", id);
    }
    const [p, c] = await Promise.all([plantillas, cierres]);
    if (p.error) throw traducir(p.error);
    if (c.error) throw traducir(c.error);
    return {
      plantillas: (p.data as unknown as FilaDetalle[]).map((f) => this.aPlantilla(usuario.id, f)),
      cierres: (c.data as unknown as FilaCierre[]).map((f) => this.aCierre(usuario.id, f)),
    };
  }

  private fila(
    usuarioId: string,
    id: string,
    e: RecurrenteEntrada,
    calendario: CalendarioEscrito,
    montoGuardado: string | null,
  ) {
    return {
      tipo: e.tipo,
      concepto: e.concepto.trim(),
      monto: this.cifrador.cifrarSiCambia(
        e.monto,
        montoGuardado,
        contexto.recurrente(usuarioId, id),
      ),
      variable: e.variable,
      periodicidad: e.periodicidad,
      primer_vencimiento: e.primerVencimiento,
      ultimo_dia: e.ultimoDia,
      generar_desde: calendario.generarDesde,
      pausada_desde: calendario.pausadaDesde,
      cuenta_origen_id: e.cuentaOrigenId,
      cuenta_destino_id: e.cuentaDestinoId,
      categoria_id: e.categoriaId,
    };
  }

  /** Devuelve el id de la plantilla creada (lo genera la API: AAD del monto). */
  async crear(
    usuario: UsuarioAutenticado,
    e: RecurrenteEntrada,
    calendario: CalendarioEscrito,
  ): Promise<string> {
    const id = randomUUID();
    const fila = { id, ...this.fila(usuario.id, id, e, calendario, null) };
    const { error } = await this.cliente(usuario.token)
      .from("recurrentes")
      .insert(fila as TablesInsert<"recurrentes">);
    if (error) throw traducir(error);
    return id;
  }

  private async actualizarFila(
    usuario: UsuarioAutenticado,
    id: string,
    fila: TablesUpdate<"recurrentes">,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("recurrentes")
      .update(fila)
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("RECURRENTE_NO_ENCONTRADO");
  }

  /**
   * Reemplazo completo (PUT). Un monto igual al guardado conserva su texto
   * cifrado: el trigger del historial compara las fotos y no debe registrar
   * cambios falsos (RN-13).
   */
  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    e: RecurrenteEntrada,
    calendario: CalendarioEscrito,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("recurrentes")
      .select("monto")
      .eq("id", id)
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) throw new ErrorApi("RECURRENTE_NO_ENCONTRADO");
    await this.actualizarFila(
      usuario,
      id,
      this.fila(usuario.id, id, e, calendario, (data as { monto: string }).monto),
    );
  }

  /** Pausa o reanudación: solo las columnas del calendario. */
  cambiarCalendario(
    usuario: UsuarioAutenticado,
    id: string,
    calendario: CalendarioEscrito,
  ): Promise<void> {
    return this.actualizarFila(usuario, id, {
      generar_desde: calendario.generarDesde,
      pausada_desde: calendario.pausadaDesde,
    });
  }

  /** Borrado físico: los cierres caen en cascada; los movimientos se quedan. */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("recurrentes")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("RECURRENTE_NO_ENCONTRADO");
  }

  /**
   * Movimiento y cierre en una sola transacción. El monto se cifra con el id
   * nuevo del movimiento. Devuelve ese id.
   */
  async confirmar(
    usuario: UsuarioAutenticado,
    recurrenteId: string,
    vencimiento: string,
    monto: bigint,
  ): Promise<string> {
    const movimientoId = randomUUID();
    const { data, error } = await this.cliente(usuario.token).rpc("confirmar_ocurrencia", {
      p_recurrente_id: recurrenteId,
      p_vencimiento: vencimiento,
      p_movimiento_id: movimientoId,
      p_monto: this.cifrador.cifrar(monto, contexto.movimiento(usuario.id, movimientoId)),
    });
    if (error) throw traducir(error);
    return data;
  }

  async omitir(
    usuario: UsuarioAutenticado,
    recurrenteId: string,
    vencimiento: string,
  ): Promise<void> {
    const { error } = await this.cliente(usuario.token)
      .from("recurrentes_cierres")
      .insert({ recurrente_id: recurrenteId, vencimiento, estado: "omitida" });
    if (error) throw traducir(error);
  }

  async deshacerOmision(
    usuario: UsuarioAutenticado,
    recurrenteId: string,
    vencimiento: string,
  ): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("recurrentes_cierres")
      .delete()
      .eq("recurrente_id", recurrenteId)
      .eq("vencimiento", vencimiento)
      .eq("estado", "omitida")
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("OMISION_NO_ENCONTRADA");
  }
}
