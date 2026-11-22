import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { mesLocal, rangoDelMes } from "../domain/fecha/mes.js";
import type { Movimiento, MovimientoEntrada } from "../domain/movimiento/movimiento.js";
import { validarMovimiento } from "../domain/movimiento/validar.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { esTipoPrestamo, type TipoPrestamo } from "../domain/prestamo/prestamo.js";
import {
  validarCambioMovimiento,
  validarCapitalTrasCambio,
  validarSinCuentaDePrestamo,
  type CuentasDeMovimiento,
  type ErrorPrestamo,
} from "../domain/prestamo/validar.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

function lanzar(error: ErrorPrestamo | null): void {
  if (error) throw new ErrorApi(error.codigo, error.campo);
}

function esPrestamo(tipos: ReadonlyMap<string, string>, cuentaId: string): boolean {
  const tipo = tipos.get(cuentaId);
  return tipo !== undefined && esTipoPrestamo(tipo);
}

function cuentasDe(m: Movimiento): CuentasDeMovimiento {
  return {
    tipo: m.tipo,
    cuentaOrigenId: m.cuentaOrigen?.id ?? null,
    cuentaDestinoId: m.cuentaDestino?.id ?? null,
  };
}

@Injectable()
export class MovimientosService {
  constructor(
    private readonly movimientos: MovimientosRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Movimientos de un mes; sin mes, el actual en la zona del perfil. */
  async listar(
    usuario: UsuarioAutenticado,
    mes: string | undefined,
  ): Promise<{ mes: string; movimientos: Movimiento[] }> {
    const mesConsultado = mes ?? (await this.mesActual(usuario));
    const { desde, hasta } = rangoDelMes(mesConsultado);
    const movimientos = await this.movimientos.listarEntre(usuario, desde, hasta);
    return { mes: mesConsultado, movimientos };
  }

  /**
   * El dominio valida la forma; la función de Postgres es la garantía final.
   * Un movimiento de préstamo nace en Deudas, nunca aquí (SPEC 08).
   */
  async crear(usuario: UsuarioAutenticado, entrada: MovimientoEntrada): Promise<Movimiento> {
    this.validar(entrada);
    const tipos = await this.movimientos.tiposDeCuenta(usuario, [
      entrada.cuentaOrigenId,
      entrada.cuentaDestinoId,
    ]);
    lanzar(validarSinCuentaDePrestamo(entrada, (cuentaId) => esPrestamo(tipos, cuentaId)));
    const id = await this.movimientos.registrar(usuario, entrada);
    return this.obtenerExistente(usuario, id);
  }

  /**
   * Un movimiento de préstamo se edita sin cambiar de tipo ni de préstamo, y
   * sin dejar el capital negativo (SPEC 08).
   */
  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    entrada: MovimientoEntrada,
  ): Promise<Movimiento> {
    this.validar(entrada);
    const actual = await this.obtenerExistente(usuario, id);
    const anterior = cuentasDe(actual);
    const [tipos, esInteres] = await Promise.all([
      this.movimientos.tiposDeCuenta(usuario, [
        anterior.cuentaOrigenId,
        anterior.cuentaDestinoId,
        entrada.cuentaOrigenId,
        entrada.cuentaDestinoId,
      ]),
      this.movimientos.esInteresDePrestamo(usuario, id),
    ]);
    lanzar(
      validarCambioMovimiento(anterior, entrada, {
        esPrestamo: (cuentaId) => esPrestamo(tipos, cuentaId),
        esInteres,
      }),
    );
    await this.comprobarCapital(usuario, id, tipos, entrada);
    await this.movimientos.reemplazar(usuario, id, entrada);
    return this.obtenerExistente(usuario, id);
  }

  /** Borrar un movimiento de préstamo no puede dejar el capital negativo (SPEC 08). */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const actual = await this.movimientos.obtener(usuario, id);
    if (actual) {
      const anterior = cuentasDe(actual);
      const tipos = await this.movimientos.tiposDeCuenta(usuario, [
        anterior.cuentaOrigenId,
        anterior.cuentaDestinoId,
      ]);
      await this.comprobarCapital(usuario, id, tipos, null);
    }
    return this.movimientos.eliminar(usuario, id);
  }

  private validar(entrada: MovimientoEntrada): void {
    const error = validarMovimiento(entrada);
    if (error) throw new ErrorApi(error.codigo, error.campo);
  }

  /**
   * Con el movimiento `id` reemplazado por `nuevo` (o borrado), ningún préstamo
   * de `tipos` queda con capital final negativo.
   */
  private async comprobarCapital(
    usuario: UsuarioAutenticado,
    id: string,
    tipos: ReadonlyMap<string, string>,
    nuevo: MovimientoEntrada | null,
  ): Promise<void> {
    const prestamos = [...tipos].flatMap(([cuentaId, tipo]) =>
      esTipoPrestamo(tipo) ? [{ id: cuentaId, tipo: tipo satisfies TipoPrestamo }] : [],
    );
    if (prestamos.length === 0) return;
    const efectos = await this.movimientos.efectosDe(
      usuario,
      prestamos.map((p) => p.id),
    );
    lanzar(validarCapitalTrasCambio(prestamos, efectos, id, nuevo));
  }

  private async mesActual(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return mesLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }

  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<Movimiento> {
    const movimiento = await this.movimientos.obtener(usuario, id);
    if (!movimiento) throw new ErrorApi("MOVIMIENTO_NO_ENCONTRADO");
    return movimiento;
  }
}
