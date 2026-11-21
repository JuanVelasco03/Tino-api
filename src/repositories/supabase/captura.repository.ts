/**
 * Consultas de la captura. `conceptos_frecuentes` y `conceptos_por_prefijo`
 * son funciones de Postgres (REGLAS §5); son security invoker: la RLS de
 * movimientos limita al usuario del token.
 *
 * Los gastos del día se traen descifrados y se suman en el dominio: la base
 * solo guarda montos cifrados (SPEC 05, excepción de REGLAS §5).
 */
import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import type { TipoMovimiento } from "../../domain/movimiento/movimiento.js";
import { TIPOS_MOVIMIENTO } from "../../domain/movimiento/movimiento.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";

export type ConceptoFrecuente = { tipo: TipoMovimiento; descripcion: string };

export type MontoDelDia = { tipo: TipoMovimiento; monto: bigint };

function aTipo(valor: string): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

@Injectable()
export class CapturaRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  /** Gastos con esa fecha, descifrados. El filtro por tipo y fecha lo hace SQL. */
  async gastosDelDia(usuario: UsuarioAutenticado, fecha: string): Promise<MontoDelDia[]> {
    const { data, error } = await this.supabase
      .paraUsuario(usuario.token)
      .from("movimientos")
      .select("id, tipo, monto")
      .eq("fecha", fecha)
      .eq("tipo", "gasto");
    if (error) throw errorInterno(error);
    return (data as unknown as { id: string; tipo: string; monto: string }[]).map((m) => ({
      tipo: aTipo(m.tipo),
      monto: this.cifrador.descifrar(m.monto, contexto.movimiento(usuario.id, m.id)),
    }));
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
