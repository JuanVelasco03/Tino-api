import { Injectable, Logger } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { Trm, TrmResuelta } from "../domain/trm/trm.js";
import { cubre, resolverEnFechas, resolverTrm, sinCubrir } from "../domain/trm/vigente.js";
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

  /**
   * TRM de varias fechas en una lectura de la caché y a lo sumo una consulta a
   * la fuente (SPEC 10). La caché trae las filas que se cruzan con
   * `[min, max]` y la última anterior a `min`; las fechas que no cubren se
   * piden a la fuente en un solo rango `[minFaltante, maxFaltante]`, y lo
   * obtenido se guarda. Cada fecha se resuelve con la regla de `resolverTrm`.
   */
  async enFechas(token: string, fechas: readonly string[]): Promise<Map<string, TrmResuelta>> {
    const distintas = [...new Set(fechas)].toSorted();
    const min = distintas[0];
    const max = distintas.at(-1);
    if (min === undefined || max === undefined) return new Map();

    const guardadas = await this.cache.enRango(token, min, max);
    const faltantes = sinCubrir(guardadas, distintas);
    let obtenidas: Trm[] | null = null;
    if (faltantes.length > 0) {
      obtenidas = await this.fuente.obtenerRango(faltantes[0]!, faltantes.at(-1)!);
      if (obtenidas !== null) await this.guardarSinFallar(token, obtenidas);
    }
    return resolverEnFechas(guardadas, obtenidas, distintas);
  }

  /** La caché es una optimización: si guardar falla, se responde igual y queda un aviso. */
  private async guardarSinFallar(token: string, trm: Trm | readonly Trm[]): Promise<void> {
    const trms = Array.isArray(trm) ? trm : [trm as Trm];
    try {
      await this.cache.guardarVarias(token, trms);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      const vigencias = trms.map((t) => t.vigenteDesde).join(", ");
      this.logger.warn(`No se pudo guardar la TRM ${vigencias} en caché: ${motivo}`);
    }
  }
}
