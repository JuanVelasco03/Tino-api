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
import { CuentasService } from "./cuentas.service.js";
import { aCuentaDto, aListaCuentasDto, type CuentaDto, type ListaCuentasDto } from "./dto.js";
import {
  cuerpoAlta,
  cuerpoEdicion,
  cuerpoOrden,
  cuerpoRestaurar,
  idCuenta,
  type CuerpoAlta,
  type CuerpoEdicion,
  type CuerpoOrden,
  type CuerpoRestaurar,
} from "./esquemas.js";

@Controller("cuentas")
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

  @Get()
  async listar(@Usuario() usuario: UsuarioAutenticado): Promise<ListaCuentasDto> {
    const { resumen, fechaSaldos, trm } = await this.cuentas.listar(usuario);
    return aListaCuentasDto(resumen, fechaSaldos, trm);
  }

  @Get("archivadas")
  async listarArchivadas(
    @Usuario() usuario: UsuarioAutenticado,
  ): Promise<{ cuentas: CuentaDto[] }> {
    const cuentas = await this.cuentas.listarArchivadas(usuario);
    return { cuentas: cuentas.map(aCuentaDto) };
  }

  /** Una cuenta, también archivada (SPEC 14). Un préstamo o una ajena: 404. */
  @Get(":id")
  async obtener(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
  ): Promise<CuentaDto> {
    return aCuentaDto(await this.cuentas.obtener(usuario, id));
  }

  @Post()
  async crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoAlta }) cuerpo: CuerpoAlta,
  ): Promise<CuentaDto> {
    const cuenta = await this.cuentas.crear(
      usuario,
      {
        nombre: cuerpo.nombre,
        tipo: cuerpo.tipo,
        detalle: cuerpo.detalle ?? null,
        saldoInicial: cuerpo.saldoInicial,
        cupo: cuerpo.cupo ?? null,
      },
      cuerpo.tarjeta,
    );
    return aCuentaDto(cuenta);
  }

  @Put("orden")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reordenar(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoOrden }) cuerpo: CuerpoOrden,
  ): Promise<void> {
    await this.cuentas.reordenar(usuario, cuerpo.naturaleza, cuerpo.ids);
  }

  @Patch(":id")
  async editar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Body({ schema: cuerpoEdicion }) cuerpo: CuerpoEdicion,
  ): Promise<CuentaDto> {
    const { tarjeta, ...datos } = cuerpo;
    return aCuentaDto(await this.cuentas.editar(usuario, id, datos, tarjeta));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
  ): Promise<void> {
    await this.cuentas.eliminar(usuario, id);
  }

  @Post(":id/archivar")
  @HttpCode(HttpStatus.OK)
  async archivar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
  ): Promise<CuentaDto> {
    return aCuentaDto(await this.cuentas.archivar(usuario, id));
  }

  @Post(":id/restaurar")
  @HttpCode(HttpStatus.OK)
  async restaurar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Body({ schema: cuerpoRestaurar }) cuerpo: CuerpoRestaurar,
  ): Promise<CuentaDto> {
    return aCuentaDto(await this.cuentas.restaurar(usuario, id, cuerpo.nombre));
  }
}
