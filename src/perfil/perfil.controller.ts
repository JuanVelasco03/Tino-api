import { Controller, Get, NotFoundException } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { Perfil } from "../domain/perfil/perfil.js";
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
}
