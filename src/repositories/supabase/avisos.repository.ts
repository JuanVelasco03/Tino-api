/**
 * Avisos con el cliente del usuario (RN-19): las políticas RLS garantizan que
 * solo toca sus propias filas (RN-12). Ninguna tabla guarda montos.
 *
 * - `avisos_config`: la antelación por tipo. Upsert por `(usuario_id, tipo)`.
 * - `avisos_leidos`: la marca de leído por clave. Upsert por
 *   `(usuario_id, clave)` que fija `leido` y `marcado_en`. Sin DELETE.
 *
 * Los avisos en sí no se guardan: los deriva `domain/aviso/` (SPEC 12).
 */
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import { esTipoAviso, type ConfigAviso, type MarcaLeido } from "../../domain/aviso/aviso.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  if (error.code === "23514") {
    // Defensa: el dominio valida las opciones antes de escribir.
    if (error.message.includes("avisos_config_dias_check")) {
      return new ErrorApi("ANTELACION_INVALIDA");
    }
    if (error.message.includes("avisos_leidos_clave_check")) {
      return new ErrorApi("ENTRADA_INVALIDA");
    }
  }
  return errorInterno(error);
}

@Injectable()
export class AvisosRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  /** Las filas guardadas de `avisos_config` (los tipos sin fila valen el valor por defecto). */
  async leerConfig(usuario: UsuarioAutenticado): Promise<ConfigAviso[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("avisos_config")
      .select("tipo, activo, dias");
    if (error) throw traducir(error);
    return data.map((f) => {
      if (!esTipoAviso(f.tipo)) throw new Error(`Tipo de aviso desconocido: ${f.tipo}`);
      return { tipo: f.tipo, activo: f.activo, dias: f.dias };
    });
  }

  async leerMarcas(usuario: UsuarioAutenticado): Promise<MarcaLeido[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("avisos_leidos")
      .select("clave, leido");
    if (error) throw traducir(error);
    return data.map((f) => ({ clave: f.clave, leido: f.leido }));
  }

  async guardarConfig(usuario: UsuarioAutenticado, config: ConfigAviso): Promise<void> {
    const { error } = await this.cliente(usuario.token)
      .from("avisos_config")
      .upsert(
        { usuario_id: usuario.id, tipo: config.tipo, activo: config.activo, dias: config.dias },
        { onConflict: "usuario_id,tipo" },
      );
    if (error) throw traducir(error);
  }

  /** Fija `leido` en todas las `claves`, en una sola escritura. Sin claves, no escribe. */
  async marcar(
    usuario: UsuarioAutenticado,
    claves: readonly string[],
    leido: boolean,
  ): Promise<void> {
    if (claves.length === 0) return;
    const marcadoEn = new Date().toISOString();
    const { error } = await this.cliente(usuario.token)
      .from("avisos_leidos")
      .upsert(
        claves.map((clave) => ({ usuario_id: usuario.id, clave, leido, marcado_en: marcadoEn })),
        { onConflict: "usuario_id,clave" },
      );
    if (error) throw traducir(error);
  }
}
