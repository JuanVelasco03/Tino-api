import { Controller, Get } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { TrmVigenteDto } from "./dto.js";
import { TrmService } from "./trm.service.js";

@Controller("trm")
export class TrmController {
  constructor(private readonly trm: TrmService) {}

  /** TRM vigente hoy en la zona del usuario; la última conocida si la fuente falla. */
  @Get()
  vigente(@Usuario() usuario: UsuarioAutenticado): Promise<TrmVigenteDto> {
    return this.trm.vigente(usuario);
  }
}
