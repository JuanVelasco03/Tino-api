import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import type { Cuenta, CuentaGuardada, ResumenCuentas } from "../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../domain/cuenta/naturaleza.js";
import { agruparCuentas } from "../domain/cuenta/resumen.js";
import { conSaldos } from "../domain/cuenta/saldo.js";
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
    const [cuentas, efectos, perfil] = await Promise.all([
      this.cuentas.listar(usuario),
      this.cuentas.efectos(usuario),
      this.perfiles.leerPropio(usuario.token),
    ]);
    return {
      resumen: agruparCuentas(conSaldos(cuentas, efectos)),
      fechaSaldos: fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO),
    };
  }

  async listarArchivadas(usuario: UsuarioAutenticado): Promise<Cuenta[]> {
    const [cuentas, efectos] = await Promise.all([
      this.cuentas.listarArchivadas(usuario),
      this.cuentas.efectos(usuario),
    ]);
    return conSaldos(cuentas, efectos);
  }

  async crear(usuario: UsuarioAutenticado, datos: DatosAlta): Promise<Cuenta> {
    const codigo = validarAlta(datos);
    if (codigo) throw new ErrorApi(codigo);
    return this.conSaldo(usuario, await this.cuentas.crear(usuario, datos));
  }

  async editar(usuario: UsuarioAutenticado, id: string, datos: DatosEdicion): Promise<Cuenta> {
    const actual = await this.obtenerNoArchivada(usuario, id);
    const codigo = validarEdicion(actual, datos);
    if (codigo) throw new ErrorApi(codigo);
    return this.conSaldo(usuario, await this.cuentas.actualizar(usuario, id, datos));
  }

  eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.cuentas.eliminar(usuario, id);
  }

  reordenar(usuario: UsuarioAutenticado, naturaleza: Naturaleza, ids: string[]): Promise<void> {
    return this.cuentas.reordenar(usuario, naturaleza, ids);
  }

  async archivar(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    const actual = await this.conSaldo(usuario, await this.obtenerNoArchivada(usuario, id));
    if (!puedeArchivar(actual.saldo)) throw new ErrorApi("SALDO_NO_CERO");
    return this.conSaldo(usuario, await this.cuentas.archivar(usuario, id));
  }

  async restaurar(usuario: UsuarioAutenticado, id: string, nombre?: string): Promise<Cuenta> {
    const actual = await this.obtenerExistente(usuario, id);
    if (actual.archivadaEn === null) throw new ErrorApi("CUENTA_NO_ARCHIVADA");
    return this.conSaldo(usuario, await this.cuentas.restaurar(usuario, id, nombre));
  }

  /** RN-01: el saldo se calcula con los movimientos que tocan la cuenta, nunca se guarda. */
  private async conSaldo(usuario: UsuarioAutenticado, cuenta: CuentaGuardada): Promise<Cuenta> {
    const efectos = await this.cuentas.efectos(usuario, cuenta.id);
    return conSaldos([cuenta], efectos)[0]!;
  }

  /** Una cuenta ajena no es visible por RLS: se trata como inexistente. */
  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.cuentas.obtener(usuario, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  private async obtenerNoArchivada(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<CuentaGuardada> {
    const cuenta = await this.obtenerExistente(usuario, id);
    if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA");
    return cuenta;
  }
}
