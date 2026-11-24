/**
 * Escrituras del detalle de cuenta (SPEC 14), con el cliente del usuario
 * (RN-19): conciliar movimientos y registrar ajustes de saldo. Las dos son
 * funciones de Postgres (`conciliar_movimientos`, `registrar_ajuste`) que
 * validan la cuenta y dejan el historial (RN-13).
 *
 * El monto del ajuste lo calcula el dominio y se cifra aquí (SPEC 05): la base
 * no ve cifras. El `id` lo genera la API para atar el cifrado a la fila (AAD).
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import type { Ajuste } from "../../domain/cuenta/ajuste.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion, errorInterno } from "./errores.js";

function traducir(error: PostgrestError): Error {
  return desdeFuncion(error) ?? errorInterno(error);
}

@Injectable()
export class DetalleCuentaRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  /** Marca el lado de la cuenta de cada movimiento. Solo registra los que cambian. */
  async conciliar(
    usuario: UsuarioAutenticado,
    cuentaId: string,
    ids: readonly string[],
    conciliado: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.paraUsuario(usuario.token).rpc("conciliar_movimientos", {
      p_cuenta_id: cuentaId,
      p_ids: [...ids],
      p_conciliado: conciliado,
    });
    if (error) throw traducir(error);
  }

  /**
   * Crea el ajuste con fecha `fecha`, conciliado. Con `conciliar`, además
   * concilia los movimientos de la cuenta con fecha ≤ `fecha`. Devuelve su id.
   */
  async registrarAjuste(
    usuario: UsuarioAutenticado,
    cuentaId: string,
    ajuste: Ajuste,
    fecha: string,
    conciliar: boolean,
  ): Promise<string> {
    const id = randomUUID();
    const { data, error } = await this.supabase.paraUsuario(usuario.token).rpc("registrar_ajuste", {
      p_id: id,
      p_cuenta_id: cuentaId,
      p_monto: this.cifrador.cifrar(ajuste.monto, contexto.movimiento(usuario.id, id)),
      p_sube: ajuste.sube,
      p_fecha: fecha,
      p_conciliar: conciliar,
    });
    if (error) throw traducir(error);
    return data;
  }
}
