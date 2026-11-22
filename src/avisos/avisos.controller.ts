import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { TipoAviso } from "../domain/aviso/aviso.js";
import { AvisosService } from "./avisos.service.js";
import type { AvisoConfigDto, AvisosDto, ConteoAvisosDto } from "./dto.js";
import {
  claveRuta,
  cuerpoConfig,
  cuerpoMarca,
  tipoRuta,
  type CuerpoConfig,
  type CuerpoMarca,
} from "./esquemas.js";

@Controller("avisos")
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioAutenticado): Promise<AvisosDto> {
    return this.avisos.listar(usuario);
  }

  @Get("conteo")
  contar(@Usuario() usuario: UsuarioAutenticado): Promise<ConteoAvisosDto> {
    return this.avisos.contar(usuario);
  }

  @Post("leer-todos")
  @HttpCode(HttpStatus.NO_CONTENT)
  async leerTodos(@Usuario() usuario: UsuarioAutenticado): Promise<void> {
    await this.avisos.leerTodos(usuario);
  }

  @Patch("config/:tipo")
  cambiarConfig(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("tipo", { schema: tipoRuta }) tipo: TipoAviso,
    @Body({ schema: cuerpoConfig }) cuerpo: CuerpoConfig,
  ): Promise<AvisoConfigDto> {
    return this.avisos.cambiarConfig(usuario, tipo, cuerpo);
  }

  @Patch(":clave")
  @HttpCode(HttpStatus.NO_CONTENT)
  async marcar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("clave", { schema: claveRuta }) clave: string,
    @Body({ schema: cuerpoMarca }) cuerpo: CuerpoMarca,
  ): Promise<void> {
    await this.avisos.marcar(usuario, clave, cuerpo.leido);
  }
}
