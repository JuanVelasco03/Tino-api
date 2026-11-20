import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { mesLocal, rangoDelMes } from "../domain/fecha/mes.js";
import type { Movimiento, MovimientoEntrada } from "../domain/movimiento/movimiento.js";
import { validarMovimiento } from "../domain/movimiento/validar.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

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
    const movimientos = await this.movimientos.listarEntre(usuario.token, desde, hasta);
    return { mes: mesConsultado, movimientos };
  }

  /** El dominio valida la forma; la función de Postgres es la garantía final. */
  async crear(usuario: UsuarioAutenticado, entrada: MovimientoEntrada): Promise<Movimiento> {
    this.validar(entrada);
    const id = await this.movimientos.registrar(usuario.token, entrada);
    return this.obtenerExistente(usuario, id);
  }

  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    entrada: MovimientoEntrada,
  ): Promise<Movimiento> {
    this.validar(entrada);
    await this.movimientos.reemplazar(usuario.token, id, entrada);
    return this.obtenerExistente(usuario, id);
  }

  eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.movimientos.eliminar(usuario.token, id);
  }

  private validar(entrada: MovimientoEntrada): void {
    const error = validarMovimiento(entrada);
    if (error) throw new ErrorApi(error.codigo, error.campo);
  }

  private async mesActual(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return mesLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }

  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<Movimiento> {
    const movimiento = await this.movimientos.obtener(usuario.token, id);
    if (!movimiento) throw new ErrorApi("MOVIMIENTO_NO_ENCONTRADO");
    return movimiento;
  }
}
