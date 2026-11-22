import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import type { Movimiento } from "../domain/movimiento/movimiento.js";
import { TIPO_INVERSION } from "../domain/inversion/inversion.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { consolidar, ordenarPrestamos, resumirPrestamo } from "../domain/prestamo/consolidado.js";
import {
  capitalPendiente,
  historial,
  porFecha,
  totales,
  ultimoAbono,
} from "../domain/prestamo/historial.js";
import { propuestaAbono } from "../domain/prestamo/intereses.js";
import {
  esTipoPrestamo,
  type InteresDePrestamo,
  type MovimientoDePrestamo,
  type Prestamo,
  type TipoPrestamo,
} from "../domain/prestamo/prestamo.js";
import { tasaACpb } from "../domain/prestamo/tasa.js";
import {
  validarAbono,
  validarAlta,
  validarCambio,
  validarCondonacion,
  validarDesembolso,
  type ErrorPrestamo,
} from "../domain/prestamo/validar.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PrestamosRepository } from "../repositories/supabase/prestamos.repository.js";
import {
  aPrestamoDetalleDto,
  aPrestamosDto,
  aPropuestaAbonoDto,
  type PrestamoDetalleDto,
  type PrestamosDto,
  type PropuestaAbonoDto,
} from "./dto.js";
import type {
  ConsultaPropuesta,
  CuerpoAbono,
  CuerpoCambio,
  CuerpoCondonacion,
  CuerpoDesembolso,
  CuerpoPrestamo,
} from "./esquemas.js";

/** Nombre de la categoría sembrada para los intereses (SPEC 08). */
const CATEGORIA_INTERESES = "Intereses";

/**
 * Descripciones de los movimientos (SPEC 08). El nombre va recortado. La
 * condonación solo existe en un otorgado: «Condonación a <nombre>».
 */
const DESCRIPCIONES: Record<TipoPrestamo, { desembolso: string; abono: string; interes: string }> =
  {
    prestamo_otorgado: { desembolso: "Préstamo a", abono: "Abono de", interes: "Intereses de" },
    deuda_contraida: { desembolso: "Préstamo de", abono: "Abono a", interes: "Intereses a" },
  };

function descripcion(
  prestamo: Pick<Prestamo, "tipo" | "nombre">,
  clase: keyof (typeof DESCRIPCIONES)[TipoPrestamo],
): string {
  return `${DESCRIPCIONES[prestamo.tipo][clase]} ${prestamo.nombre.trim()}`;
}

function lanzar(error: ErrorPrestamo | null): void {
  if (error) throw new ErrorApi(error.codigo, error.campo);
}

/** Préstamo con sus movimientos de capital e intereses, leído en fresco. */
type Lectura = {
  prestamo: Prestamo;
  movimientos: MovimientoDePrestamo[];
  intereses: InteresDePrestamo[];
};

