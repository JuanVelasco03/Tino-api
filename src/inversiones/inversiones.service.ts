import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { calcularSaldo } from "../domain/cuenta/saldo.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { parsearCantidad } from "../domain/inversion/cantidad.js";
import { TIPO_INVERSION, type ClaseOperacion, type Moneda } from "../domain/inversion/inversion.js";
import { gananciasRealizadas } from "../domain/inversion/posiciones.js";
import {
  normalizarSimbolo,
  primerPrecio,
  validarAltaInversion,
  validarCambioOperacion,
  validarOperacion,
  validarPrecio,
  type ErrorInversion,
} from "../domain/inversion/validar.js";
import { valorarInversion, type InversionValorada } from "../domain/inversion/valoracion.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { InversionPatrimonio } from "../domain/resumen/resumen.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import {
  InversionesRepository,
  type CuentaInversion,
} from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { aTrmDto } from "../trm/dto.js";
import { TrmService } from "../trm/trm.service.js";
import {
  aInversionDetalleDto,
  aInversionResumenDto,
  aOperacionDto,
  type InversionDetalleDto,
  type InversionesDto,
  type OperacionesDto,
} from "./dto.js";
import type { CuerpoCambioOperacion, CuerpoInversion, CuerpoOperacion } from "./esquemas.js";
import { LineaDeTiempoService } from "./linea-de-tiempo.service.js";

function lanzar(error: ErrorInversion | null): void {
  if (error) throw new ErrorApi(error.codigo, error.campo);
}

const SIN_DATOS: InversionPatrimonio = { activos: [], operaciones: [], precios: [] };

@Injectable()
export class InversionesService {
  constructor(
    private readonly inversiones: InversionesRepository,
    private readonly cuentas: CuentasRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly trm: TrmService,
    private readonly lineaDeTiempo: LineaDeTiempoService,
  ) {}

  /** Inversiones no archivadas valoradas a hoy, con la TRM de hoy (N-38: aunque no haya ninguna). */
  async listar(usuario: UsuarioAutenticado): Promise<InversionesDto> {
    const fechaHoy = await this.hoy(usuario);
    const cuentas = await this.inversiones.listarCuentas(usuario);
    const ids = cuentas.map((c) => c.id);
    const [datos, efectos, trm] = await Promise.all([
      this.inversiones.datos(usuario, ids),
      ids.length === 0 ? Promise.resolve([]) : this.cuentas.efectos(usuario),
      this.trm.en(usuario.token, fechaHoy),
    ]);
    const hastaHoy = efectos.filter((m) => m.fecha <= fechaHoy);
    return {
      fechaHoy,
      trm: trm.trm === null ? null : aTrmDto(trm.trm),
      trmDesactualizada: trm.desactualizada,
      inversiones: cuentas.map((c) =>
        aInversionResumenDto(c, this.valorar(c, datos.get(c.id), hastaHoy, fechaHoy), trm),
      ),
    };
  }

  /** Detalle valorado a hoy; también de una inversión archivada. */
  async detalle(usuario: UsuarioAutenticado, id: string): Promise<InversionDetalleDto> {
    const [cuenta, fechaHoy] = await Promise.all([
      this.obtenerCuenta(usuario, id),
      this.hoy(usuario),
    ]);
    const [datos, efectos, trm] = await Promise.all([
      this.inversiones.datos(usuario, [id]),
      this.cuentas.efectos(usuario, id),
      this.trm.en(usuario.token, fechaHoy),
    ]);
    const hastaHoy = efectos.filter((m) => m.fecha <= fechaHoy);
    return aInversionDetalleDto(
      cuenta,
      this.valorar(cuenta, datos.get(id), hastaHoy, fechaHoy),
      trm,
      fechaHoy,
    );
  }

