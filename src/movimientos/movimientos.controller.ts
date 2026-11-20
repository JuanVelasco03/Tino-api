import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import { aMovimientoDto, type ListaMovimientosDto, type MovimientoDto } from "./dto.js";
import {
  consultaMes,
  cuerpoAlta,
  cuerpoReemplazo,
  idMovimiento,
  type CuerpoAlta,
  type CuerpoReemplazo,
} from "./esquemas.js";
import { MovimientosService } from "./movimientos.service.js";

@Controller("movimientos")
export class MovimientosController {
  constructor(private readonly movimientos: MovimientosService) {}

  @Get()
  async listar(
    @Usuario() usuario: UsuarioAutenticado,
    @Query("mes", { schema: consultaMes }) mes: string | undefined,
  ): Promise<ListaMovimientosDto> {
    const lista = await this.movimientos.listar(usuario, mes);
    return { mes: lista.mes, movimientos: lista.movimientos.map(aMovimientoDto) };
  }

  @Post()
  async crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoAlta }) cuerpo: CuerpoAlta,
  ): Promise<MovimientoDto> {
    return aMovimientoDto(await this.movimientos.crear(usuario, cuerpo));
  }

  @Put(":id")
  async reemplazar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMovimiento }) id: string,
    @Body({ schema: cuerpoReemplazo }) cuerpo: CuerpoReemplazo,
  ): Promise<MovimientoDto> {
    return aMovimientoDto(await this.movimientos.reemplazar(usuario, id, cuerpo));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMovimiento }) id: string,
  ): Promise<void> {
    await this.movimientos.eliminar(usuario, id);
  }
}
