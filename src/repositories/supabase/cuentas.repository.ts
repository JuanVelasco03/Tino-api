/**
 * Acceso a cuentas con el cliente del usuario: las políticas RLS de `cuentas`
 * garantizan que solo toca sus propias filas (RN-12, RN-19).
 *
 * Montos cifrados (SPEC 05): `saldo_inicial` y `cupo` se guardan como texto
 * cifrado por `CifradorMontos`; aquí se cifran al escribir y se descifran al
 * leer. Devuelve cuentas sin saldo (`CuentaGuardada`) y los efectos de los
 * movimientos para que el servicio calcule el saldo en el dominio (RN-01).
 *
 * Préstamos (SPEC 08): las cuentas de préstamo no son cuentas propias. Todas
 * las lecturas y escrituras de este repositorio las excluyen, así que un
 * préstamo en `/cuentas/:id` es una cuenta inexistente. Solo
 * `listarPrestamos` las lee, para que el servicio las sume al patrimonio.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPOS_EN_ALCANCE,
  type CuentaGuardada,
  type TipoCuentaEnAlcance,
} from "../../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../../domain/cuenta/naturaleza.js";
import type { EfectoMovimiento } from "../../domain/cuenta/saldo.js";
import {
  TIPOS_PRESTAMO,
  esTipoPrestamo,
  type TipoPrestamo,
} from "../../domain/prestamo/prestamo.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import type { Database, TablesInsert, TablesUpdate } from "./tipos.js";

const COLUMNAS = "id, nombre, tipo, detalle, saldo_inicial, cupo, posicion, archivada_en";

/** Lista de PostgREST para `.not("tipo", "in", …)`: excluye los préstamos. */
const TIPOS_DE_PRESTAMO = `(${TIPOS_PRESTAMO.join(",")})`;

