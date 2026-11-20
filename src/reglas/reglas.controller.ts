import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import {
  cuerpoAlta,
  cuerpoEdicion,
  idRegla,
  type CuerpoAlta,
  type CuerpoEdicion,
} from "./esquemas.js";
import { ReglasService, type ReglaDto } from "./reglas.service.js";

@Controller("reglas")
export class ReglasController {
  constructor(private readonly reglas: ReglasService) {}

  @Post()
  crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoAlta }) cuerpo: CuerpoAlta,
  ): Promise<ReglaDto> {
    return this.reglas.crear(usuario, cuerpo.palabraClave, cuerpo.categoriaId);
  }

  @Patch(":id")
  cambiarCategoria(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRegla }) id: string,
    @Body({ schema: cuerpoEdicion }) cuerpo: CuerpoEdicion,
  ): Promise<ReglaDto> {
    return this.reglas.cambiarCategoria(usuario, id, cuerpo.categoriaId);
  }
}
