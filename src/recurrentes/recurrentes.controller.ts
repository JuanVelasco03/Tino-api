import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import { aMovimientoDto, type MovimientoDto } from "../movimientos/dto.js";
import type { RecurrenteDto, RecurrentesDto } from "./dto.js";
import {
  cuerpoConfirmar,
  cuerpoOmitir,
  cuerpoPausa,
  cuerpoRecurrente,
  idRecurrente,
  vencimientoRuta,
  type CuerpoConfirmar,
  type CuerpoOmitir,
  type CuerpoPausa,
  type CuerpoRecurrente,
} from "./esquemas.js";
import { RecurrentesService } from "./recurrentes.service.js";

@Controller("recurrentes")
export class RecurrentesController {
  constructor(private readonly recurrentes: RecurrentesService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioAutenticado): Promise<RecurrentesDto> {
    return this.recurrentes.listar(usuario);
  }

  @Post()
  crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoRecurrente }) cuerpo: CuerpoRecurrente,
  ): Promise<RecurrenteDto> {
    return this.recurrentes.crear(usuario, cuerpo);
  }

  @Put(":id")
  reemplazar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
    @Body({ schema: cuerpoRecurrente }) cuerpo: CuerpoRecurrente,
  ): Promise<RecurrenteDto> {
    return this.recurrentes.reemplazar(usuario, id, cuerpo);
  }

  @Patch(":id")
  cambiarPausa(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
    @Body({ schema: cuerpoPausa }) cuerpo: CuerpoPausa,
  ): Promise<RecurrenteDto> {
    return this.recurrentes.cambiarPausa(usuario, id, cuerpo.pausada);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
  ): Promise<void> {
    await this.recurrentes.eliminar(usuario, id);
  }

  @Post(":id/confirmar")
  async confirmar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
    @Body({ schema: cuerpoConfirmar }) cuerpo: CuerpoConfirmar,
  ): Promise<MovimientoDto> {
    return aMovimientoDto(
      await this.recurrentes.confirmar(usuario, id, cuerpo.vencimiento, cuerpo.monto),
    );
  }

  @Post(":id/omitir")
  @HttpCode(HttpStatus.NO_CONTENT)
  async omitir(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
    @Body({ schema: cuerpoOmitir }) cuerpo: CuerpoOmitir,
  ): Promise<void> {
    await this.recurrentes.omitir(usuario, id, cuerpo.vencimiento);
  }

  @Delete(":id/omisiones/:vencimiento")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deshacerOmision(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idRecurrente }) id: string,
    @Param("vencimiento", { schema: vencimientoRuta }) vencimiento: string,
  ): Promise<void> {
    await this.recurrentes.deshacerOmision(usuario, id, vencimiento);
  }
}
