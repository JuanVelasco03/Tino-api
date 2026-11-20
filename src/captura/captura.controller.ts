import { Controller, Get, Query } from "@nestjs/common";
import { Usuario, type UsuarioAutenticado } from "../autenticacion/usuario.js";
import { CapturaService } from "./captura.service.js";
import type { CapturaDto, SugerenciasDto } from "./dto.js";
import { consultaSugerencias, type ConsultaSugerencias } from "./esquemas.js";

@Controller()
export class CapturaController {
  constructor(private readonly captura: CapturaService) {}

  /** Datos para abrir la captura rápida. */
  @Get("captura")
  obtener(@Usuario() usuario: UsuarioAutenticado): Promise<CapturaDto> {
    return this.captura.obtener(usuario);
  }

  /** Conceptos y categoría propuesta mientras se escribe la descripción. */
  @Get("sugerencias")
  sugerir(
    @Usuario() usuario: UsuarioAutenticado,
    @Query({ schema: consultaSugerencias }) consulta: ConsultaSugerencias,
  ): Promise<SugerenciasDto> {
    return this.captura.sugerir(usuario, consulta.tipo, consulta.texto);
  }
}