  /**
   * Crea la cuenta con su efectivo inicial y lo que ya se tenía (operaciones
   * `inicial`, que no mueven efectivo). El primer precio de cada activo es su
   * costo unitario.
   */
  async crear(usuario: UsuarioAutenticado, cuerpo: CuerpoInversion): Promise<InversionDetalleDto> {
    const fechaHoy = await this.hoy(usuario);
    const posiciones = cuerpo.posiciones.map((p) => ({ ...p, fecha: p.fecha ?? fechaHoy }));
    lanzar(validarAltaInversion({ ...cuerpo, posiciones }, fechaHoy));
    const id = await this.inversiones.crear(usuario, {
      nombre: cuerpo.nombre.trim(),
      moneda: cuerpo.moneda as Moneda,
      efectivoInicial: cuerpo.efectivoInicial,
      posiciones: posiciones.map((p) => {
        const cantidad = parsearCantidad(p.cantidad)!;
        return {
          simbolo: normalizarSimbolo(p.simbolo)!,
          nombre: p.nombre.trim(),
          cantidad,
          monto: p.costo,
          fecha: p.fecha,
          precio: primerPrecio(p.costo, cantidad)!,
        };
      }),
    });
    return this.detalle(usuario, id);
  }

  /** Operaciones de la cuenta, por fecha desc; con `activoId`, solo las de ese activo (N-63). */
  async operaciones(
    usuario: UsuarioAutenticado,
    id: string,
    activoId: string | undefined,
  ): Promise<OperacionesDto> {
    await this.obtenerCuenta(usuario, id);
    const [operaciones, activos] = await Promise.all([
      this.inversiones.operaciones(usuario, [id]),
      this.inversiones.activos(usuario, [id]),
    ]);
    // La ganancia de cada venta depende de todas las operaciones del activo.
    const ganancias = gananciasRealizadas(operaciones);
    const porId = new Map(activos.map((a) => [a.id, a]));
    return {
      operaciones: operaciones
        .filter((op) => activoId === undefined || op.activoId === activoId)
        .map((op) => {
          const activo = porId.get(op.activoId);
          if (!activo) throw new Error(`Operación ${op.id} sin activo visible.`);
          return aOperacionDto(op, activo, ganancias.get(op.id));
        }),
    };
  }

  /**
   * Registra una operación. Un activo nuevo nace con ella y su primer precio
   * es el costo unitario. La línea de tiempo debe seguir válida (N-65).
   */
  async registrarOperacion(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoOperacion,
  ): Promise<InversionDetalleDto> {
    const [cuenta, fechaHoy] = await Promise.all([
      this.obtenerNoArchivada(usuario, id),
      this.hoy(usuario),
    ]);
    const entrada = { ...cuerpo, fecha: cuerpo.fecha ?? fechaHoy };
    lanzar(validarOperacion(entrada, fechaHoy));
    const clase = entrada.clase as ClaseOperacion;
    const simbolo = normalizarSimbolo(entrada.simbolo)!;
    const cantidad = parsearCantidad(entrada.cantidad)!;

    const activos = await this.inversiones.activos(usuario, [cuenta.id]);
    const existente = activos.find((a) => a.simbolo === simbolo);
    if (!existente && clase === "venta") throw new ErrorApi("ACTIVO_NO_ENCONTRADO", "simbolo");
    if (!existente && entrada.nombre === null) throw new ErrorApi("NOMBRE_REQUERIDO", "nombre");

    const nueva = {
      id: "nueva",
      activoId: existente?.id ?? "nuevo",
      clase,
      cantidad,
      monto: entrada.monto,
      fecha: entrada.fecha,
    };
    await this.lineaDeTiempo.validar(usuario, id, { operacion: { id: nueva.id, nueva } });

    await this.inversiones.registrarOperacion(usuario, {
      cuentaId: id,
      clase,
      simbolo,
      nombre: entrada.nombre?.trim() ?? null,
      cantidad,
      monto: entrada.monto,
      fecha: entrada.fecha,
      precio: primerPrecio(entrada.monto, cantidad)!,
    });
    return this.detalle(usuario, id);
  }

