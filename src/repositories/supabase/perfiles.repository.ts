/**
 * Acceso a la tabla `perfiles` con el cliente del usuario: las políticas RLS
 * `perfiles_select_propio` y `perfiles_update_propio` garantizan que solo se
 * lee y cambia su propio perfil (RN-12).
 */
import { Injectable } from "@nestjs/common";
import { ErrorApi } from "../../comun/error-api.js";
import type { Perfil } from "../../domain/perfil/perfil.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";
import type { Tables } from "./tipos.js";

function aPerfil(fila: Tables<"perfiles">): Perfil {
  return {
    id: fila.id,
    nombre: fila.nombre,
    monedaBase: fila.moneda_base === "USD" ? "USD" : "COP",
    zonaHoraria: fila.zona_horaria,
    primerUsoCompletado: fila.primer_uso_completado,
    cuentaPredeterminadaId: fila.cuenta_predeterminada_id,
  };
}

export type CambiosPerfil = { cuentaPredeterminadaId: string | null };

@Injectable()
export class PerfilesRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  /** Perfil del dueño del token, o `null` si no tiene fila (p. ej. anterior a SPEC 02). */
  async leerPropio(token: string): Promise<Perfil | null> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .from("perfiles")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
    return data === null ? null : aPerfil(data);
  }

  /**
   * Actualiza el perfil del dueño del token. `null` si no tiene fila. La FK
   * compuesta (id, cuenta) rechaza una cuenta ajena o inexistente.
   */
  async actualizar(token: string, id: string, cambios: CambiosPerfil): Promise<Perfil | null> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .from("perfiles")
      .update({ cuenta_predeterminada_id: cambios.cuentaPredeterminadaId })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error?.code === "23503" && error.message.includes("perfiles_cuenta_predeterminada_fkey")) {
      throw new ErrorApi("CUENTA_INVALIDA", "cuentaPredeterminadaId");
    }
    if (error) throw errorInterno(error);
    return data === null ? null : aPerfil(data);
  }
}