type Fila = {
  id: string;
  nombre: string;
  tipo: string;
  detalle: string | null;
  saldo_inicial: string;
  cupo: string | null;
  posicion: number;
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

function aTipo(valor: string): TipoCuentaEnAlcance {
  const tipo = TIPOS_EN_ALCANCE.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de cuenta desconocido: ${valor}`);
  return tipo;
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

@Injectable()
export class CuentasRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aCuenta(usuarioId: string, fila: Fila): CuentaGuardada {
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo: aTipo(fila.tipo),
      detalle: fila.detalle,
      saldoInicial: this.cifrador.descifrar(
        fila.saldo_inicial,
        contexto.cuenta(usuarioId, fila.id, "saldo_inicial"),
      ),
      cupo:
        fila.cupo === null
          ? null
          : this.cifrador.descifrar(fila.cupo, contexto.cuenta(usuarioId, fila.id, "cupo")),
      posicion: fila.posicion,
      archivadaEn: fila.archivada_en === null ? null : new Date(fila.archivada_en),
    };
  }

  /** No archivadas, en el orden del usuario. */
  async listar(usuario: UsuarioAutenticado): Promise<CuentaGuardada[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .is("archivada_en", null)
      .order("posicion")
      .order("creado_en");
    if (error) throw traducir(error);
    return (data as Fila[]).map((f) => this.aCuenta(usuario.id, f));
  }

  /** Archivadas, la más reciente primero. */
  async listarArchivadas(usuario: UsuarioAutenticado): Promise<CuentaGuardada[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .not("archivada_en", "is", null)
      .order("archivada_en", { ascending: false });
    if (error) throw traducir(error);
    return (data as Fila[]).map((f) => this.aCuenta(usuario.id, f));
  }

  /** `null` si no existe, no es visible por RLS (cuenta ajena) o es un préstamo. */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .maybeSingle();
    if (error) throw traducir(error);
    return data === null ? null : this.aCuenta(usuario.id, data as Fila);
  }

  /**
   * Monto y cuentas de los movimientos del usuario (RLS), descifrados. Con
   * `cuentaId`, solo los que la tocan. Trae lo mínimo: el saldo lo calcula el dominio.
   */
  async efectos(usuario: UsuarioAutenticado, cuentaId?: string): Promise<EfectoMovimiento[]> {
    let consulta = this.cliente(usuario.token)
      .from("movimientos")
      .select("id, monto, cuenta_origen_id, cuenta_destino_id");
    if (cuentaId !== undefined) {
      consulta = consulta.or(`cuenta_origen_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`);
    }
    const { data, error } = await consulta;
    if (error) throw traducir(error);
    return (
      data as unknown as {
        id: string;
        monto: string;
        cuenta_origen_id: string | null;
        cuenta_destino_id: string | null;
      }[]
    ).map((m) => ({
      monto: this.cifrador.descifrar(m.monto, contexto.movimiento(usuario.id, m.id)),
      cuentaOrigenId: m.cuenta_origen_id,
      cuentaDestinoId: m.cuenta_destino_id,
    }));
  }

  /** Cuentas de préstamo sin saldo: el servicio calcula su capital (RN-01) para el patrimonio. */
  async listarPrestamos(
    usuario: UsuarioAutenticado,
  ): Promise<{ id: string; tipo: TipoPrestamo; saldoInicial: bigint }[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("id, tipo, saldo_inicial")
      .in("tipo", [...TIPOS_PRESTAMO]);
    if (error) throw traducir(error);
    return (data as { id: string; tipo: string; saldo_inicial: string }[]).map((f) => {
      if (!esTipoPrestamo(f.tipo)) throw new Error(`Tipo de préstamo desconocido: ${f.tipo}`);
      return {
        id: f.id,
        tipo: f.tipo,
        saldoInicial: this.cifrador.descifrar(
          f.saldo_inicial,
          contexto.cuenta(usuario.id, f.id, "saldo_inicial"),
        ),
      };
    });
  }

  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.obtener(usuario, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  /**
   * El `id` lo genera la API: el cifrado se ata a la fila (AAD). `posicion` la
   * asigna el trigger `asignar_posicion`; `usuario_id`, el default `auth.uid()`.
   */
  async crear(usuario: UsuarioAutenticado, datos: DatosAlta): Promise<CuentaGuardada> {
    const id = randomUUID();
    const fila = {
      id,
      nombre: datos.nombre,
      tipo: datos.tipo,
      detalle: datos.detalle,
      saldo_inicial: this.cifrador.cifrar(
        datos.saldoInicial,
        contexto.cuenta(usuario.id, id, "saldo_inicial"),
      ),
      cupo:
        datos.cupo === null
          ? null
          : this.cifrador.cifrar(datos.cupo, contexto.cuenta(usuario.id, id, "cupo")),
    };
    const { error } = await this.cliente(usuario.token)
      .from("cuentas")
      .insert(fila as unknown as TablesInsert<"cuentas">);
    if (error) throw traducir(error);
    return this.obtenerExistente(usuario, id);
  }

  private async actualizarFila(
    usuario: UsuarioAutenticado,
    id: string,
    fila: TablesUpdate<"cuentas">,
  ): Promise<CuentaGuardada> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .update(fila)
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return this.obtenerExistente(usuario, id);
  }

  /** Textos cifrados guardados, para no recifrar lo que no cambió. */
  private async montosGuardados(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<{ saldo_inicial: string; cupo: string | null }> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("saldo_inicial, cupo")
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return data as unknown as { saldo_inicial: string; cupo: string | null };
  }

  /**
   * Un monto igual al guardado conserva su texto cifrado: el trigger de
   * `cuentas_cambios` compara textos y no debe registrar cambios falsos (RN-13).
   */
  async actualizar(
    usuario: UsuarioAutenticado,
    id: string,
    datos: DatosEdicion,
  ): Promise<CuentaGuardada> {
    const montos =
      datos.saldoInicial === undefined && datos.cupo === undefined
        ? null
        : await this.montosGuardados(usuario, id);
    const fila: TablesUpdate<"cuentas"> = {
      ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
      ...(datos.tipo === undefined ? {} : { tipo: datos.tipo }),
      ...(datos.detalle === undefined ? {} : { detalle: datos.detalle }),
      ...(datos.saldoInicial === undefined || montos === null
        ? {}
        : {
            saldo_inicial: this.cifrador.cifrarSiCambia(
              datos.saldoInicial,
              montos.saldo_inicial,
              contexto.cuenta(usuario.id, id, "saldo_inicial"),
            ),
          }),
      ...(datos.cupo === undefined || montos === null
        ? {}
        : {
            cupo: this.cifrador.cifrarSiCambia(
              datos.cupo,
              montos.cupo,
              contexto.cuenta(usuario.id, id, "cupo"),
            ),
          }),
    } as TablesUpdate<"cuentas">;
    return this.actualizarFila(usuario, id, fila);
  }

  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .delete()
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .select("id");
    // FK on delete restrict desde recurrentes (SPEC 07) o desde movimientos
    // (SPEC 04): con movimientos se archiva, no se elimina.
    if (error?.code === "23503") {
      throw new ErrorApi(
        /recurrentes_cuenta_(origen|destino)_fkey/.test(error.message)
          ? "CUENTA_CON_RECURRENTES"
          : "CUENTA_CON_MOVIMIENTOS",
      );
    }
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
  }

  archivar(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    return this.actualizarFila(usuario, id, { archivada_en: new Date().toISOString() });
  }

  /** El nombre nuevo, si llega, se aplica en la misma sentencia; el trigger la manda al final del grupo. */
  restaurar(usuario: UsuarioAutenticado, id: string, nombre?: string): Promise<CuentaGuardada> {
    return this.actualizarFila(usuario, id, {
      ...(nombre === undefined ? {} : { nombre }),
      archivada_en: null,
    });
  }

  async reordenar(
    usuario: UsuarioAutenticado,
    naturaleza: Naturaleza,
    ids: string[],
  ): Promise<void> {
    const { error } = await this.cliente(usuario.token).rpc("reordenar_cuentas", {
      p_naturaleza: naturaleza,
      p_ids: ids,
    });
    if (error) throw traducir(error);
  }
}
