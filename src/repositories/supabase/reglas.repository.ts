/**
 * Reglas de categorización con el cliente del usuario (RLS: select, insert y
 * update propios; sin delete). `usuario_id` lo pone el default `auth.uid()`.
 * La FK compuesta (usuario_id, categoria_id) rechaza una categoría ajena.
 */
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ErrorApi } from "../../comun/error-api.js";
import type { Regla } from "../../domain/categorizacion/proponer.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

const COLUMNAS = "id, palabra_clave, categoria_id, creado_en";

type Fila = { id: string; palabra_clave: string; categoria_id: string; creado_en: string };

function aRegla(fila: Fila): Regla {
  return {
    id: fila.id,
    palabraClave: fila.palabra_clave,
    categoriaId: fila.categoria_id,
    creadoEn: new Date(fila.creado_en),
  };
}

function traducir(error: PostgrestError): Error {
  if (error.code === "23505" && error.message.includes("reglas_palabra_unica")) {
    return new ErrorApi("PALABRA_CLAVE_DUPLICADA");
  }
  if (error.code === "23503" && error.message.includes("reglas_categoria_categoria_fkey")) {
    return new ErrorApi("CATEGORIA_INVALIDA", "categoriaId");
  }
  return errorInterno(error);
}

@Injectable()
export class ReglasRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  async listar(token: string): Promise<Regla[]> {
    const { data, error } = await this.cliente(token).from("reglas_categoria").select(COLUMNAS);
    if (error) throw traducir(error);
    return data.map(aRegla);
  }

  /** `palabraClave` llega ya normalizada por el dominio. */
  async crear(token: string, palabraClave: string, categoriaId: string): Promise<Regla> {
    const { data, error } = await this.cliente(token)
      .from("reglas_categoria")
      .insert({ palabra_clave: palabraClave, categoria_id: categoriaId })
      .select(COLUMNAS)
      .single();
    if (error) throw traducir(error);
    return aRegla(data);
  }

  /** Una regla ajena no es visible por RLS: 0 filas → REGLA_NO_ENCONTRADA. */
  async cambiarCategoria(token: string, id: string, categoriaId: string): Promise<Regla> {
    const { data, error } = await this.cliente(token)
      .from("reglas_categoria")
      .update({ categoria_id: categoriaId })
      .eq("id", id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) throw new ErrorApi("REGLA_NO_ENCONTRADA");
    return aRegla(data);
  }
}
