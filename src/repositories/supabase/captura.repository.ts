/**
 * Consultas analíticas de la captura (REGLAS §5: en SQL, no en memoria):
 * `gastos_del_dia`, `conceptos_frecuentes` y `conceptos_por_prefijo`. Son
 * security invoker: la RLS de movimientos limita al usuario del token.
 */
import { Injectable } from "@nestjs/common";
import type { TipoMovimiento } from "../../domain/movimiento/movimiento.js";
import { TIPOS_MOVIMIENTO } from "../../domain/movimiento/movimiento.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";

export type ConceptoFrecuente = { tipo: TipoMovimiento; descripcion: string };

function aTipo(valor: string): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

@Injectable()
export class CapturaRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  /** Suma de los gastos con esa fecha. El total viaja como texto (`total::text`), nunca como number. */
  async gastosDelDia(token: string, fecha: string): Promise<bigint> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .rpc("gastos_del_dia", { p_fecha: fecha })
      .select("total::text")
      .single();
    if (error) throw errorInterno(error);
    const total: unknown = (data as { total: unknown }).total;
    if (typeof total !== "string" || !/^\d+$/.test(total)) {
      throw new Error(`gastos_del_dia.total no llegó como texto entero: ${String(total)}`);
    }
    return BigInt(total);
  }

  /** Por tipo, las `limite` descripciones más usadas desde `desde`, la más usada primero. */
  async conceptosFrecuentes(
    token: string,
    desde: string,
    limite: number,
  ): Promise<ConceptoFrecuente[]> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .rpc("conceptos_frecuentes", { p_desde: desde, p_limite: limite });
    if (error) throw errorInterno(error);
    return data.map((f) => ({ tipo: aTipo(f.tipo), descripcion: f.descripcion }));
  }

  /** Descripciones del tipo que empiezan por `prefijo`, sin mayúsculas ni tildes, por frecuencia. */
  async conceptosPorPrefijo(
    token: string,
    tipo: TipoMovimiento,
    prefijo: string,
    limite: number,
  ): Promise<string[]> {
    const { data, error } = await this.supabase.paraUsuario(token).rpc("conceptos_por_prefijo", {
      p_tipo: tipo,
      p_prefijo: prefijo,
      p_limite: limite,
    });
    if (error) throw errorInterno(error);
    return data.map((f) => f.descripcion);
  }
}
