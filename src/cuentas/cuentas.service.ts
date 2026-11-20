import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import type { Cuenta, ResumenCuentas } from "../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../domain/cuenta/naturaleza.js";
import { agruparCuentas } from "../domain/cuenta/resumen.js";
import { puedeArchivar, validarAlta, validarEdicion } from "../domain/cuenta/validar.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import {
  CuentasRepository,
  type DatosAlta,
  type DatosEdicion,
} from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

@Injectable()
export class CuentasService {
  constructor(
    private readonly cuentas: CuentasRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Cuentas no archivadas agrupadas, con la fecha de hoy en la zona del perfil. */
  async listar(
    usuario: UsuarioAutenticado,
  ): Promise<{ resumen: ResumenCuentas; fechaSaldos: string }> {
    const [cuentas, perfil] = await Promise.all([
      this.cuentas.listar(usuario.token),
      this.perfiles.leerPropio(usuario.token),
    ]);
    return {
      resumen: agruparCuentas(cuentas),
      fechaSaldos: fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO),
    };
  }

  listarArchivadas(usuario: UsuarioAutenticado): Promise<Cuenta[]> {
    return this.cuentas.listarArchivadas(usuario.token);
  }

  crear(usuario: UsuarioAutenticado, datos: DatosAlta): Promise<Cuenta> {
    const codigo = validarAlta(datos);
    if (codigo) throw new ErrorApi(codigo);
    return this.cuentas.crear(usuario.token, datos);
  }

  async editar(usuario: UsuarioAutenticado, id: string, datos: DatosEdicion): Promise<Cuenta> {
    const actual = await this.obtenerNoArchivada(usuario, id);
    const codigo = validarEdicion(actual, datos);
    if (codigo) throw new ErrorApi(codigo);
    return this.cuentas.actualizar(usuario.token, id, datos);
  }

  eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.cuentas.eliminar(usuario.token, id);
  }

  reordenar(usuario: UsuarioAutenticado, naturaleza: Naturaleza, ids: string[]): Promise<void> {
    return this.cuentas.reordenar(usuario.token, naturaleza, ids);
  }

  async archivar(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    const actual = await this.obtenerNoArchivada(usuario, id);
    if (!puedeArchivar(actual.saldo)) throw new ErrorApi("SALDO_NO_CERO");
    return this.cuentas.archivar(usuario.token, id);
  }

  async restaurar(usuario: UsuarioAutenticado, id: string, nombre?: string): Promise<Cuenta> {
    const actual = await this.obtenerExistente(usuario, id);
    if (actual.archivadaEn === null) throw new ErrorApi("CUENTA_NO_ARCHIVADA");
    return this.cuentas.restaurar(usuario.token, id, nombre);
  }

  /** Una cuenta ajena no es visible por RLS: se trata como inexistente. */
  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    const cuenta = await this.cuentas.obtener(usuario.token, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  private async obtenerNoArchivada(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    const cuenta = await this.obtenerExistente(usuario, id);
    if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA");
    return cuenta;
  }
}
