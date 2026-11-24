/**
 * Acceso a cuentas con el cliente del usuario: las políticas RLS de `cuentas`
 * garantizan que solo toca sus propias filas (RN-12, RN-19).
 *
 * Montos cifrados (SPEC 05): `saldo_inicial` y `cupo` se guardan como texto
 * cifrado por `CifradorMontos`; aquí se cifran al escribir y se descifran al
 * leer. Devuelve cuentas sin saldo (`CuentaGuardada`) y los efectos de los
 * movimientos para que el servicio calcule el saldo en el dominio (RN-01).
 *
 * Préstamos (SPEC 08): las cuentas de préstamo no son cuentas propias. Todas
 * las lecturas y escrituras de este repositorio las excluyen, así que un
 * préstamo en `/cuentas/:id` es una cuenta inexistente. Solo
 * `listarPrestamos` las lee, para que el servicio las sume al patrimonio.
 *
 * Inversiones (SPEC 10): sí son cuentas visibles, con su `moneda`. Nacen en
 * `crear_inversion` (`InversionesRepository`), no aquí.
 *
 * Tarjetas (SPEC 14): las condiciones viven en `tarjetas`. Toda lectura de
 * cuentas las adjunta (`condiciones`). Una tarjeta nace con `crear_tarjeta`,
 * que inserta la cuenta y sus condiciones en una transacción.
 */
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioAutenticado } from "../../autenticacion/usuario.js";
import { ErrorApi } from "../../comun/error-api.js";
import {
  TIPOS_VISIBLES,
  type CuentaGuardada,
  type TipoCuentaEnAlcance,
  type TipoCuentaVisible,
} from "../../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../../domain/cuenta/naturaleza.js";
import type { CondicionesConPago } from "../../domain/cuenta/cuenta.js";
import type { EfectoMovimiento } from "../../domain/cuenta/saldo.js";
import type { CondicionesTarjeta } from "../../domain/tarjeta/tarjeta.js";
import type { CondicionesEntrada } from "../../domain/tarjeta/validar.js";
import { esMoneda, type Moneda } from "../../domain/inversion/inversion.js";
import {
  TIPOS_PRESTAMO,
  esTipoPrestamo,
  type TipoPrestamo,
} from "../../domain/prestamo/prestamo.js";
import { CifradorMontos, contexto } from "../cifrado/montos.js";
import { ClienteSupabase } from "./cliente.js";
import { desdeFuncion } from "./errores.js";
import type { Database, TablesInsert, TablesUpdate } from "./tipos.js";

const COLUMNAS = "id, nombre, tipo, moneda, detalle, saldo_inicial, cupo, posicion, archivada_en";

/** Efecto de un movimiento con su id y fecha, para la línea de tiempo de una inversión (SPEC 10). */
export type EfectoConFecha = EfectoMovimiento & { id: string; fecha: string };

/** Lista de PostgREST para `.not("tipo", "in", …)`: excluye los préstamos. */
const TIPOS_DE_PRESTAMO = `(${TIPOS_PRESTAMO.join(",")})`;

type Fila = {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  detalle: string | null;
  saldo_inicial: string;
  cupo: string | null;
  posicion: number;
  archivada_en: string | null;
};

export type DatosAlta = {
  nombre: string;
  tipo: TipoCuentaEnAlcance;
  detalle: string | null;
  saldoInicial: bigint;
  cupo: bigint | null;
};

type FilaTarjeta = {
  cuenta_id: string;
  dia_corte: number;
  dia_pago: number;
  tasa_mensual_cpb: number | null;
  cuota_manejo: string | null;
  cuenta_pago_id: string | null;
};

const COLUMNAS_TARJETA =
  "cuenta_id, dia_corte, dia_pago, tasa_mensual_cpb, cuota_manejo, cuenta_pago_id";

/** Condiciones completas del alta de una tarjeta (SPEC 14). */
export type DatosCondiciones = CondicionesTarjeta;

export type DatosEdicion = {
  nombre?: string;
  tipo?: TipoCuentaEnAlcance;
  detalle?: string | null;
  saldoInicial?: bigint;
  cupo?: bigint;
};

function aTipo(valor: string): TipoCuentaVisible {
  const tipo = TIPOS_VISIBLES.find((t) => t === valor);
  if (!tipo) throw new Error(`Tipo de cuenta desconocido: ${valor}`);
  return tipo;
}

