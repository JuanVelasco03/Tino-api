import { Injectable, Logger } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { Trm, TrmResuelta } from "../domain/trm/trm.js";
import { cubre, resolverTrm } from "../domain/trm/vigente.js";
import { TrmFuente } from "../repositories/datos-gov/trm.fuente.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { TrmRepository } from "../repositories/supabase/trm.repository.js";
import { aTrmVigenteDto, type TrmVigenteDto } from "./dto.js";

@Injectable()
export class TrmService {
  private readonly logger = new Logger(TrmService.name);

  constructor(
    private readonly cache: TrmRepository,
    private readonly fuente: TrmFuente,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** TRM de hoy en la zona del perfil (`GET /trm`). */
  async vigente(usuario: UsuarioAutenticado): Promise<TrmVigenteDto> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const fechaHoy = fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
    return aTrmVigenteDto(fechaHoy, await this.en(usuario.token, fechaHoy));
  }

  /**
   * TRM que rige en `fecha` ("YYYY-MM-DD"), cualquier fecha (N-54). Primero la
   * caché; si no la cubre, la fuente, y lo obtenido se guarda. Si la fuente
   * falla, la última conocida con `desactualizada: true` (`resolverTrm`).
   * La falla de la fuente o de la caché al guardar nunca tumba la lectura.
   */
  async en(token: string, fecha: string): Promise<TrmResuelta> {
    const guardada = await this.cache.ultimaHasta(token, fecha);
    if (guardada !== null && cubre(guardada, fecha)) return resolverTrm(guardada, null, fecha);

    const obtenida = await this.fuente.obtenerEn(fecha);
    if (obtenida !== null) await this.guardarSinFallar(token, obtenida);
    return resolverTrm(guardada, obtenida, fecha);
  }

  /** La caché es una optimización: si guardar falla, se responde igual y queda un aviso. */
  private async guardarSinFallar(token: string, trm: Trm): Promise<void> {
    try {
      await this.cache.guardar(token, trm);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo guardar la TRM ${trm.vigenteDesde} en caché: ${motivo}`);
    }
  }
}
