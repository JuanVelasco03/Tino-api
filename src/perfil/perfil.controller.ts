import { Body, Controller, Get, NotFoundException, Patch } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { Perfil } from "../domain/perfil/perfil.js";
import { cuerpoEdicionPerfil, type CuerpoEdicionPerfil } from "./esquemas.js";
import { PerfilService } from "./perfil.service.js";

@Controller("perfil")
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  /** Perfil del usuario autenticado. */
  @Get()
  async obtener(@Usuario() usuario: UsuarioAutenticado): Promise<Perfil> {
    const perfil = await this.perfil.obtener(usuario);
    if (!perfil) throw new NotFoundException("El usuario no tiene perfil.");
    return perfil;
  }

  /** Elige la cuenta predeterminada de la captura (la misma en web y celular). */
  @Patch()
  async actualizar(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoEdicionPerfil }) cuerpo: CuerpoEdicionPerfil,
  ): Promise<Perfil> {
    const perfil = await this.perfil.actualizar(usuario, cuerpo);
    if (!perfil) throw new NotFoundException("El usuario no tiene perfil.");
    return perfil;
  }
}
