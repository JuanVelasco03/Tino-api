import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { mesLocal, rangoDelMes } from "../domain/fecha/mes.js";
import {
  inversionesTocadas,
  validarMovimientoConInversion,
  type EfectoEnLinea,
  type ErrorInversion,
} from "../domain/inversion/validar.js";
import type { Movimiento, MovimientoEntrada } from "../domain/movimiento/movimiento.js";
import { TASA_UNITARIA, tasaDeTransferencia } from "../domain/movimiento/tasa.js";
import { validarMovimiento } from "../domain/movimiento/validar.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { esTipoPrestamo, type TipoPrestamo } from "../domain/prestamo/prestamo.js";
import {
  validarCambioMovimiento,
  validarCapitalTrasCambio,
  validarSinCuentaDePrestamo,
  type CuentasDeMovimiento,
  type ErrorPrestamo,
} from "../domain/prestamo/validar.js";
import { LineaDeTiempoService } from "../inversiones/linea-de-tiempo.service.js";
import {
  MovimientosRepository,
  type DatosCuenta,
} from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

function lanzar(error: ErrorPrestamo | ErrorInversion | null): void {
  if (error) throw new ErrorApi(error.codigo, error.campo);
}

function tiposDe(cuentas: ReadonlyMap<string, DatosCuenta>): Map<string, string> {
  return new Map([...cuentas].map(([id, c]) => [id, c.tipo]));
}

function esPrestamo(tipos: ReadonlyMap<string, string>, cuentaId: string): boolean {
  const tipo = tipos.get(cuentaId);
  return tipo !== undefined && esTipoPrestamo(tipo);
}

function cuentasDe(m: Movimiento): CuentasDeMovimiento {
  return {
    tipo: m.tipo,
    cuentaOrigenId: m.cuentaOrigen?.id ?? null,
    cuentaDestinoId: m.cuentaDestino?.id ?? null,
  };
}

/** Id provisional del movimiento que se crea, para simular la línea de tiempo. */
const NUEVO = "nuevo";

@Injectable()
export class MovimientosService {
  constructor(
    private readonly movimientos: MovimientosRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly lineaDeTiempo: LineaDeTiempoService,
  ) {}

  /** Movimientos de un mes; sin mes, el actual en la zona del perfil. */
  async listar(
    usuario: UsuarioAutenticado,
    mes: string | undefined,
  ): Promise<{ mes: string; movimientos: Movimiento[] }> {
    const mesConsultado = mes ?? (await this.mesActual(usuario));
    const { desde, hasta } = rangoDelMes(mesConsultado);
    const movimientos = await this.movimientos.listarEntre(usuario, desde, hasta);
    return { mes: mesConsultado, movimientos };
  }

  /**
   * El dominio valida la forma; la función de Postgres es la garantía final.
   * Un movimiento de préstamo nace en Deudas, nunca aquí (SPEC 08). Una
   * inversión solo admite transferencias, con `montoDestino` entre monedas, y
   * su efectivo no queda negativo ningún día (SPEC 10).
   */
  async crear(usuario: UsuarioAutenticado, entrada: MovimientoEntrada): Promise<Movimiento> {
    this.validar(entrada);
    const cuentas = await this.movimientos.datosDeCuenta(usuario, [
      entrada.cuentaOrigenId,
      entrada.cuentaDestinoId,
    ]);
    const tipos = tiposDe(cuentas);
    lanzar(validarSinCuentaDePrestamo(entrada, (cuentaId) => esPrestamo(tipos, cuentaId)));
    lanzar(validarMovimientoConInversion(entrada, cuentas));
    await this.comprobarInversiones(usuario, NUEVO, entrada, cuentas, []);
    const id = await this.movimientos.registrar(usuario, entrada, this.tasa(entrada, cuentas));
    return this.obtenerExistente(usuario, id);
  }

  /**
   * Un movimiento de préstamo se edita sin cambiar de tipo ni de préstamo, y
   * sin dejar el capital negativo (SPEC 08). Ni la inversión que tocaba ni la
   * que toca quedan con efectivo negativo (SPEC 10). La transferencia de un
   * aporte a una meta no cambia de tipo (SPEC 13). Un ajuste tampoco, y ningún
   * movimiento pasa a ser ajuste (SPEC 14).
   */
  async reemplazar(
    usuario: UsuarioAutenticado,
    id: string,
    entrada: MovimientoEntrada,
  ): Promise<Movimiento> {
    this.validar(entrada);
    const actual = await this.obtenerExistente(usuario, id);
    const anterior = cuentasDe(actual);
    const [cuentas, esInteres, esAporte] = await Promise.all([
      this.movimientos.datosDeCuenta(usuario, [
        anterior.cuentaOrigenId,
        anterior.cuentaDestinoId,
        entrada.cuentaOrigenId,
        entrada.cuentaDestinoId,
      ]),
      this.movimientos.esInteresDePrestamo(usuario, id),
      this.movimientos.esAporteDeMeta(usuario, id),
    ]);
    // La transferencia de un aporte sigue siendo transferencia (SPEC 13).
    if (esAporte && entrada.tipo !== "transferencia") {
      throw new ErrorApi("MOVIMIENTO_DE_META", "tipo");
    }
    // Un ajuste sigue siendo ajuste y nada se vuelve ajuste (SPEC 14). Lleva
    // la categoría reservada: la pone la API.
    if ((actual.tipo === "ajuste") !== (entrada.tipo === "ajuste")) {
      throw new ErrorApi("MOVIMIENTO_DE_AJUSTE", "tipo");
    }
    if (entrada.tipo === "ajuste") {
      entrada = { ...entrada, categoriaId: await this.movimientos.categoriaDeAjuste(usuario) };
    }
    const tipos = tiposDe(cuentas);
    lanzar(
      validarCambioMovimiento(anterior, entrada, {
        esPrestamo: (cuentaId) => esPrestamo(tipos, cuentaId),
        esInteres,
      }),
    );
    lanzar(validarMovimientoConInversion(entrada, cuentas));
    await this.comprobarCapital(usuario, id, tipos, entrada);
    await this.comprobarInversiones(usuario, id, entrada, cuentas, [
      anterior.cuentaOrigenId,
      anterior.cuentaDestinoId,
    ]);
    await this.movimientos.reemplazar(usuario, id, entrada, this.tasa(entrada, cuentas));
    return this.obtenerExistente(usuario, id);
  }

