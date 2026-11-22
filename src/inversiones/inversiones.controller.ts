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
import type { InversionDetalleDto, InversionesDto, OperacionesDto } from "./dto.js";
import {
  consultaActivo,
  cuerpoCambioOperacion,
  cuerpoInversion,
  cuerpoOperacion,
  cuerpoPrecio,
  idActivo,
  idInversion,
  idOperacion,
  type CuerpoCambioOperacion,
  type CuerpoInversion,
  type CuerpoOperacion,
  type CuerpoPrecio,
} from "./esquemas.js";
import { InversionesService } from "./inversiones.service.js";

@Controller("inversiones")
export class InversionesController {
  constructor(private readonly inversiones: InversionesService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioAutenticado): Promise<InversionesDto> {
    return this.inversiones.listar(usuario);
  }

  @Post()
  crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoInversion }) cuerpo: CuerpoInversion,
  ): Promise<InversionDetalleDto> {
    return this.inversiones.crear(usuario, cuerpo);
  }

  @Get(":id")
  detalle(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
  ): Promise<InversionDetalleDto> {
    return this.inversiones.detalle(usuario, id);
  }

  @Get(":id/operaciones")
  operaciones(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
    @Query("activoId", { schema: consultaActivo }) activoId: string | undefined,
  ): Promise<OperacionesDto> {
    return this.inversiones.operaciones(usuario, id, activoId);
  }

  @Post(":id/operaciones")
  registrarOperacion(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
    @Body({ schema: cuerpoOperacion }) cuerpo: CuerpoOperacion,
  ): Promise<InversionDetalleDto> {
    return this.inversiones.registrarOperacion(usuario, id, cuerpo);
  }

  @Put(":id/operaciones/:operacionId")
  editarOperacion(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
    @Param("operacionId", { schema: idOperacion }) operacionId: string,
    @Body({ schema: cuerpoCambioOperacion }) cuerpo: CuerpoCambioOperacion,
  ): Promise<InversionDetalleDto> {
    return this.inversiones.editarOperacion(usuario, id, operacionId, cuerpo);
  }

  @Delete(":id/operaciones/:operacionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminarOperacion(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
    @Param("operacionId", { schema: idOperacion }) operacionId: string,
  ): Promise<void> {
    return this.inversiones.eliminarOperacion(usuario, id, operacionId);
  }

  @Post(":id/activos/:activoId/precios")
  registrarPrecio(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idInversion }) id: string,
    @Param("activoId", { schema: idActivo }) activoId: string,
    @Body({ schema: cuerpoPrecio }) cuerpo: CuerpoPrecio,
  ): Promise<InversionDetalleDto> {
    return this.inversiones.registrarPrecio(usuario, id, activoId, cuerpo.precio);
  }
}
