/**
 * Lecturas del resumen del mes (SPEC 06), con el cliente del usuario: las
 * políticas RLS garantizan que solo ve sus propias filas (RN-12, RN-19).
 * Solo lee; no escribe nada.
 *
 * Postgres no suma montos cifrados (SPEC 05): aquí se trae lo mínimo, se
 * descifra con la AAD de la fila de origen y el dominio calcula. El historial
 * de `cuentas_cambios` usa la AAD de `cuentas.saldo_inicial`.
 */
import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { TIPOS_CON_PRESTAMO, type TipoCuentaConPrestamo } from "../../domain/cuenta/cuenta.js";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "../../domain/movimiento/movimiento.js";
import type { MovimientoResumen, ParteResumen } from "../../domain/resumen/resumen.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";
import type { Database } from "./tipos.js";

/** Cuenta tal como la lee el resumen: también las archivadas y los préstamos (SPEC 08). */
export type CuentaLeida = {
  id: string;
  tipo: TipoCuentaConPrestamo;
  saldoInicial: bigint;
  creadoEn: Date;
  archivadaEn: Date | null;
};

export type CambioLeido = {
  cuentaId: string;
  valorAnterior: bigint;
  valorNuevo: bigint;
  cambiadoEn: Date;
};

export type LecturaResumen = {
  cuentas: CuentaLeida[];
  cambios: CambioLeido[];
  movimientos: MovimientoResumen[];
  partes: ParteResumen[];
};

type FilaCuenta = {
  id: string;
  tipo: string;
  saldo_inicial: string;
  creado_en: string;
  archivada_en: string | null;
};

type FilaCambio = {
  cuenta_id: string;
  valor_anterior: string;
  valor_nuevo: string;
  cambiado_en: string;
};

type FilaMovimiento = {
  id: string;
  tipo: string;
  monto: string;
  fecha: string;
  cuenta_origen_id: string | null;
  cuenta_destino_id: string | null;
  categoria_id: string | null;
};

type FilaParte = { movimiento_id: string; categoria_id: string; monto: string };

function aTipoCuenta(valor: string): TipoCuentaConPrestamo {
  const tipo = TIPOS_CON_PRESTAMO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de cuenta desconocido: ${valor}`);
  return tipo;
}

function aTipoMovimiento(valor: string): TipoMovimiento {
  const tipo = TIPOS_MOVIMIENTO.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de movimiento desconocido: ${valor}`);
  return tipo;
}

@Injectable()
export class ResumenRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  /**
   * Todo lo que el resumen necesita, en consultas paralelas: cuentas (archivadas
   * incluidas), historial de saldo inicial, todos los movimientos y las partes
   * de los movimientos con fecha entre `desde` y `hasta` (inclusive).
   */
  async leer(usuario: UsuarioAutenticado, desde: string, hasta: string): Promise<LecturaResumen> {
    const cliente = this.supabase.paraUsuario(usuario.token);
    const [cuentas, cambios, movimientos, partes] = await Promise.all([
      this.cuentas(cliente, usuario.id),
      this.cambios(cliente, usuario.id),
      this.movimientos(cliente, usuario.id),
      this.partes(cliente, usuario.id, desde, hasta),
    ]);
    return { cuentas, cambios, movimientos, partes };
  }

  private async cuentas(
    cliente: SupabaseClient<Database>,
    usuarioId: string,
  ): Promise<CuentaLeida[]> {
    const { data, error } = await cliente
      .from("cuentas")
      .select("id, tipo, saldo_inicial, creado_en, archivada_en");
    if (error) throw errorInterno(error);
    return (data as FilaCuenta[]).map((f) => ({
      id: f.id,
      tipo: aTipoCuenta(f.tipo),
      saldoInicial: this.cifrador.descifrar(
        f.saldo_inicial,
        contexto.cuenta(usuarioId, f.id, "saldo_inicial"),
      ),
      creadoEn: new Date(f.creado_en),
      archivadaEn: f.archivada_en === null ? null : new Date(f.archivada_en),
    }));
  }

  private async cambios(
    cliente: SupabaseClient<Database>,
    usuarioId: string,
  ): Promise<CambioLeido[]> {
    const { data, error } = await cliente
      .from("cuentas_cambios")
      .select("cuenta_id, valor_anterior, valor_nuevo, cambiado_en")
      .eq("campo", "saldo_inicial")
      .order("cambiado_en");
    if (error) throw errorInterno(error);
    return (data as FilaCambio[]).map((f) => {
      const ctx = contexto.cuenta(usuarioId, f.cuenta_id, "saldo_inicial");
      return {
        cuentaId: f.cuenta_id,
        valorAnterior: this.cifrador.descifrar(f.valor_anterior, ctx),
        valorNuevo: this.cifrador.descifrar(f.valor_nuevo, ctx),
        cambiadoEn: new Date(f.cambiado_en),
      };
    });
  }

  private async movimientos(
    cliente: SupabaseClient<Database>,
    usuarioId: string,
  ): Promise<MovimientoResumen[]> {
    const { data, error } = await cliente
      .from("movimientos")
      .select("id, tipo, monto, fecha, cuenta_origen_id, cuenta_destino_id, categoria_id");
    if (error) throw errorInterno(error);
    return (data as FilaMovimiento[]).map((f) => ({
      id: f.id,
      tipo: aTipoMovimiento(f.tipo),
      monto: this.cifrador.descifrar(f.monto, contexto.movimiento(usuarioId, f.id)),
      fecha: f.fecha,
      cuentaOrigenId: f.cuenta_origen_id,
      cuentaDestinoId: f.cuenta_destino_id,
      categoriaId: f.categoria_id,
    }));
  }

  /** Filtra por la fecha del movimiento con un embebido `inner`: una sola consulta. */
  private async partes(
    cliente: SupabaseClient<Database>,
    usuarioId: string,
    desde: string,
    hasta: string,
  ): Promise<ParteResumen[]> {
    const { data, error } = await cliente
      .from("movimiento_partes")
      .select("movimiento_id, categoria_id, monto, movimientos!inner(fecha)")
      .gte("movimientos.fecha", desde)
      .lte("movimientos.fecha", hasta);
    if (error) throw errorInterno(error);
    return (data as unknown as FilaParte[]).map((f) => ({
      movimientoId: f.movimiento_id,
      categoriaId: f.categoria_id,
      monto: this.cifrador.descifrar(
        f.monto,
        contexto.parte(usuarioId, f.movimiento_id, f.categoria_id),
      ),
    }));
  }
}
