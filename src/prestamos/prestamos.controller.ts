import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import { aMovimientoDto, type MovimientoDto } from "../movimientos/dto.js";
import type { PrestamoDetalleDto, PrestamosDto, PropuestaAbonoDto } from "./dto.js";
import {
  consultaPropuesta,
  cuerpoAbono,
  cuerpoCambio,
  cuerpoCondonacion,
  cuerpoDesembolso,
  cuerpoPrestamo,
  idPrestamo,
  type ConsultaPropuesta,
  type CuerpoAbono,
  type CuerpoCambio,
  type CuerpoCondonacion,
  type CuerpoDesembolso,
  type CuerpoPrestamo,
} from "./esquemas.js";
import { PrestamosService } from "./prestamos.service.js";

@Controller("prestamos")
export class PrestamosController {
  constructor(private readonly prestamos: PrestamosService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioAutenticado): Promise<PrestamosDto> {
    return this.prestamos.listar(usuario);
  }

  @Post()
  crear(
    @Usuario() usuario: UsuarioAutenticado,
    @Body({ schema: cuerpoPrestamo }) cuerpo: CuerpoPrestamo,
  ): Promise<PrestamoDetalleDto> {
    return this.prestamos.crear(usuario, cuerpo);
  }

  @Get(":id")
  detalle(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
  ): Promise<PrestamoDetalleDto> {
    return this.prestamos.detalle(usuario, id);
  }

  @Patch(":id")
  cambiar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
    @Body({ schema: cuerpoCambio }) cuerpo: CuerpoCambio,
  ): Promise<PrestamoDetalleDto> {
    return this.prestamos.cambiar(usuario, id, cuerpo);
  }

  @Post(":id/desembolsos")
  desembolsar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
    @Body({ schema: cuerpoDesembolso }) cuerpo: CuerpoDesembolso,
  ): Promise<PrestamoDetalleDto> {
    return this.prestamos.desembolsar(usuario, id, cuerpo);
  }

  @Get(":id/propuesta-abono")
  propuesta(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
    @Query({ schema: consultaPropuesta }) consulta: ConsultaPropuesta,
  ): Promise<PropuestaAbonoDto> {
    return this.prestamos.propuesta(usuario, id, consulta);
  }

  @Post(":id/abonos")
  abonar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
    @Body({ schema: cuerpoAbono }) cuerpo: CuerpoAbono,
  ): Promise<PrestamoDetalleDto> {
    return this.prestamos.abonar(usuario, id, cuerpo);
  }

  @Post(":id/condonaciones")
  async condonar(
    @Usuario() usuario: UsuarioAutenticado,
    @Param("id", { schema: idPrestamo }) id: string,
    @Body({ schema: cuerpoCondonacion }) cuerpo: CuerpoCondonacion,
  ): Promise<MovimientoDto> {
    return aMovimientoDto(await this.prestamos.condonar(usuario, id, cuerpo));
  }
}