function aMoneda(valor: string): Moneda {
  if (!esMoneda(valor)) throw new Error(`Moneda desconocida: ${valor}`);
  return valor;
}

/** Traduce el error de Postgres a un código del catálogo; si no, error interno sin filtrar detalle. */
function traducir(error: PostgrestError): Error {
  if (error.code === "23505" && error.message.includes("cuentas_nombre_unico")) {
    return new ErrorApi("NOMBRE_DUPLICADO");
  }
  // Cuenta de pago inexistente o ajena (SPEC 14).
  if (error.code === "23503" && error.message.includes("tarjetas_cuenta_pago_fkey")) {
    return new ErrorApi("CUENTA_PAGO_INVALIDA");
  }
  // CAMBIO_DE_NATURALEZA, ORDEN_INVALIDO, TIPO_DE_INVERSION_FIJO, MONEDA_FIJA…
  const deFuncion = desdeFuncion(error);
  if (deFuncion) return deFuncion;
  // El filtro lo convierte en ERROR_INTERNO; el detalle solo va al log.
  return new Error(`Postgres ${error.code}: ${error.message}`);
}

@Injectable()
export class CuentasRepository {
  constructor(
    private readonly supabase: ClienteSupabase,
    private readonly cifrador: CifradorMontos,
  ) {}

  private cliente(token: string): SupabaseClient<Database> {
    return this.supabase.paraUsuario(token);
  }

