import { Controller, Get, Query } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { ResumenDto } from "./dto.js";
import { consultaMes } from "./esquemas.js";
import { ResumenService } from "./resumen.service.js";

@Controller("resumen")
export class ResumenController {
  constructor(private readonly resumen: ResumenService) {}

  /** Resumen del mes `?mes=YYYY-MM`; sin mes, el actual en la zona del usuario. */
  @Get()
  obtener(
    @Usuario() usuario: UsuarioAutenticado,
    @Query("mes", { schema: consultaMes }) mes: string | undefined,
  ): Promise<ResumenDto> {
    return this.resumen.obtener(usuario, mes);
  }
}
