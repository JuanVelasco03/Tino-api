import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import {
  HORA_AVISOS,
  type Aviso,
  type AvisoVisible,
  type ConfigAviso,
  type Contexto,
  type ResolucionPrestamo,
  type TipoAviso,
} from "../domain/aviso/aviso.js";
import { configEfectiva, opcionesDe, validarCambioConfig } from "../domain/aviso/config.js";
import { avisosVisibles, contarNoLeidos } from "../domain/aviso/lista.js";
import { avisosDePrecios } from "../domain/aviso/precios.js";
import { avisosDeCobros, avisosDeDeudas, capitalAl } from "../domain/aviso/prestamos.js";
import { avisosDeRecurrentes } from "../domain/aviso/recurrentes.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import type { Activo, Operacion, Precio } from "../domain/inversion/inversion.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { MovimientoDePrestamo, Prestamo } from "../domain/prestamo/prestamo.js";
import { AvisosRepository } from "../repositories/supabase/avisos.repository.js";
import {
  InversionesRepository,
  type CuentaInversion,
} from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import {
  PrestamosRepository,
  type InteresLeido,
} from "../repositories/supabase/prestamos.repository.js";
import {
  RecurrentesRepository,
  type LecturaRecurrentes,
  type PlantillaLeida,
} from "../repositories/supabase/recurrentes.repository.js";
import type {
  AvisoConfigDto,
  AvisoDto,
  AvisosDto,
  ConteoAvisosDto,
  ResolucionPrestamoDto,
} from "./dto.js";
import type { CuerpoConfig } from "./esquemas.js";

type LecturaPrestamos = {
  prestamos: Prestamo[];
  movimientos: MovimientoDePrestamo[];
  intereses: InteresLeido[];
};

type LecturaInversiones = {
  cuentas: CuentaInversion[];
  activos: Activo[];
  operaciones: Operacion[];
  precios: Precio[];
};

/** Lo leído y calculado en una pasada: contexto, configuración, avisos visibles y sus fuentes. */
type Calculo = {
  ctx: Contexto;
  config: ConfigAviso[];
  visibles: AvisoVisible[];
  recurrentes: LecturaRecurrentes;
  prestamos: LecturaPrestamos;
  inversiones: LecturaInversiones;
};

const SIN_RECURRENTES: LecturaRecurrentes = { plantillas: [], cierres: [] };
const SIN_PRESTAMOS: LecturaPrestamos = { prestamos: [], movimientos: [], intereses: [] };
const SIN_INVERSIONES: LecturaInversiones = {
  cuentas: [],
  activos: [],
  operaciones: [],
  precios: [],
};

function aConfigDto(c: ConfigAviso): AvisoConfigDto {
  return { tipo: c.tipo, activo: c.activo, dias: c.dias, opciones: [...opcionesDe(c.tipo)] };
}

function aResolucionDto(r: ResolucionPrestamo | null): ResolucionPrestamoDto | null {
  return r === null
    ? null
    : { forma: r.forma, fecha: r.fecha, monto: r.monto.toString(), cuenta: r.cuenta };
}

function requerido<T>(valor: T | undefined, fuente: string): T {
  if (valor === undefined) throw new Error(`Aviso sin su fuente: ${fuente}`);
  return valor;
}

/**
 * Avisos (SPEC 12). Se derivan al leer: no hay escrituras en un GET, ni tareas
 * programadas, ni llamadas a proveedores de precios o TRM. Solo se escriben la
 * marca de leído y la configuración.
 */
@Injectable()
export class AvisosService {
  constructor(
    private readonly avisos: AvisosRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly recurrentes: RecurrentesRepository,
    private readonly prestamos: PrestamosRepository,
    private readonly inversiones: InversionesRepository,
  ) {}

  async listar(usuario: UsuarioAutenticado): Promise<AvisosDto> {
    const calculo = await this.calcular(usuario);
    return {
      fechaHoy: calculo.ctx.hoy,
      zonaHoraria: calculo.ctx.zona,
      horaAvisos: HORA_AVISOS,
      noLeidos: contarNoLeidos(calculo.visibles),
      avisos: calculo.visibles.map((a) => this.aDto(a, calculo)),
      config: calculo.config.map(aConfigDto),
    };
  }

