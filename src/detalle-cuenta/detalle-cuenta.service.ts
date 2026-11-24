/**
 * Detalle de cuenta y ciclo de tarjeta (SPEC 14). El servicio lee, delega el
 * cálculo al dominio (saldo corrido, conciliación, ajuste, ciclo) y escribe por
 * las funciones de Postgres. Nada de lo calculado se guarda (RN-01).
 */
import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { calcularAjuste } from "../domain/cuenta/ajuste.js";
import { estadoConciliacion, type EstadoConciliacion } from "../domain/cuenta/conciliacion.js";
import { tieneDetalle, type CuentaGuardada } from "../domain/cuenta/cuenta.js";
import {
  historialDeCuenta,
  type Historial,
  type MovimientoConciliable,
} from "../domain/cuenta/historial.js";
import { calcularSaldo } from "../domain/cuenta/saldo.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { restarDias } from "../domain/fecha/mes.js";
import type { Movimiento } from "../domain/movimiento/movimiento.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { cicloDeTarjeta, type CicloTarjeta } from "../domain/tarjeta/ciclo.js";
import { simularCompra, type CompraSimulada } from "../domain/tarjeta/compra.js";
import { DIAS_HISTORIAL_POR_DEFECTO, clasesDeCargo } from "../domain/tarjeta/tarjeta.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { DetalleCuentaRepository } from "../repositories/supabase/detalle-cuenta.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

export type ResultadoHistorial = {
  fechaHoy: string;
  desde: string;
  hasta: string | null;
  historial: Historial;
  conciliacion: EstadoConciliacion;
};

export type ResultadoCiclo = {
  fechaHoy: string;
  ciclo: CicloTarjeta | null;
  compra: CompraSimulada | null;
};

@Injectable()
export class DetalleCuentaService {
  constructor(
    private readonly cuentas: CuentasRepository,
    private readonly movimientos: MovimientosRepository,
    private readonly detalle: DetalleCuentaRepository,
    private readonly categorias: CategoriasRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Historial con saldo corrido de una cuenta de efectivo o banco, también archivada. */
  async historial(
    usuario: UsuarioAutenticado,
    id: string,
    desde: string | undefined,
    hasta: string | undefined,
  ): Promise<ResultadoHistorial> {
    const [cuenta, hoy] = await Promise.all([this.conDetalle(usuario, id), this.hoy(usuario)]);
    const inicio = desde ?? restarDias(hoy, DIAS_HISTORIAL_POR_DEFECTO);
    if (hasta !== undefined && hasta < inicio) throw new ErrorApi("RANGO_INVALIDO");
    const movimientos = await this.movimientos.listarDeCuenta(usuario, id);
    return {
      fechaHoy: hoy,
      desde: inicio,
      hasta: hasta ?? null,
      historial: historialDeCuenta(
        cuenta,
        movimientos,
        { desde: inicio, hasta: hasta ?? null },
        hoy,
      ),
      conciliacion: estadoConciliacion(cuenta, movimientos),
    };
  }

  /** Concilia o desconcilia en esta cuenta. La función valida cuenta e ids. */
  conciliar(
    usuario: UsuarioAutenticado,
    id: string,
    ids: readonly string[],
    conciliado: boolean,
  ): Promise<void> {
    return this.detalle.conciliar(usuario, id, ids, conciliado);
  }

  /**
   * Registra la diferencia entre lo contado y el saldo a hoy como un ajuste
   * (RN-14), con fecha hoy. La diferencia la fija la API, no el cliente.
   */
  async ajustar(
    usuario: UsuarioAutenticado,
    id: string,
    saldoReal: bigint,
    conciliarHastaHoy: boolean,
  ): Promise<Movimiento> {
    const [cuenta, hoy] = await Promise.all([this.conDetalle(usuario, id), this.hoy(usuario)]);
    if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA");
    const movimientos = await this.movimientos.listarDeCuenta(usuario, id);
    const { saldoHoy } = historialDeCuenta(cuenta, movimientos, { desde: hoy, hasta: hoy }, hoy);
    const ajuste = calcularAjuste(saldoReal, saldoHoy);
    if (ajuste === null) throw new ErrorApi("SIN_DIFERENCIA");
    const ajusteId = await this.detalle.registrarAjuste(
      usuario,
      id,
      ajuste,
      hoy,
      conciliarHastaHoy,
    );
    const creado = await this.movimientos.obtener(usuario, ajusteId);
    if (!creado) throw new Error("El ajuste recién creado no se pudo leer.");
    return creado;
  }

  /** Ciclo en curso de una tarjeta y, con `compra`, la compra simulada. */
  async ciclo(
    usuario: UsuarioAutenticado,
    id: string,
    compra: bigint | undefined,
  ): Promise<ResultadoCiclo> {
    const [cuenta, hoy] = await Promise.all([this.existente(usuario, id), this.hoy(usuario)]);
    if (cuenta.tipo !== "tarjeta_credito" || cuenta.cupo === null) {
      throw new ErrorApi("TIPO_NO_ADMITIDO");
    }
    const movimientos = await this.movimientos.listarDeCuenta(usuario, id);
    const deuda = calcularSaldo(cuenta, movimientos.map(aEfecto));
    const condiciones = cuenta.condiciones ?? null;
    const ciclo =
      condiciones === null
        ? null
        : cicloDeTarjeta(
            cuenta,
            movimientos,
            condiciones,
            hoy,
            clasesDeCargo(await this.categorias.listar(usuario.token)),
          );
    return {
      fechaHoy: hoy,
      ciclo,
      compra: compra === undefined ? null : simularCompra(compra, cuenta.cupo, deuda),
    };
  }

  private async existente(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.cuentas.obtener(usuario, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  /** Solo efectivo y banco tienen historial, conciliación y ajuste. */
  private async conDetalle(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.existente(usuario, id);
    if (!tieneDetalle(cuenta.tipo)) throw new ErrorApi("TIPO_NO_ADMITIDO");
    return cuenta;
  }

  private async hoy(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }
}

function aEfecto(m: MovimientoConciliable) {
  return {
    monto: m.monto,
    montoDestino: m.montoDestino,
    cuentaOrigenId: m.cuentaOrigen?.id ?? null,
    cuentaDestinoId: m.cuentaDestino?.id ?? null,
  };
}
