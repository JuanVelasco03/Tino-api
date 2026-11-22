/**
 * Precios automáticos (SPEC 11). Patrón de la TRM (SPEC 09): datos externos
 * bajo demanda, en la caché de precios del usuario (`inversion_precios`), con
 * su token. Ningún job ni `service_role` (REGLAS §4). La falla de la fuente o
 * al guardar nunca tumba una lectura.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import type { Activo } from "../domain/inversion/inversion.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { elegirCobertura } from "../domain/precio/cobertura.js";
import { cierresAGuardar, fechasFaltantes, rangoHistorico } from "../domain/precio/historico.js";
import { LOTE_MAXIMO, type Cobertura, type PrecioObtenido } from "../domain/precio/precio.js";
import { loteAConsultar } from "../domain/precio/vencimiento.js";
import type { InversionPatrimonio } from "../domain/resumen/resumen.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PreciosFuente, type PedidoHistorico } from "../repositories/twelve-data/precios.fuente.js";

export type ResultadoBusquedaActivo = { cobertura: Cobertura; proveedorDisponible: boolean };

@Injectable()
export class PreciosService {
  private readonly logger = new Logger(PreciosService.name);

  constructor(
    private readonly fuente: PreciosFuente,
    private readonly inversiones: InversionesRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /**
   * Precio actual de los activos vencidos (`debeConsultar`), a lo sumo 8 por
   * lectura, los de consulta más antigua primero. Guarda los que llegaron y
   * marca como consultados todos los del lote, también los que fallaron, para
   * no repetir la consulta en la siguiente lectura. Sin clave, no hace nada.
   * Devuelve `true` si consultó: quien llama relee los precios.
   */
  async refrescar(
    usuario: UsuarioAutenticado,
    activos: readonly Activo[],
    ahora: Date = new Date(),
  ): Promise<boolean> {
    if (!this.fuente.disponible) return false;
    const lote = loteAConsultar(activos, ahora);
    if (lote.length === 0) return false;

    const obtenidos = await this.fuente.actuales(
      lote.map((a) => ({ activoId: a.id, clase: a.clase!, simboloFuente: a.simboloFuente! })),
    );
    const llegados = obtenidos.filter((p): p is PrecioObtenido => p !== null);
    const precios = llegados.some((p) => p.origen === "intradia")
      ? await this.fecharIntradias(usuario, llegados)
      : llegados;
    await this.guardarSinFallar(
      usuario,
      precios,
      lote.map((a) => a.id),
    );
    return true;
  }

  /**
   * Cierres de las fechas pasadas que pide el patrimonio (N-54). Por activo
   * automático, las fechas faltantes (`fechasFaltantes`) en un solo rango; los
   * rangos van en un lote de hasta 8 activos y de cada serie se guarda solo el
   * último cierre ≤ F de cada F. Devuelve `true` si guardó algo.
   */
  async completarHistorico(
    usuario: UsuarioAutenticado,
    datos: ReadonlyMap<string, InversionPatrimonio>,
    fechas: readonly string[],
  ): Promise<boolean> {
    if (!this.fuente.disponible) return false;
    const pendientes: { pedido: PedidoHistorico; faltantes: string[] }[] = [];
    for (const inversion of datos.values()) {
      for (const activo of inversion.activos) {
        if (activo.cotizacion !== "automatica" || activo.simboloFuente === null) continue;
        const faltantes = fechasFaltantes(activo, fechas, inversion.operaciones, inversion.precios);
        const rango = rangoHistorico(faltantes);
        if (rango === null) continue;
        pendientes.push({
          pedido: { activoId: activo.id, simboloFuente: activo.simboloFuente, ...rango },
          faltantes,
        });
      }
    }
    // El resto espera a la siguiente lectura, como en el refresco.
    const lote = pendientes.slice(0, LOTE_MAXIMO);
    if (lote.length === 0) return false;

    const series = await this.fuente.historico(lote.map((p) => p.pedido));
    const cierres = lote.flatMap(({ pedido, faltantes }, i) => {
      const serie = series[i];
      return serie ? cierresAGuardar(pedido.activoId, faltantes, serie) : [];
    });
    if (cierres.length === 0) return false;
    await this.guardarSinFallar(usuario, cierres, []);
    return true;
  }

  /**
   * Cobertura de `simbolo` (ya normalizado) en una cuenta en `moneda`. Si la
   * fuente está apagada o falla: no cubierto y `proveedorDisponible: false`.
   */
  async buscar(simbolo: string, moneda: string): Promise<ResultadoBusquedaActivo> {
    if (!this.fuente.disponible) {
      return { cobertura: { cubierto: false }, proveedorDisponible: false };
    }
    const resultados = await this.fuente.buscar(simbolo);
    if (resultados === null) return { cobertura: { cubierto: false }, proveedorDisponible: false };
    return { cobertura: elegirCobertura(simbolo, moneda, resultados), proveedorDisponible: true };
  }

  /** El intradía es uno por activo y día en la zona del usuario: su fecha sale de `cotizadoEn`. */
  private async fecharIntradias(
    usuario: UsuarioAutenticado,
    precios: readonly PrecioObtenido[],
  ): Promise<PrecioObtenido[]> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const zona = perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO;
    return precios.map((p) =>
      p.origen === "intradia" ? { ...p, fecha: fechaLocal(p.cotizadoEn, zona) } : p,
    );
  }

  /** La caché es una optimización: si guardar falla, se responde igual y queda un aviso. */
  private async guardarSinFallar(
    usuario: UsuarioAutenticado,
    precios: readonly PrecioObtenido[],
    consultados: readonly string[],
  ): Promise<void> {
    try {
      await this.inversiones.guardarPreciosAutomaticos(usuario, precios, consultados);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudieron guardar los precios automáticos: ${motivo}`);
    }
  }
}