  async contar(usuario: UsuarioAutenticado): Promise<ConteoAvisosDto> {
    const { visibles } = await this.calcular(usuario);
    return { noLeidos: contarNoLeidos(visibles) };
  }

  /** Solo sobre un aviso visible ahora (AVISO_NO_ENCONTRADO). */
  async marcar(usuario: UsuarioAutenticado, clave: string, leido: boolean): Promise<void> {
    const { visibles } = await this.calcular(usuario);
    if (!visibles.some((a) => a.clave === clave)) throw new ErrorApi("AVISO_NO_ENCONTRADO");
    await this.avisos.marcar(usuario, [clave], leido);
  }

  /** Los visibles no leídos pasan a leídos en una sola escritura; sin ninguno, no escribe. */
  async leerTodos(usuario: UsuarioAutenticado): Promise<void> {
    const { visibles } = await this.calcular(usuario);
    const claves = visibles.filter((a) => !a.leido).map((a) => a.clave);
    await this.avisos.marcar(usuario, claves, true);
  }

  async cambiarConfig(
    usuario: UsuarioAutenticado,
    tipo: TipoAviso,
    cambio: CuerpoConfig,
  ): Promise<AvisoConfigDto> {
    const filas = await this.avisos.leerConfig(usuario);
    const actual = configEfectiva(filas).find((c) => c.tipo === tipo)!;
    const resultado = validarCambioConfig(actual, cambio);
    if (!resultado.ok) throw new ErrorApi(resultado.error.codigo, resultado.error.campo);
    await this.avisos.guardarConfig(usuario, resultado.config);
    return aConfigDto(resultado.config);
  }

  /**
   * Perfil, configuración y marcas en paralelo; después, en paralelo, las
   * fuentes de los tipos activos. Llama al dominio y deja solo los visibles.
   */
  private async calcular(usuario: UsuarioAutenticado): Promise<Calculo> {
    const [perfil, filas, marcas] = await Promise.all([
      this.perfiles.leerPropio(usuario.token),
      this.avisos.leerConfig(usuario),
      this.avisos.leerMarcas(usuario),
    ]);
    const zona = perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO;
    const ahora = new Date();
    const ctx: Contexto = { ahora, zona, hoy: fechaLocal(ahora, zona) };
    const config = configEfectiva(filas);
    const delTipo = (tipo: TipoAviso) => config.find((c) => c.tipo === tipo)!;
    const recurrente = delTipo("recurrente");
    const cobro = delTipo("cobro");
    const deuda = delTipo("deuda");
    const precio = delTipo("precio_manual");

    const [recurrentes, prestamos, inversiones] = await Promise.all([
      recurrente.activo ? this.recurrentes.leer(usuario) : SIN_RECURRENTES,
      cobro.activo || deuda.activo
        ? this.leerPrestamos(usuario, cobro.activo, deuda.activo)
        : SIN_PRESTAMOS,
      precio.activo ? this.leerInversiones(usuario) : SIN_INVERSIONES,
    ]);

    const candidatos: Aviso[] = [
      ...(recurrente.activo
        ? avisosDeRecurrentes(recurrentes.plantillas, recurrentes.cierres, recurrente.dias, ctx)
        : []),
      ...(cobro.activo
        ? avisosDeCobros(
            prestamos.prestamos,
            prestamos.movimientos,
            prestamos.intereses,
            cobro.dias,
            ctx,
          )
        : []),
      ...(deuda.activo
        ? avisosDeDeudas(
            prestamos.prestamos,
            prestamos.movimientos,
            prestamos.intereses,
            deuda.dias,
            ctx,
          )
        : []),
      ...(precio.activo
        ? avisosDePrecios(
            inversiones.cuentas,
            inversiones.activos,
            inversiones.operaciones,
            inversiones.precios,
            precio.dias,
            ctx,
          )
        : []),
    ];

    return {
      ctx,
      config,
      visibles: avisosVisibles(candidatos, config, marcas, ctx),
      recurrentes,
      prestamos,
      inversiones,
    };
  }