  /**
   * Borrar un movimiento de préstamo no puede dejar el capital negativo
   * (SPEC 08), ni uno de inversión el efectivo (SPEC 10).
   */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const actual = await this.movimientos.obtener(usuario, id);
    if (actual) {
      const anterior = cuentasDe(actual);
      const ids = [anterior.cuentaOrigenId, anterior.cuentaDestinoId];
      const cuentas = await this.movimientos.datosDeCuenta(usuario, ids);
      await this.comprobarCapital(usuario, id, tiposDe(cuentas), null);
      await this.comprobarInversiones(usuario, id, null, cuentas, ids);
    }
    return this.movimientos.eliminar(usuario, id);
  }

  private validar(entrada: MovimientoEntrada): void {
    const error = validarMovimiento(entrada);
    if (error) throw new ErrorApi(error.codigo, error.campo);
  }

  /** La implícita entre monedas (RN-04, congelada en el movimiento), o "1". */
  private tasa(entrada: MovimientoEntrada, cuentas: ReadonlyMap<string, DatosCuenta>): string {
    const origen =
      entrada.cuentaOrigenId === null ? undefined : cuentas.get(entrada.cuentaOrigenId);
    if (entrada.tipo !== "transferencia" || origen === undefined) return TASA_UNITARIA;
    return tasaDeTransferencia(entrada.monto, entrada.montoDestino, origen.moneda);
  }

  /**
   * Con el movimiento `id` reemplazado por `nuevo` (o borrado), ningún préstamo
   * de `tipos` queda con capital final negativo.
   */
  private async comprobarCapital(
    usuario: UsuarioAutenticado,
    id: string,
    tipos: ReadonlyMap<string, string>,
    nuevo: MovimientoEntrada | null,
  ): Promise<void> {
    const prestamos = [...tipos].flatMap(([cuentaId, tipo]) =>
      esTipoPrestamo(tipo) ? [{ id: cuentaId, tipo: tipo satisfies TipoPrestamo }] : [],
    );
    if (prestamos.length === 0) return;
    const efectos = await this.movimientos.efectosDe(
      usuario,
      prestamos.map((p) => p.id),
    );
    lanzar(validarCapitalTrasCambio(prestamos, efectos, id, nuevo));
  }

  /**
   * Con el movimiento `id` reemplazado por `nuevo` (o borrado), ninguna
   * inversión que toca, o que tocaba (`anteriores`), queda con efectivo
   * negativo en algún día (N-65). Lectura fresca por cada inversión.
   */
  private async comprobarInversiones(
    usuario: UsuarioAutenticado,
    id: string,
    nuevo: MovimientoEntrada | null,
    cuentas: ReadonlyMap<string, DatosCuenta>,
    anteriores: readonly (string | null)[],
  ): Promise<void> {
    const ids = [...anteriores, nuevo?.cuentaOrigenId ?? null, nuevo?.cuentaDestinoId ?? null];
    const inversiones = inversionesTocadas(ids, cuentas);
    if (inversiones.length === 0) return;
    const efecto: EfectoEnLinea | null =
      nuevo === null
        ? null
        : {
            id,
            fecha: nuevo.fecha ?? (await this.hoy(usuario)),
            monto: nuevo.monto,
            montoDestino: nuevo.montoDestino,
            cuentaOrigenId: nuevo.cuentaOrigenId,
            cuentaDestinoId: nuevo.cuentaDestinoId,
          };
    for (const cuentaId of inversiones) {
      await this.lineaDeTiempo.validar(usuario, cuentaId, { movimiento: { id, nuevo: efecto } });
    }
  }

  private async zona(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO;
  }

  private async hoy(usuario: UsuarioAutenticado): Promise<string> {
    return fechaLocal(new Date(), await this.zona(usuario));
  }

  private async mesActual(usuario: UsuarioAutenticado): Promise<string> {
    return mesLocal(new Date(), await this.zona(usuario));
  }

  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<Movimiento> {
    const movimiento = await this.movimientos.obtener(usuario, id);
    if (!movimiento) throw new ErrorApi("MOVIMIENTO_NO_ENCONTRADO");
    return movimiento;
  }
}