@Injectable()
export class PrestamosService {
  constructor(
    private readonly prestamos: PrestamosRepository,
    private readonly movimientos: MovimientosRepository,
    private readonly categorias: CategoriasRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Consolidado y lista, saldados incluidos, en el orden del dominio. */
  async listar(usuario: UsuarioAutenticado): Promise<PrestamosDto> {
    const [prestamos, hoy] = await Promise.all([this.prestamos.listar(usuario), this.hoy(usuario)]);
    const ids = prestamos.map((p) => p.id);
    const [movimientos, intereses] = await Promise.all([
      this.prestamos.movimientos(usuario, ids),
      this.prestamos.intereses(usuario, ids),
    ]);
    const resumenes = prestamos.map((p) =>
      resumirPrestamo(
        p,
        movimientos.filter((m) => m.cuentaOrigenId === p.id || m.cuentaDestinoId === p.id),
        intereses.filter((i) => i.prestamoId === p.id),
        hoy,
      ),
    );
    return aPrestamosDto(hoy, consolidar(resumenes), ordenarPrestamos(resumenes));
  }

  async detalle(usuario: UsuarioAutenticado, id: string): Promise<PrestamoDetalleDto> {
    const [lectura, hoy] = await Promise.all([this.leer(usuario, id), this.hoy(usuario)]);
    return this.aDetalle(lectura, hoy);
  }

  /** Préstamo nuevo con su primer desembolso, en una sola transacción. */
  async crear(usuario: UsuarioAutenticado, cuerpo: CuerpoPrestamo): Promise<PrestamoDetalleDto> {
    const hoy = await this.hoy(usuario);
    const entrada = {
      tipo: cuerpo.tipo,
      nombre: cuerpo.nombre,
      monto: cuerpo.monto,
      fecha: cuerpo.fecha ?? hoy,
      tasaMensual: cuerpo.tasaMensual ?? "0",
      fechaAcordada: cuerpo.fechaAcordada,
    };
    lanzar(validarAlta(entrada));
    if (!esTipoPrestamo(entrada.tipo)) throw new ErrorApi("TIPO_INVALIDO", "tipo");
    await this.rechazarCuentaDeInversion(usuario, cuerpo.cuentaId);
    const nombre = entrada.nombre.trim();
    const id = await this.prestamos.crear(usuario, {
      tipo: entrada.tipo,
      nombre,
      tasaCpb: tasaACpb(entrada.tasaMensual)!,
      fechaAcordada: entrada.fechaAcordada,
      monto: entrada.monto,
      fecha: entrada.fecha,
      cuentaId: cuerpo.cuentaId,
      descripcion: descripcion({ tipo: entrada.tipo, nombre }, "desembolso"),
    });
    return this.detalle(usuario, id);
  }

  /** Suma al préstamo existente; si estaba saldado, lo reabre. */
  async desembolsar(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoDesembolso,
  ): Promise<PrestamoDetalleDto> {
    const [prestamo, hoy] = await Promise.all([this.obtener(usuario, id), this.hoy(usuario)]);
    const fecha = cuerpo.fecha ?? hoy;
    lanzar(validarDesembolso({ monto: cuerpo.monto, fecha }));
    await this.rechazarCuentaDePrestamo(usuario, cuerpo.cuentaId);
    await this.rechazarCuentaDeInversion(usuario, cuerpo.cuentaId);
    await this.prestamos.desembolsar(usuario, prestamo, {
      monto: cuerpo.monto,
      fecha,
      cuentaId: cuerpo.cuentaId,
      descripcion: descripcion(prestamo, "desembolso"),
    });
    return this.detalle(usuario, id);
  }

  /** Nombre y fecha acordada. El historial lo dejan los triggers (RN-13). */
  async cambiar(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoCambio,
  ): Promise<PrestamoDetalleDto> {
    await this.obtener(usuario, id);
    lanzar(validarCambio(cuerpo));
    if (cuerpo.nombre !== undefined) {
      await this.prestamos.cambiarNombre(usuario, id, cuerpo.nombre.trim());
    }
    if (cuerpo.fechaAcordada !== undefined) {
      await this.prestamos.cambiarFechaAcordada(usuario, id, cuerpo.fechaAcordada);
    }
    return this.detalle(usuario, id);
  }

  /** Reparte el monto entre los causados a la fecha y el capital. */
  async propuesta(
    usuario: UsuarioAutenticado,
    id: string,
    consulta: ConsultaPropuesta,
  ): Promise<PropuestaAbonoDto> {
    const { prestamo, movimientos, intereses } = await this.leer(usuario, id);
    const propuesta = propuestaAbono(
      prestamo,
      movimientos,
      intereses,
      consulta.fecha,
      consulta.monto,
    );
    if ("error" in propuesta) throw new ErrorApi(propuesta.error);
    return aPropuestaAbonoDto(consulta.fecha, consulta.monto, propuesta);
  }

  /**
   * Capital e interés en una transacción. Se valida contra una lectura fresca
   * del préstamo (N-74). Sin `categoriaInteresId`, «Intereses» del tipo.
   */
  async abonar(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoAbono,
  ): Promise<PrestamoDetalleDto> {
    const { prestamo, movimientos } = await this.leer(usuario, id);
    const primero = movimientos.toSorted(porFecha)[0];
    lanzar(
      validarAbono(
        { capital: cuerpo.capital, interes: cuerpo.interes, fecha: cuerpo.fecha },
        {
          capitalPendiente: capitalPendiente(prestamo, movimientos),
          primeraFecha: primero?.fecha ?? null,
        },
      ),
    );
    await this.rechazarCuentaDeInversion(usuario, cuerpo.cuentaId);
    const categoriaInteresId =
      cuerpo.interes === 0n
        ? null
        : cuerpo.categoriaInteresId === undefined
          ? await this.categoriaIntereses(usuario, prestamo.tipo)
          : cuerpo.categoriaInteresId;
    await this.prestamos.abonar(usuario, id, {
      cuentaId: cuerpo.cuentaId,
      fecha: cuerpo.fecha,
      capital: cuerpo.capital === 0n ? null : cuerpo.capital,
      interes: cuerpo.interes === 0n ? null : cuerpo.interes,
      categoriaInteresId,
      descripcionCapital: descripcion(prestamo, "abono"),
      descripcionInteres: descripcion(prestamo, "interes"),
    });
    return this.detalle(usuario, id);
  }

  /** Gasto de hoy con origen el préstamo (RN-17). Devuelve el movimiento creado. */
  async condonar(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoCondonacion,
  ): Promise<Movimiento> {
    const [{ prestamo, movimientos }, hoy] = await Promise.all([
      this.leer(usuario, id),
      this.hoy(usuario),
    ]);
    lanzar(
      validarCondonacion(prestamo.tipo, capitalPendiente(prestamo, movimientos), cuerpo.monto),
    );
    const movimientoId = await this.prestamos.condonar(usuario, id, {
      monto: cuerpo.monto,
      fecha: hoy,
      categoriaId: cuerpo.categoriaId,
      descripcion: `Condonación a ${prestamo.nombre.trim()}`,
    });
    const movimiento = await this.movimientos.obtener(usuario, movimientoId);
    if (!movimiento) throw new ErrorApi("MOVIMIENTO_NO_ENCONTRADO");
    return movimiento;
  }

  private aDetalle(lectura: Lectura, hoy: string): PrestamoDetalleDto {
    const { prestamo, movimientos, intereses } = lectura;
    return aPrestamoDetalleDto({
      fechaHoy: hoy,
      resumen: resumirPrestamo(prestamo, movimientos, intereses, hoy),
      totales: totales(prestamo, movimientos, intereses),
      ultimoAbono: ultimoAbono(prestamo, movimientos, intereses),
      historial: historial(prestamo, movimientos, intereses),
      creadoEn: prestamo.creadoEn,
    });
  }

  /** Un préstamo ajeno no es visible por RLS: se trata como inexistente. */
  private async obtener(usuario: UsuarioAutenticado, id: string): Promise<Prestamo> {
    const prestamo = await this.prestamos.obtener(usuario, id);
    if (!prestamo) throw new ErrorApi("PRESTAMO_NO_ENCONTRADO");
    return prestamo;
  }

  private async leer(usuario: UsuarioAutenticado, id: string): Promise<Lectura> {
    const [prestamo, movimientos, intereses] = await Promise.all([
      this.obtener(usuario, id),
      this.prestamos.movimientos(usuario, [id]),
      this.prestamos.intereses(usuario, [id]),
    ]);
    return { prestamo, movimientos, intereses };
  }

  /**
   * La cuenta propia de un desembolso no puede ser otro préstamo. Si no existe
   * o es ajena, la FK compuesta la rechaza al escribir (CUENTA_INVALIDA).
   */
  private async rechazarCuentaDePrestamo(usuario: UsuarioAutenticado, cuentaId: string) {
    const tipos = await this.movimientos.tiposDeCuenta(usuario, [cuentaId]);
    const tipo = tipos.get(cuentaId);
    if (tipo !== undefined && esTipoPrestamo(tipo)) {
      throw new ErrorApi("CUENTA_DE_PRESTAMO", "cuentaId");
    }
  }

  /** La cuenta propia de un préstamo no puede ser una inversión (SPEC 10). */
  private async rechazarCuentaDeInversion(usuario: UsuarioAutenticado, cuentaId: string) {
    const tipos = await this.movimientos.tiposDeCuenta(usuario, [cuentaId]);
    if (tipos.get(cuentaId) === TIPO_INVERSION) {
      throw new ErrorApi("CUENTA_DE_INVERSION", "cuentaId");
    }
  }

  /** «Intereses» de ingreso (otorgado) o de gasto (contraída); null si ya no existe. */
  private async categoriaIntereses(
    usuario: UsuarioAutenticado,
    tipo: TipoPrestamo,
  ): Promise<string | null> {
    const tipoCategoria = tipo === "prestamo_otorgado" ? "ingreso" : "gasto";
    const categorias = await this.categorias.listar(usuario.token);
    return (
      categorias.find((k) => k.tipo === tipoCategoria && k.nombre === CATEGORIA_INTERESES)?.id ??
      null
    );
  }

  private async hoy(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }
}
