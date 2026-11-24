/**
 * Subrutas de una cuenta (SPEC 14): historial, conciliación, ajuste de saldo y
 * ciclo de tarjeta. `GET /cuentas/:id` vive en `CuentasController`.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import { idCuenta } from "../cuentas/esquemas.js";
import { aMovimientoDto, type MovimientoDto } from "../movimientos/dto.js";
import { DetalleCuentaService } from "./detalle-cuenta.service.js";
import { aCicloDto, aHistorialDto, type CicloDto, type HistorialDto } from "./dto.js";
import {
  consultaCiclo,
  consultaHistorial,
  cuerpoAjuste,
  cuerpoConciliacion,
  type ConsultaCiclo,
  type ConsultaHistorial,
  type CuerpoAjuste,
  type CuerpoConciliacion,
} from "./esquemas.js";

@Controller("cuentas")
export class DetalleCuentaController {
  constructor(private readonly detalle: DetalleCuentaService) {}

  @Get(":id/historial")
  async historial(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Query({ schema: consultaHistorial }) consulta: ConsultaHistorial,
  ): Promise<HistorialDto> {
    return aHistorialDto(await this.detalle.historial(usuario, id, consulta.desde, consulta.hasta));
  }

  @Put(":id/conciliacion")
  @HttpCode(HttpStatus.NO_CONTENT)
  async conciliar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Body({ schema: cuerpoConciliacion }) cuerpo: CuerpoConciliacion,
  ): Promise<void> {
    await this.detalle.conciliar(usuario, id, cuerpo.movimientoIds, cuerpo.conciliado);
  }

  @Post(":id/ajustes")
  async ajustar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Body({ schema: cuerpoAjuste }) cuerpo: CuerpoAjuste,
  ): Promise<MovimientoDto> {
    const ajuste = await this.detalle.ajustar(
      usuario,
      id,
      cuerpo.saldoReal,
      cuerpo.conciliarHastaHoy,
    );
    return aMovimientoDto(ajuste);
  }

  @Get(":id/ciclo")
  async ciclo(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idCuenta }) id: string,
    @Query({ schema: consultaCiclo }) consulta: ConsultaCiclo,
  ): Promise<CicloDto> {
    return aCicloDto(id, await this.detalle.ciclo(usuario, id, consulta.compra));
  }
}
