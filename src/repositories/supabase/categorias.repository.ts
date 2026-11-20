/**
 * Categorías sembradas, con el cliente del usuario: la política RLS
 * `categorias_select_propia` deja ver solo las propias (RN-12). Solo lectura.
 */
import { Injectable } from "@nestjs/common";
import type { Categoria } from "../../domain/categorizacion/categoria.js";
import type { TipoCategoria } from "../../domain/categorizacion/proponer.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";

const COLUMNAS = "id, nombre, tipo, posicion";

type Fila = { id: string; nombre: string; tipo: string; posicion: number };

function aTipo(valor: string): TipoCategoria {
  if (valor === "gasto" || valor === "ingreso") return valor;
  throw new Error(`Tipo de categoría desconocido: ${valor}`);
}

function aCategoria(fila: Fila): Categoria {
  return { id: fila.id, nombre: fila.nombre, tipo: aTipo(fila.tipo), posicion: fila.posicion };
}

@Injectable()
export class CategoriasRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  /** Todas las del usuario, por tipo y en el orden de la semilla. */
  async listar(token: string): Promise<Categoria[]> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .from("categorias")
      .select(COLUMNAS)
      .order("tipo")
      .order("posicion");
    if (error) throw errorInterno(error);
    return data.map(aCategoria);
  }

  /** `null` si no existe o es de otro usuario. */
  async obtener(token: string, id: string): Promise<Categoria | null> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .from("categorias")
      .select(COLUMNAS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw errorInterno(error);
    return data === null ? null : aCategoria(data);
  }
}
