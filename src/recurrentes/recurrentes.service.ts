import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { rangoDelMes, sumarDias } from "../domain/fecha/mes.js";
import type { Movimiento } from "../domain/movimiento/movimiento.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { comprometidoDelMes, ingresosEsperados } from "../domain/recurrente/comprometido.js";
import {
  VENTANA_DIAS,
  bandeja,
  compararPlantillas,
  ocurrenciaEn,
  ocurrenciasEntre,
  proximoVencimiento,
  ultimoConfirmado,
} from "../domain/recurrente/ocurrencias.js";
import type { Cierre, RecurrenteEntrada } from "../domain/recurrente/recurrente.js";
import {
  cambiaCalendario,
  validarCierre,
  validarRecurrente,
} from "../domain/recurrente/validar.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import {
  RecurrentesRepository,
  type PlantillaLeida,
} from "../repositories/supabase/recurrentes.repository.js";
import {
  aComprometidoDto,
  aOcurrenciaDto,
  aRecurrenteDto,
  type PlantillaCalculada,
  type RecurrenteDto,
  type RecurrentesDto,
} from "./dto.js";

/** Hoy y mes actual en la zona del perfil. */
type Dia = { hoy: string; mes: string };

@Injectable()
export class RecurrentesService {
  constructor(
    private readonly recurrentes: RecurrentesRepository,
    private readonly cuentas: CuentasRepository,
    private readonly movimientos: MovimientosRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Toda la pantalla: bandeja, comprometido, ingresos esperados y plantillas. Solo lee. */
  async listar(usuario: UsuarioAutenticado): Promise<RecurrentesDto> {
    const [dia, { plantillas, cierres }] = await Promise.all([
      this.dia(usuario),
      this.recurrentes.leer(usuario),
    ]);
    const calculadas = plantillas
      .map((p) => this.calcular(p, cierres, dia))
      .sort((a, b) =>
        compararPlantillas(
          {
            concepto: a.plantilla.concepto,
            primeraDelMes: a.ocurrenciasDelMes[0]?.vencimiento ?? null,
            proximo: a.proximoVencimiento,
          },
          {
            concepto: b.plantilla.concepto,
            primeraDelMes: b.ocurrenciasDelMes[0]?.vencimiento ?? null,
            proximo: b.proximoVencimiento,
          },
        ),
      );

    return {
      fechaHoy: dia.hoy,
      mes: dia.mes,
      ventanaDias: VENTANA_DIAS,
      bandeja: bandeja(plantillas, cierres, dia.hoy).map(aOcurrenciaDto),
      comprometido: aComprometidoDto(comprometidoDelMes(plantillas, cierres, dia.hoy, dia.mes)),
      ingresosEsperados: ingresosEsperados(plantillas, cierres, dia.hoy, dia.mes).map(
        aOcurrenciaDto,
      ),
      recurrentes: calculadas.map(aRecurrenteDto),
    };
  }

  /** generar_desde = primer_vencimiento; activa. */
  async crear(usuario: UsuarioAutenticado, entrada: RecurrenteEntrada): Promise<RecurrenteDto> {
    const dia = await this.dia(usuario);
    this.validar(entrada, dia.hoy);
    await this.rechazarArchivadas(usuario, entrada);
    const id = await this.recurrentes.crear(usuario, entrada, {
      generarDesde: entrada.primerVencimiento,
      pausadaDesde: null,
    });
    return this.respuesta(usuario, id, dia);
  }

  /**
   * Reemplazo completo. Si cambia el calendario, generar_desde pasa a
   * primer_vencimiento (las abiertas anteriores desaparecen; los cierres se
   * quedan). La pausa no se toca.
   */
  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    entrada: RecurrenteEntrada,
  ): Promise<RecurrenteDto> {
    const [dia, actual] = await Promise.all([this.dia(usuario), this.obtener(usuario, id)]);
    this.validar(entrada, dia.hoy, actual.plantilla);
    await this.rechazarArchivadas(usuario, entrada);
    await this.recurrentes.reemplazar(usuario, id, entrada, {
      generarDesde: cambiaCalendario(actual.plantilla, entrada)
        ? entrada.primerVencimiento
        : actual.plantilla.generarDesde,
      pausadaDesde: actual.plantilla.pausadaDesde,
    });
    return this.respuesta(usuario, id, dia);
  }

  /**
   * Pausar: pausada_desde = hoy + 1 (lo que vence hasta hoy sigue en la
   * bandeja). Reanudar: generar_desde = hoy (lo del tiempo en pausa no vuelve).
   * Al estado que ya tiene, sin cambios.
   */
  async cambiarPausa(
    usuario: UsuarioAutenticado,
    id: string,
    pausada: boolean,
  ): Promise<RecurrenteDto> {
    const [dia, actual] = await Promise.all([this.dia(usuario), this.obtener(usuario, id)]);
    const { plantilla, cierres } = actual;
    if ((plantilla.pausadaDesde !== null) === pausada) {
      return aRecurrenteDto(this.calcular(plantilla, cierres, dia));
    }
    await this.recurrentes.cambiarCalendario(
      usuario,
      id,
      pausada
        ? { generarDesde: plantilla.generarDesde, pausadaDesde: sumarDias(dia.hoy, 1) }
        : { generarDesde: dia.hoy, pausadaDesde: null },
    );
    return this.respuesta(usuario, id, dia);
  }

  eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    return this.recurrentes.eliminar(usuario, id);
  }

  /**
   * Confirma una ocurrencia de la bandeja como movimiento con fecha =
   * vencimiento. Sin monto, el importe mostrado. Devuelve el movimiento.
   */
  async confirmar(
    usuario: UsuarioAutenticado,
    id: string,
    vencimiento: string,
    monto: bigint | null,
  ): Promise<Movimiento> {
    const [dia, { plantilla, cierres }] = await Promise.all([
      this.dia(usuario),
      this.obtener(usuario, id),
    ]);
    const ocurrencia = ocurrenciaEn(plantilla, cierres, dia.hoy, vencimiento);
    this.validarCierre(ocurrencia);
    const movimientoId = await this.recurrentes.confirmar(
      usuario,
      id,
      vencimiento,
      monto ?? ocurrencia!.monto,
    );
    const movimiento = await this.movimientos.obtener(usuario, movimientoId);
    if (!movimiento) throw new ErrorApi("MOVIMIENTO_NO_ENCONTRADO");
    return movimiento;
  }

  async omitir(usuario: UsuarioAutenticado, id: string, vencimiento: string): Promise<void> {
    const [dia, { plantilla, cierres }] = await Promise.all([
      this.dia(usuario),
      this.obtener(usuario, id),
    ]);
    this.validarCierre(ocurrenciaEn(plantilla, cierres, dia.hoy, vencimiento));
    await this.recurrentes.omitir(usuario, id, vencimiento);
  }

  async deshacerOmision(
    usuario: UsuarioAutenticado,
    id: string,
    vencimiento: string,
  ): Promise<void> {
    await this.obtener(usuario, id);
    await this.recurrentes.deshacerOmision(usuario, id, vencimiento);
  }

  private validar(entrada: RecurrenteEntrada, hoy: string, actual?: PlantillaLeida): void {
    const error = validarRecurrente(entrada, hoy, actual);
    if (error) throw new ErrorApi(error.codigo, error.campo);
  }

  private validarCierre(ocurrencia: ReturnType<typeof ocurrenciaEn>): void {
    const codigo = validarCierre(ocurrencia);
    if (codigo) throw new ErrorApi(codigo);
  }

  /**
   * Una cuenta archivada no se asigna a una plantilla. Si no existe o es
   * ajena, la FK compuesta la rechaza al escribir (CUENTA_INVALIDA).
   */
  private async rechazarArchivadas(
    usuario: UsuarioAutenticado,
    entrada: RecurrenteEntrada,
  ): Promise<void> {
    const campos = [
      ["cuentaOrigenId", entrada.cuentaOrigenId],
      ["cuentaDestinoId", entrada.cuentaDestinoId],
    ] as const;
    const cuentas = await Promise.all(
      campos.map(([, id]) =>
        id === null ? Promise.resolve(null) : this.cuentas.obtener(usuario, id),
      ),
    );
    for (const [i, cuenta] of cuentas.entries()) {
      if (cuenta?.archivadaEn) throw new ErrorApi("CUENTA_ARCHIVADA", campos[i]![0]);
    }
  }

  private async dia(usuario: UsuarioAutenticado): Promise<Dia> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const hoy = fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
    return { hoy, mes: hoy.slice(0, 7) };
  }

  /** Una plantilla ajena no es visible por RLS: se trata como inexistente. */
  private async obtener(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<{ plantilla: PlantillaLeida; cierres: Cierre[] }> {
    const { plantillas, cierres } = await this.recurrentes.leer(usuario, id);
    const plantilla = plantillas[0];
    if (!plantilla) throw new ErrorApi("RECURRENTE_NO_ENCONTRADO");
    return { plantilla, cierres };
  }

  private async respuesta(
    usuario: UsuarioAutenticado,
    id: string,
    dia: Dia,
  ): Promise<RecurrenteDto> {
    const { plantilla, cierres } = await this.obtener(usuario, id);
    return aRecurrenteDto(this.calcular(plantilla, cierres, dia));
  }

  private calcular(plantilla: PlantillaLeida, cierres: Cierre[], dia: Dia): PlantillaCalculada {
    const { desde, hasta } = rangoDelMes(dia.mes);
    return {
      plantilla,
      ultimoConfirmado: ultimoConfirmado(plantilla.id, cierres),
      ocurrenciasDelMes: ocurrenciasEntre(plantilla, cierres, dia.hoy, desde, hasta),
      proximoVencimiento: proximoVencimiento(plantilla, cierres, dia.hoy),
    };
  }
}
