import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import type { Perfil } from "../domain/perfil/perfil.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import {
  PerfilesRepository,
  type CambiosPerfil,
} from "../repositories/supabase/perfiles.repository.js";

const CAMPO_CUENTA = "cuentaPredeterminadaId";

@Injectable()
export class PerfilService {
  constructor(
    private readonly perfiles: PerfilesRepository,
    private readonly cuentas: CuentasRepository,
  ) {}

  obtener(usuario: UsuarioAutenticado): Promise<Perfil | null> {
    return this.perfiles.leerPropio(usuario.token);
  }

  /** La cuenta predeterminada debe ser propia y no archivada; `null` la quita. */
  async actualizar(usuario: UsuarioAutenticado, cambios: CambiosPerfil): Promise<Perfil | null> {
    if (cambios.cuentaPredeterminadaId !== null) {
      const cuenta = await this.cuentas.obtener(usuario, cambios.cuentaPredeterminadaId);
      if (!cuenta) throw new ErrorApi("CUENTA_INVALIDA", CAMPO_CUENTA);
      if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA", CAMPO_CUENTA);
    }
    return this.perfiles.actualizar(usuario.token, usuario.id, cambios);
  }
}