  /** Cantidad, monto y fecha; la clase y el activo son fijos. El historial lo deja el trigger. */
  async editarOperacion(
    usuario: UsuarioAutenticado,
    id: string,
    operacionId: string,
    cuerpo: CuerpoCambioOperacion,
  ): Promise<InversionDetalleDto> {
    const [, fechaHoy] = await Promise.all([
      this.obtenerNoArchivada(usuario, id),
      this.hoy(usuario),
    ]);
    lanzar(validarCambioOperacion(cuerpo, fechaHoy));
    const actual = await this.obtenerOperacion(usuario, id, operacionId);
    const cambios = {
      ...(cuerpo.cantidad === undefined ? {} : { cantidad: parsearCantidad(cuerpo.cantidad)! }),
      ...(cuerpo.monto === undefined ? {} : { monto: cuerpo.monto }),
      ...(cuerpo.fecha === undefined ? {} : { fecha: cuerpo.fecha }),
    };
    const nueva = { ...actual, ...cambios };
    await this.lineaDeTiempo.validar(usuario, id, { operacion: { id: operacionId, nueva } });
    await this.inversiones.actualizarOperacion(usuario, actual, cambios);
    return this.detalle(usuario, id);
  }

  async eliminarOperacion(
    usuario: UsuarioAutenticado,
    id: string,
    operacionId: string,
  ): Promise<void> {
    await this.obtenerNoArchivada(usuario, id);
    await this.obtenerOperacion(usuario, id, operacionId);
    await this.lineaDeTiempo.validar(usuario, id, { operacion: { id: operacionId, nueva: null } });
    await this.inversiones.eliminarOperacion(usuario, id, operacionId);
  }

  /** Precio manual con la fecha de hoy. No borra el anterior (N-53). */
  async registrarPrecio(
    usuario: UsuarioAutenticado,
    id: string,
    activoId: string,
    precio: bigint,
  ): Promise<InversionDetalleDto> {
    lanzar(validarPrecio(precio));
    const [cuenta, fechaHoy] = await Promise.all([
      this.obtenerNoArchivada(usuario, id),
      this.hoy(usuario),
    ]);
    const activos = await this.inversiones.activos(usuario, [cuenta.id]);
    if (!activos.some((a) => a.id === activoId)) {
      throw new ErrorApi("ACTIVO_NO_ENCONTRADO", "simbolo");
    }
    await this.inversiones.insertarPrecio(usuario, activoId, precio, fechaHoy);
    return this.detalle(usuario, id);
  }

  /** Valoración a `fecha` con los movimientos ya filtrados a fecha ≤ F (RN-01). */
  private valorar(
    cuenta: CuentaInversion,
    datos: InversionPatrimonio | undefined,
    efectos: Parameters<typeof calcularSaldo>[1],
    fecha: string,
  ): InversionValorada {
    const saldoCuenta = calcularSaldo(
      { id: cuenta.id, tipo: TIPO_INVERSION, saldoInicial: cuenta.saldoInicial },
      efectos,
    );
    return valorarInversion({ saldoCuenta, ...(datos ?? SIN_DATOS) }, fecha);
  }

  private async hoy(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }

  /** Una cuenta ajena, inexistente o que no es inversión: INVERSION_NO_ENCONTRADA. */
  private async obtenerCuenta(usuario: UsuarioAutenticado, id: string): Promise<CuentaInversion> {
    const cuenta = await this.inversiones.obtenerCuenta(usuario, id);
    if (!cuenta) throw new ErrorApi("INVERSION_NO_ENCONTRADA");
    return cuenta;
  }

  private async obtenerNoArchivada(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<CuentaInversion> {
    const cuenta = await this.obtenerCuenta(usuario, id);
    if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA");
    return cuenta;
  }

  private async obtenerOperacion(usuario: UsuarioAutenticado, id: string, operacionId: string) {
    const operaciones = await this.inversiones.operaciones(usuario, [id]);
    const actual = operaciones.find((op) => op.id === operacionId);
    if (!actual) throw new ErrorApi("OPERACION_NO_ENCONTRADA");
    return actual;
  }
}
