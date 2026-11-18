/**
 * Verificación de tokens contra Supabase Auth (RN-20). La API no emite tokens:
 * comprueba firma y vigencia (JWKS si el proyecto usa claves asimétricas; si no,
 * consulta al proveedor) y extrae la identidad.
 */
import { Injectable } from "@nestjs/common";
import { ClienteSupabase } from "./cliente.js";

@Injectable()
export class AutenticacionRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  /** Id del usuario dueño del token, o `null` si el token es inválido, ajeno o venció. */
  async verificarToken(token: string): Promise<string | null> {
    const { data, error } = await this.supabase.auth.getClaims(token);
    if (error || !data?.claims.sub) return null;
    return data.claims.sub;
  }
}