  /** Solo los préstamos con fecha acordada de los tipos activos, con sus movimientos e intereses. */
  private async leerPrestamos(
    usuario: UsuarioAutenticado,
    cobro: boolean,
    deuda: boolean,
  ): Promise<LecturaPrestamos> {
    const prestamos = (await this.prestamos.listar(usuario)).filter(
      (p) =>
        p.fechaAcordada !== null &&
        ((cobro && p.tipo === "prestamo_otorgado") || (deuda && p.tipo === "deuda_contraida")),
    );
    const ids = prestamos.map((p) => p.id);
    const [movimientos, intereses] = await Promise.all([
      this.prestamos.movimientos(usuario, ids),
      this.prestamos.intereses(usuario, ids),
    ]);
    return { prestamos, movimientos, intereses };
  }

  /** Inversiones no archivadas, sus activos, operaciones y precios. Sin proveedores. */
  private async leerInversiones(usuario: UsuarioAutenticado): Promise<LecturaInversiones> {
    const cuentas = await this.inversiones.listarCuentas(usuario);
    const cuentaIds = cuentas.map((c) => c.id);
    const [activos, operaciones] = await Promise.all([
      this.inversiones.activos(usuario, cuentaIds),
      this.inversiones.operaciones(usuario, cuentaIds),
    ]);
    const manuales = activos.filter((a) => a.cotizacion === "manual").map((a) => a.id);
    const precios = await this.inversiones.precios(usuario, manuales);
    return { cuentas, activos, operaciones, precios };
  }

  private aDto(a: AvisoVisible, calculo: Calculo): AvisoDto {
    const base = {
      clave: a.clave,
      instante: a.instante.toISOString(),
      leido: a.leido,
      resuelto: a.resuelto,
    };
    switch (a.tipo) {
      case "recurrente": {
        const p: PlantillaLeida = requerido(
          calculo.recurrentes.plantillas.find((x) => x.id === a.recurrenteId),
          a.clave,
        );
        return {
          ...base,
          tipo: "recurrente",
          recurrente: { id: p.id, concepto: p.concepto, tipo: p.tipo, variable: p.variable },
          vencimiento: a.vencimiento,
          cuenta: p.cuentaOrigen ?? p.cuentaDestino,
          monto: a.monto.toString(),
          estimado: a.estimado,
          resolucion: a.resolucion,
        };
      }
      case "cobro":
      case "deuda": {
        const p = requerido(
          calculo.prestamos.prestamos.find((x) => x.id === a.prestamoId),
          a.clave,
        );
        const prestamo = { id: p.id, nombre: p.nombre };
        const capitalPendiente = capitalAl(
          p,
          calculo.prestamos.movimientos,
          calculo.ctx.hoy,
        ).toString();
        return a.tipo === "cobro"
          ? {
              ...base,
              tipo: "cobro",
              prestamo,
              fechaAcordada: a.fechaAcordada,
              recordatorio: a.recordatorio,
              monto: a.monto.toString(),
              capitalPendiente,
              proximoRecordatorio: a.proximoRecordatorio,
              resolucion: aResolucionDto(a.resolucion),
            }
          : {
              ...base,
              tipo: "deuda",
              prestamo,
              fechaAcordada: a.fechaAcordada,
              monto: a.monto.toString(),
              capitalPendiente,
              resolucion: aResolucionDto(a.resolucion),
            };
      }
      case "precio_manual": {
        const activo = requerido(
          calculo.inversiones.activos.find((x) => x.id === a.activoId),
          a.clave,
        );
        const cuenta = requerido(
          calculo.inversiones.cuentas.find((x) => x.id === a.cuentaId),
          a.clave,
        );
        return {
          ...base,
          tipo: "precio_manual",
          activo: { id: activo.id, simbolo: activo.simbolo, nombre: activo.nombre },
          inversion: { id: cuenta.id, nombre: cuenta.nombre },
          precioFecha: a.precioFecha,
          resolucion: a.resolucion,
        };
      }
    }
  }
}