  private aCuenta(usuarioId: string, fila: Fila): CuentaGuardada {
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo: aTipo(fila.tipo),
      moneda: aMoneda(fila.moneda),
      detalle: fila.detalle,
      saldoInicial: this.cifrador.descifrar(
        fila.saldo_inicial,
        contexto.cuenta(usuarioId, fila.id, "saldo_inicial"),
      ),
      cupo:
        fila.cupo === null
          ? null
          : this.cifrador.descifrar(fila.cupo, contexto.cuenta(usuarioId, fila.id, "cupo")),
      posicion: fila.posicion,
      archivadaEn: fila.archivada_en === null ? null : new Date(fila.archivada_en),
    };
  }

  /** No archivadas, en el orden del usuario. */
  async listar(usuario: UsuarioAutenticado): Promise<CuentaGuardada[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .is("archivada_en", null)
      .order("posicion")
      .order("creado_en");
    if (error) throw traducir(error);
    return this.conCondiciones(
      usuario,
      (data as Fila[]).map((f) => this.aCuenta(usuario.id, f)),
    );
  }

  /** Archivadas, la más reciente primero. */
  async listarArchivadas(usuario: UsuarioAutenticado): Promise<CuentaGuardada[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .not("archivada_en", "is", null)
      .order("archivada_en", { ascending: false });
    if (error) throw traducir(error);
    return this.conCondiciones(
      usuario,
      (data as Fila[]).map((f) => this.aCuenta(usuario.id, f)),
    );
  }

  /** `null` si no existe, no es visible por RLS (cuenta ajena) o es un préstamo. */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada | null> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select(COLUMNAS)
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) return null;
    const [cuenta] = await this.conCondiciones(usuario, [this.aCuenta(usuario.id, data as Fila)]);
    return cuenta ?? null;
  }

  /**
   * Adjunta a cada tarjeta sus condiciones y el nombre de su cuenta de pago.
   * Una tarjeta sin fila en `tarjetas` queda con `condiciones: null` (N-79).
   */
  private async conCondiciones(
    usuario: UsuarioAutenticado,
    cuentas: CuentaGuardada[],
  ): Promise<CuentaGuardada[]> {
    const ids = cuentas.filter((c) => c.tipo === "tarjeta_credito").map((c) => c.id);
    if (ids.length === 0) return cuentas;
    const { data, error } = await this.cliente(usuario.token)
      .from("tarjetas")
      .select(COLUMNAS_TARJETA)
      .in("cuenta_id", ids);
    if (error) throw traducir(error);
    const filas = data as FilaTarjeta[];
    const pagos = [...new Set(filas.flatMap((f) => (f.cuenta_pago_id ? [f.cuenta_pago_id] : [])))];
    const nombres = new Map<string, string>();
    if (pagos.length > 0) {
      const leidas = await this.cliente(usuario.token)
        .from("cuentas")
        .select("id, nombre")
        .in("id", pagos);
      if (leidas.error) throw traducir(leidas.error);
      for (const c of leidas.data) nombres.set(c.id, c.nombre);
    }
    const porCuenta = new Map(filas.map((f) => [f.cuenta_id, f]));
    return cuentas.map((c) => {
      if (c.tipo !== "tarjeta_credito") return c;
      const fila = porCuenta.get(c.id);
      return { ...c, condiciones: fila ? this.aCondiciones(usuario.id, fila, nombres) : null };
    });
  }

  private aCondiciones(
    usuarioId: string,
    fila: FilaTarjeta,
    nombres: ReadonlyMap<string, string>,
  ): CondicionesConPago {
    const nombrePago = fila.cuenta_pago_id === null ? undefined : nombres.get(fila.cuenta_pago_id);
    return {
      diaCorte: fila.dia_corte,
      diaPago: fila.dia_pago,
      tasaMensualCpb: fila.tasa_mensual_cpb,
      cuotaManejo:
        fila.cuota_manejo === null
          ? null
          : this.cifrador.descifrar(
              fila.cuota_manejo,
              contexto.cuotaManejo(usuarioId, fila.cuenta_id),
            ),
      cuentaPagoId: fila.cuenta_pago_id,
      cuentaPago:
        fila.cuenta_pago_id === null || nombrePago === undefined
          ? null
          : { id: fila.cuenta_pago_id, nombre: nombrePago },
    };
  }

  /**
   * Montos, cuentas y fecha de los movimientos del usuario (RLS), descifrados.
   * Con `cuentaId`, solo los que la tocan. Trae lo mínimo: el saldo lo calcula
   * el dominio.
   */
  async efectos(usuario: UsuarioAutenticado, cuentaId?: string): Promise<EfectoConFecha[]> {
    let consulta = this.cliente(usuario.token)
      .from("movimientos")
      .select("id, monto, monto_destino, fecha, cuenta_origen_id, cuenta_destino_id");
    if (cuentaId !== undefined) {
      consulta = consulta.or(`cuenta_origen_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`);
    }
    const { data, error } = await consulta;
    if (error) throw traducir(error);
    return (
      data as unknown as {
        id: string;
        monto: string;
        monto_destino: string | null;
        fecha: string;
        cuenta_origen_id: string | null;
        cuenta_destino_id: string | null;
      }[]
    ).map((m) => ({
      id: m.id,
      monto: this.cifrador.descifrar(m.monto, contexto.movimiento(usuario.id, m.id)),
      montoDestino:
        m.monto_destino === null
          ? null
          : this.cifrador.descifrar(m.monto_destino, contexto.montoDestino(usuario.id, m.id)),
      fecha: m.fecha,
      cuentaOrigenId: m.cuenta_origen_id,
      cuentaDestinoId: m.cuenta_destino_id,
    }));
  }

  /** Cuentas de préstamo sin saldo: el servicio calcula su capital (RN-01) para el patrimonio. */
  async listarPrestamos(
    usuario: UsuarioAutenticado,
  ): Promise<{ id: string; tipo: TipoPrestamo; saldoInicial: bigint }[]> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("id, tipo, saldo_inicial")
      .in("tipo", [...TIPOS_PRESTAMO]);
    if (error) throw traducir(error);
    return (data as { id: string; tipo: string; saldo_inicial: string }[]).map((f) => {
      if (!esTipoPrestamo(f.tipo)) throw new Error(`Tipo de préstamo desconocido: ${f.tipo}`);
      return {
        id: f.id,
        tipo: f.tipo,
        saldoInicial: this.cifrador.descifrar(
          f.saldo_inicial,
          contexto.cuenta(usuario.id, f.id, "saldo_inicial"),
        ),
      };
    });
  }

  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.obtener(usuario, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  /**
   * El `id` lo genera la API: el cifrado se ata a la fila (AAD). `posicion` la
   * asigna el trigger `asignar_posicion`; `usuario_id`, el default `auth.uid()`.
   */
  async crear(usuario: UsuarioAutenticado, datos: DatosAlta): Promise<CuentaGuardada> {
    const id = randomUUID();
    const fila = {
      id,
      nombre: datos.nombre,
      tipo: datos.tipo,
      detalle: datos.detalle,
      saldo_inicial: this.cifrador.cifrar(
        datos.saldoInicial,
        contexto.cuenta(usuario.id, id, "saldo_inicial"),
      ),
      cupo:
        datos.cupo === null
          ? null
          : this.cifrador.cifrar(datos.cupo, contexto.cuenta(usuario.id, id, "cupo")),
    };
    const { error } = await this.cliente(usuario.token)
      .from("cuentas")
      .insert(fila as unknown as TablesInsert<"cuentas">);
    if (error) throw traducir(error);
    return this.obtenerExistente(usuario, id);
  }

  /** Tarjeta con sus condiciones, en una transacción (`crear_tarjeta`, SPEC 14). */
  async crearTarjeta(
    usuario: UsuarioAutenticado,
    datos: DatosAlta,
    condiciones: DatosCondiciones,
  ): Promise<CuentaGuardada> {
    if (datos.cupo === null) throw new Error("Una tarjeta llega con el cupo validado.");
    const id = randomUUID();
    const args = {
      p_id: id,
      p_nombre: datos.nombre,
      p_detalle: datos.detalle,
      p_saldo_inicial: this.cifrador.cifrar(
        datos.saldoInicial,
        contexto.cuenta(usuario.id, id, "saldo_inicial"),
      ),
      p_cupo: this.cifrador.cifrar(datos.cupo, contexto.cuenta(usuario.id, id, "cupo")),
      p_dia_corte: condiciones.diaCorte,
      p_dia_pago: condiciones.diaPago,
      p_tasa_mensual_cpb: condiciones.tasaMensualCpb,
      p_cuota_manejo:
        condiciones.cuotaManejo === null
          ? null
          : this.cifrador.cifrar(condiciones.cuotaManejo, contexto.cuotaManejo(usuario.id, id)),
      p_cuenta_pago_id: condiciones.cuentaPagoId,
    };
    const { error } = await this.cliente(usuario.token).rpc(
      "crear_tarjeta",
      args as unknown as Database["public"]["Functions"]["crear_tarjeta"]["Args"],
    );
    if (error) throw traducir(error);
    return this.obtenerExistente(usuario, id);
  }

  /** Si la tarjeta ya tiene fila en `tarjetas`. */
  async tieneCondiciones(usuario: UsuarioAutenticado, cuentaId: string): Promise<boolean> {
    const { data, error } = await this.cliente(usuario.token)
      .from("tarjetas")
      .select("cuenta_id")
      .eq("cuenta_id", cuentaId)
      .maybeSingle();
    if (error) throw traducir(error);
    return data !== null;
  }

  /**
   * Escribe las condiciones de una tarjeta: inserta la fila si no existe (con
   * los días ya validados) o cambia solo los campos enviados. Una cuota igual a
   * la guardada conserva su cifrado: el historial no registra cambios falsos.
   */
  async guardarCondiciones(
    usuario: UsuarioAutenticado,
    cuentaId: string,
    cambios: CondicionesEntrada,
  ): Promise<void> {
    const lectura = await this.cliente(usuario.token)
      .from("tarjetas")
      .select(COLUMNAS_TARJETA)
      .eq("cuenta_id", cuentaId)
      .maybeSingle();
    if (lectura.error) throw traducir(lectura.error);
    const guardada = lectura.data as FilaTarjeta | null;
    const ctx = contexto.cuotaManejo(usuario.id, cuentaId);
    const cuota =
      cambios.cuotaManejo === undefined
        ? undefined
        : cambios.cuotaManejo === null
          ? null
          : this.cifrador.cifrarSiCambia(cambios.cuotaManejo, guardada?.cuota_manejo ?? null, ctx);
    const fila: Partial<FilaTarjeta> = {
      ...(cambios.diaCorte === undefined ? {} : { dia_corte: cambios.diaCorte }),
      ...(cambios.diaPago === undefined ? {} : { dia_pago: cambios.diaPago }),
      ...(cambios.tasaMensual === undefined ? {} : { tasa_mensual_cpb: cambios.tasaMensual }),
      ...(cuota === undefined ? {} : { cuota_manejo: cuota }),
      ...(cambios.cuentaPagoId === undefined ? {} : { cuenta_pago_id: cambios.cuentaPagoId }),
    };
    const tabla = this.cliente(usuario.token).from("tarjetas");
    const { error } =
      guardada === null
        ? await tabla.insert({ ...fila, cuenta_id: cuentaId } as TablesInsert<"tarjetas">)
        : await tabla.update(fila as TablesUpdate<"tarjetas">).eq("cuenta_id", cuentaId);
    if (error) throw traducir(error);
  }

  private async actualizarFila(
    usuario: UsuarioAutenticado,
    id: string,
    fila: TablesUpdate<"cuentas">,
  ): Promise<CuentaGuardada> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .update(fila)
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .select("id");
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return this.obtenerExistente(usuario, id);
  }

  /** Textos cifrados guardados, para no recifrar lo que no cambió. */
  private async montosGuardados(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<{ saldo_inicial: string; cupo: string | null }> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .select("saldo_inicial, cupo")
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .maybeSingle();
    if (error) throw traducir(error);
    if (data === null) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return data as unknown as { saldo_inicial: string; cupo: string | null };
  }

  /**
   * Un monto igual al guardado conserva su texto cifrado: el trigger de
   * `cuentas_cambios` compara textos y no debe registrar cambios falsos (RN-13).
   */
  async actualizar(
    usuario: UsuarioAutenticado,
    id: string,
    datos: DatosEdicion,
  ): Promise<CuentaGuardada> {
    const montos =
      datos.saldoInicial === undefined && datos.cupo === undefined
        ? null
        : await this.montosGuardados(usuario, id);
    const fila: TablesUpdate<"cuentas"> = {
      ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
      ...(datos.tipo === undefined ? {} : { tipo: datos.tipo }),
      ...(datos.detalle === undefined ? {} : { detalle: datos.detalle }),
      ...(datos.saldoInicial === undefined || montos === null
        ? {}
        : {
            saldo_inicial: this.cifrador.cifrarSiCambia(
              datos.saldoInicial,
              montos.saldo_inicial,
              contexto.cuenta(usuario.id, id, "saldo_inicial"),
            ),
          }),
      ...(datos.cupo === undefined || montos === null
        ? {}
        : {
            cupo: this.cifrador.cifrarSiCambia(
              datos.cupo,
              montos.cupo,
              contexto.cuenta(usuario.id, id, "cupo"),
            ),
          }),
    } as TablesUpdate<"cuentas">;
    return this.actualizarFila(usuario, id, fila);
  }

  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const { data, error } = await this.cliente(usuario.token)
      .from("cuentas")
      .delete()
      .eq("id", id)
      .not("tipo", "in", TIPOS_DE_PRESTAMO)
      .select("id");
    // FK on delete restrict desde recurrentes (SPEC 07), metas (SPEC 13) o
    // movimientos (SPEC 04): con movimientos se archiva, no se elimina.
    if (error?.code === "23503") {
      throw new ErrorApi(
        /recurrentes_cuenta_(origen|destino)_fkey/.test(error.message)
          ? "CUENTA_CON_RECURRENTES"
          : error.message.includes("metas_cuenta_fkey")
            ? "CUENTA_CON_METAS"
            : "CUENTA_CON_MOVIMIENTOS",
      );
    }
    if (error) throw traducir(error);
    if (data.length === 0) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
  }

  /** Si la cuenta tiene metas sin archivar (SPEC 13, N-60). */
  async tieneMetasSinArchivar(usuario: UsuarioAutenticado, id: string): Promise<boolean> {
    const { count, error } = await this.cliente(usuario.token)
      .from("metas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", id)
      .is("archivada_en", null);
    if (error) throw traducir(error);
    return (count ?? 0) > 0;
  }

  archivar(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    return this.actualizarFila(usuario, id, { archivada_en: new Date().toISOString() });
  }

  /** El nombre nuevo, si llega, se aplica en la misma sentencia; el trigger la manda al final del grupo. */
  restaurar(usuario: UsuarioAutenticado, id: string, nombre?: string): Promise<CuentaGuardada> {
    return this.actualizarFila(usuario, id, {
      ...(nombre === undefined ? {} : { nombre }),
      archivada_en: null,
    });
  }

  async reordenar(
    usuario: UsuarioAutenticado,
    naturaleza: Naturaleza,
    ids: string[],
  ): Promise<void> {
    const { error } = await this.cliente(usuario.token).rpc("reordenar_cuentas", {
      p_naturaleza: naturaleza,
      p_ids: ids,
    });
    if (error) throw traducir(error);
  }
}
