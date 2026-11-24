import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import type { Cuenta, CuentaGuardada, ResumenCuentas } from "../domain/cuenta/cuenta.js";
import type { Naturaleza } from "../domain/cuenta/naturaleza.js";
import { agruparCuentas } from "../domain/cuenta/resumen.js";
import { calcularSaldo, conSaldos } from "../domain/cuenta/saldo.js";
import { puedeArchivar, validarAlta, validarEdicion } from "../domain/cuenta/validar.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { TIPO_INVERSION } from "../domain/inversion/inversion.js";
import { aCop, valorarInversion } from "../domain/inversion/valoracion.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { InversionPatrimonio } from "../domain/resumen/resumen.js";
import type { TrmResuelta } from "../domain/trm/trm.js";
import { LineaDeTiempoService } from "../inversiones/linea-de-tiempo.service.js";
import {
  CuentasRepository,
  type DatosAlta,
  type DatosEdicion,
} from "../repositories/supabase/cuentas.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PreciosService } from "../precios/precios.service.js";
import { TrmService } from "../trm/trm.service.js";
import { tieneDetalle } from "../domain/cuenta/cuenta.js";
import { validarCondiciones, type CondicionesEntrada } from "../domain/tarjeta/validar.js";

const SIN_TRM: TrmResuelta = { trm: null, desactualizada: false };
const SIN_DATOS: InversionPatrimonio = { activos: [], operaciones: [], precios: [] };

@Injectable()
export class CuentasService {
  constructor(
    private readonly cuentas: CuentasRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly inversiones: InversionesRepository,
    private readonly trm: TrmService,
    private readonly lineaDeTiempo: LineaDeTiempoService,
    private readonly precios: PreciosService,
  ) {}

  /**
   * Cuentas no archivadas agrupadas, con la fecha de hoy en la zona del perfil
   * y la TRM de hoy (N-74). Los préstamos no salen en los grupos, pero su
   * capital entra en el patrimonio (SPEC 08). Las inversiones van en activos a
   * valor de mercado en COP (SPEC 10).
   */
  async listar(
    usuario: UsuarioAutenticado,
  ): Promise<{ resumen: ResumenCuentas; fechaSaldos: string; trm: TrmResuelta }> {
    const fechaSaldos = await this.hoy(usuario);
    const [cuentas, prestamos, efectos, trm] = await Promise.all([
      this.cuentas.listar(usuario),
      this.cuentas.listarPrestamos(usuario),
      this.cuentas.efectos(usuario),
      this.trm.en(usuario.token, fechaSaldos),
    ]);
    const saldosPrestamos = prestamos.map((p) => ({
      tipo: p.tipo,
      saldo: calcularSaldo(p, efectos),
    }));
    const conValor = await this.aMercado(usuario, conSaldos(cuentas, efectos), trm, true);
    return { resumen: agruparCuentas(conValor, saldosPrestamos), fechaSaldos, trm };
  }

  async listarArchivadas(usuario: UsuarioAutenticado): Promise<Cuenta[]> {
    const [cuentas, efectos] = await Promise.all([
      this.cuentas.listarArchivadas(usuario),
      this.cuentas.efectos(usuario),
    ]);
    return this.aMercado(usuario, conSaldos(cuentas, efectos), undefined, true);
  }

  /** Una cuenta, también archivada (SPEC 14). */
  async obtener(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    return this.conSaldo(usuario, await this.obtenerExistente(usuario, id));
  }

  /**
   * Una tarjeta nace con sus condiciones: día de corte y día de pago
   * obligatorios (SPEC 14). Otra cuenta no las lleva.
   */
  async crear(
    usuario: UsuarioAutenticado,
    datos: DatosAlta,
    condiciones?: CondicionesEntrada,
  ): Promise<Cuenta> {
    const codigo = validarAlta(datos);
    if (codigo) throw new ErrorApi(codigo);
    if (datos.tipo !== "tarjeta_credito") {
      if (condiciones !== undefined) throw new ErrorApi("CONDICIONES_NO_PERMITIDAS");
      return this.conSaldo(usuario, await this.cuentas.crear(usuario, datos));
    }
    if (condiciones === undefined) throw new ErrorApi("CONDICIONES_REQUERIDAS");
    await this.validarCondiciones(usuario, condiciones, true);
    const creada = await this.cuentas.crearTarjeta(usuario, datos, {
      diaCorte: condiciones.diaCorte!,
      diaPago: condiciones.diaPago!,
      tasaMensualCpb: condiciones.tasaMensual ?? null,
      cuotaManejo: condiciones.cuotaManejo ?? null,
      cuentaPagoId: condiciones.cuentaPagoId ?? null,
    });
    return this.conSaldo(usuario, creada);
  }

