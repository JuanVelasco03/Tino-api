import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { MetaDetalleDto, MetaDto, MetasDto } from "./dto.js";
import {
  cuerpoAporte,
  cuerpoCambioAporte,
  cuerpoCambioMeta,
  cuerpoMeta,
  idAporte,
  idMeta,
  type CuerpoAporte,
  type CuerpoCambioAporte,
  type CuerpoCambioMeta,
  type CuerpoMeta,
} from "./esquemas.js";
import { MetasService } from "./metas.service.js";

@Controller("metas")
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioAutenticado): Promise<MetasDto> {
    return this.metas.listar(usuario);
  }

  @Get("archivadas")
  listarArchivadas(@Usuario() usuario: UsuarioAutenticado): Promise<MetaDto[]> {
    return this.metas.listarArchivadas(usuario);
  }

  @Get(":id")
  detalle(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
  ): Promise<MetaDetalleDto> {
    return this.metas.detalle(usuario, id);
  }

  @Post()
  crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoMeta }) cuerpo: CuerpoMeta,
  ): Promise<MetaDetalleDto> {
    return this.metas.crear(usuario, cuerpo);
  }

  @Patch(":id")
  editar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
    @Body({ schema: cuerpoCambioMeta }) cuerpo: CuerpoCambioMeta,
  ): Promise<MetaDetalleDto> {
    return this.metas.editar(usuario, id, cuerpo);
  }

  @Delete(":id")
  @HttpCode(204)
  eliminar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
  ): Promise<void> {
    return this.metas.eliminar(usuario, id);
  }

  @Post(":id/archivar")
  @HttpCode(200)
  archivar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
  ): Promise<MetaDto> {
    return this.metas.archivar(usuario, id);
  }

  @Post(":id/restaurar")
  @HttpCode(200)
  restaurar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
  ): Promise<MetaDetalleDto> {
    return this.metas.restaurar(usuario, id);
  }

  @Post(":id/aportes")
  registrarAporte(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
    @Body({ schema: cuerpoAporte }) cuerpo: CuerpoAporte,
  ): Promise<MetaDetalleDto> {
    return this.metas.registrarAporte(usuario, id, cuerpo);
  }

  @Put(":id/aportes/:aporteId")
  editarAporte(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
    @Param("aporteId", { schema: idAporte }) aporteId: string,
    @Body({ schema: cuerpoCambioAporte }) cuerpo: CuerpoCambioAporte,
  ): Promise<MetaDetalleDto> {
    return this.metas.editarAporte(usuario, id, aporteId, cuerpo);
  }

  @Delete(":id/aportes/:aporteId")
  @HttpCode(204)
  eliminarAporte(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idMeta }) id: string,
    @Param("aporteId", { schema: idAporte }) aporteId: string,
  ): Promise<void> {
    return this.metas.eliminarAporte(usuario, id, aporteId);
  }
}
