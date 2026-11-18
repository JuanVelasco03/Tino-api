/**
 * Acceso a la tabla `perfiles` con el cliente del usuario: la política RLS
 * `perfiles_select_propio` garantiza que solo se lee su propio perfil (RN-12).
 */
import { Injectable } from "@nestjs/common";
import type { Perfil } from "../../domain/perfil/perfil.js";
import { ClienteSupabase } from "./cliente.js";
import type { Tables } from "./tipos.js";

function aPerfil(fila: Tables<"perfiles">): Perfil {
  return {
    id: fila.id,
    nombre: fila.nombre,
    monedaBase: fila.moneda_base === "USD" ? "USD" : "COP",
    zonaHoraria: fila.zona_horaria,
    primerUsoCompletado: fila.primer_uso_completado,
  };
}

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
}