  /**
   * Rangos y obligatoriedad (dominio) y cuenta de pago: efectivo o banco,
   * propia y activa. La base lo vuelve a comprobar (`validar_tarjeta`).
   */
  private async validarCondiciones(
    usuario: UsuarioAutenticado,
    condiciones: CondicionesEntrada,
    requiereDias: boolean,
  ): Promise<void> {
    const error = validarCondiciones(condiciones, requiereDias);
    if (error) throw new ErrorApi(error.codigo, error.campo);
    const pagoId = condiciones.cuentaPagoId;
    if (pagoId === undefined || pagoId === null) return;
    const pago = await this.cuentas.obtener(usuario, pagoId);
    if (!pago || !tieneDetalle(pago.tipo) || pago.archivadaEn !== null) {
      throw new ErrorApi("CUENTA_PAGO_INVALIDA");
    }
  }

  /**
   * Una inversión no cambia de tipo ni tiene cupo, y su saldo inicial no puede
   * dejar el efectivo negativo en ningún día (SPEC 10, N-65).
   */
  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    datos: DatosEdicion,
    condiciones?: CondicionesEntrada,
  ): Promise<Cuenta> {
    const actual = await this.obtenerNoArchivada(usuario, id);
    const codigo = validarEdicion(actual, datos);
    if (codigo) throw new ErrorApi(codigo);
    if (actual.tipo === TIPO_INVERSION && datos.saldoInicial !== undefined) {
      await this.lineaDeTiempo.validar(usuario, id, { saldoInicial: datos.saldoInicial });
    }
    if (condiciones !== undefined) {
      if (actual.tipo !== "tarjeta_credito") throw new ErrorApi("CONDICIONES_NO_PERMITIDAS");
      // La primera vez que una tarjeta recibe condiciones, los días son obligatorios.
      const requiereDias = !(await this.cuentas.tieneCondiciones(usuario, id));
      await this.validarCondiciones(usuario, condiciones, requiereDias);
      await this.cuentas.guardarCondiciones(usuario, id, condiciones);
    }
    const sinCambiosDeCuenta = Object.values(datos).every((v) => v === undefined);
    const guardada = sinCambiosDeCuenta
      ? await this.obtenerExistente(usuario, id)
      : await this.cuentas.actualizar(usuario, id, datos);
    return this.conSaldo(usuario, guardada);
  }

  /** Una cuenta con metas sin archivar no se elimina (SPEC 13, N-60). */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.sinMetas(usuario, id);
    return this.cuentas.eliminar(usuario, id);
  }

  reordenar(usuario: UsuarioAutenticado, naturaleza: Naturaleza, ids: string[]): Promise<void> {
    return this.cuentas.reordenar(usuario, naturaleza, ids);
  }

  /** CUENTA_CON_METAS si la cuenta tiene metas sin archivar (SPEC 13). */
  private async sinMetas(usuario: UsuarioAutenticado, id: string): Promise<void> {
    if (await this.cuentas.tieneMetasSinArchivar(usuario, id)) {
      throw new ErrorApi("CUENTA_CON_METAS");
    }
  }

  /**
   * Saldo cero; en una inversión, sin efectivo y sin posiciones abiertas
   * (SPEC 10); sin metas sin archivar (SPEC 13).
   */
  async archivar(usuario: UsuarioAutenticado, id: string): Promise<Cuenta> {
    const actual = await this.conSaldo(usuario, await this.obtenerNoArchivada(usuario, id));
    await this.sinMetas(usuario, id);
    const enCero =
      actual.inversion === null
        ? puedeArchivar(actual.saldo)
        : actual.inversion.efectivo === 0n && actual.inversion.valorMercado === 0n;
    if (!enCero || (actual.inversion !== null && (await this.tienePosiciones(usuario, id)))) {
      throw new ErrorApi("SALDO_NO_CERO");
    }
    return this.conSaldo(usuario, await this.cuentas.archivar(usuario, id));
  }

  async restaurar(usuario: UsuarioAutenticado, id: string, nombre?: string): Promise<Cuenta> {
    const actual = await this.obtenerExistente(usuario, id);
    if (actual.archivadaEn === null) throw new ErrorApi("CUENTA_NO_ARCHIVADA");
    return this.conSaldo(usuario, await this.cuentas.restaurar(usuario, id, nombre));
  }

  /** RN-01: el saldo se calcula con los movimientos que tocan la cuenta, nunca se guarda. */
  private async conSaldo(usuario: UsuarioAutenticado, cuenta: CuentaGuardada): Promise<Cuenta> {
    const efectos = await this.cuentas.efectos(usuario, cuenta.id);
    const [conValor] = await this.aMercado(usuario, conSaldos([cuenta], efectos));
    return conValor!;
  }

  /**
   * Las inversiones de `cuentas` pasan a valor de mercado (SPEC 10): `saldo`
   * en COP con la TRM de hoy (0 si es USD y no hay TRM) y el bloque
   * `inversion` en su moneda. Sin fecha: todos los movimientos y operaciones,
   * y el último precio (RN-01). Las demás cuentas no cambian. Sin `trm`, se
   * consulta solo si hay alguna inversión USD. Con `refrescar` (listas), antes
   * se traen los precios automáticos vencidos y se releen (SPEC 11).
   */
  private async aMercado(
    usuario: UsuarioAutenticado,
    cuentas: Cuenta[],
    trm?: TrmResuelta,
    refrescar = false,
  ): Promise<Cuenta[]> {
    const inversiones = cuentas.filter((c) => c.tipo === TIPO_INVERSION);
    if (inversiones.length === 0) return cuentas;
    const necesitaTrm = trm === undefined && inversiones.some((c) => c.moneda === "USD");
    const ids = inversiones.map((c) => c.id);
    const [leidos, trmResuelta] = await Promise.all([
      this.inversiones.datos(usuario, ids),
      necesitaTrm ? this.hoy(usuario).then((h) => this.trm.en(usuario.token, h)) : (trm ?? SIN_TRM),
    ]);
    let datos = leidos;
    if (refrescar) {
      const activos = [...leidos.values()].flatMap((d) => d.activos);
      if (await this.precios.refrescar(usuario, activos)) {
        datos = await this.inversiones.datos(usuario, ids);
      }
    }
    const trmCent = trmResuelta.trm?.valorCent ?? null;
    return cuentas.map((c) => {
      if (c.tipo !== TIPO_INVERSION) return c;
      // `c.saldo` es el efectivo de movimientos: saldo inicial + transferencias.
      const valorada = valorarInversion({
        saldoCuenta: c.saldo,
        ...(datos.get(c.id) ?? SIN_DATOS),
      });
      const tasa = c.moneda === "COP" ? null : trmCent;
      return {
        ...c,
        saldo: aCop(valorada.valorMercado, c.moneda, tasa) ?? 0n,
        inversion: {
          efectivo: valorada.efectivo,
          valorMercado: valorada.valorMercado,
          trmCent: tasa,
        },
      };
    });
  }

  private async tienePosiciones(usuario: UsuarioAutenticado, id: string): Promise<boolean> {
    const datos = (await this.inversiones.datos(usuario, [id])).get(id) ?? SIN_DATOS;
    return valorarInversion({ saldoCuenta: 0n, ...datos }).posiciones.length > 0;
  }

  private async hoy(usuario: UsuarioAutenticado): Promise<string> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    return fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);
  }

  /** Una cuenta ajena no es visible por RLS: se trata como inexistente. */
  private async obtenerExistente(usuario: UsuarioAutenticado, id: string): Promise<CuentaGuardada> {
    const cuenta = await this.cuentas.obtener(usuario, id);
    if (!cuenta) throw new ErrorApi("CUENTA_NO_ENCONTRADA");
    return cuenta;
  }

  private async obtenerNoArchivada(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<CuentaGuardada> {
    const cuenta = await this.obtenerExistente(usuario, id);
    if (cuenta.archivadaEn !== null) throw new ErrorApi("CUENTA_ARCHIVADA");
    return cuenta;
  }
}
