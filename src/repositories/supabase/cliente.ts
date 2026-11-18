/**
 * ÚNICO archivo del proyecto que construye clientes de Supabase (RN-19).
 *
 * Solo usa la clave publicable. El cliente de datos porta el token del usuario
 * en la cabecera Authorization, de modo que las políticas a nivel de fila
 * evalúan al usuario real (RN-12). La clave `service_role` jamás se usa aquí
 * ni en ningún punto del ciclo de petición (REGLAS §4).
 *
 * Si necesitas otro cliente, se agrega aquí, no en otro archivo.
 */
import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { leerEnv } from "../../config/env.js";
import type { Database } from "./tipos.js";

// Servidor sin estado: nada de sesión persistida ni refresco automático.
const SIN_SESION = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

@Injectable()
export class ClienteSupabase {
  private readonly env = leerEnv();

  /** Cliente sin usuario, solo para verificar tokens contra el proveedor (RN-20). */
  private readonly anonimo = createClient<Database>(
    this.env.supabaseUrl,
    this.env.supabasePublishableKey,
    { auth: SIN_SESION },
  );

  get auth(): SupabaseClient<Database>["auth"] {
    return this.anonimo.auth;
  }

  /** Cliente de datos que actúa como el usuario dueño del token. Uno por petición. */
  paraUsuario(token: string): SupabaseClient<Database> {
    return createClient<Database>(this.env.supabaseUrl, this.env.supabasePublishableKey, {
      auth: SIN_SESION,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
}
