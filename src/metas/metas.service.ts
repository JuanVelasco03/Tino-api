import { Injectable, Logger } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { calcularSaldo } from "../domain/cuenta/saldo.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { TIPO_INVERSION } from "../domain/inversion/inversion.js";
import { aCop, valorarInversion } from "../domain/inversion/valoracion.js";
import { notaApartados, saldoLibre, type ApartadoDeMeta } from "../domain/meta/apartados.js";
import {
  acumuladoA,
  cuentaConSaldo,
  cumplimientoApartado,
  cumplimientoPorSaldo,
  debeGuardarCumplimiento,
  falta,
  saldoEn,
  totales,
  usoDeCumplida,
  type EfectoConFecha,
} from "../domain/meta/avance.js";
import { fechasDeCierre, historialAportes, historialValor } from "../domain/meta/historial.js";
import {
  DESCRIPCION_MAXIMA,
  type Aporte,
  type AporteEnLinea,
  type CuentaDeMeta,
  type Meta,
  type ModoMeta,
} from "../domain/meta/meta.js";
import { ordenarActivas, ordenarArchivadas, ordenarCumplidas } from "../domain/meta/orden.js";
import { calcularRitmo, inicioDeVentana } from "../domain/meta/ritmo.js";
import {
  parsearFechaMeta,
  validarAcumulado,
  validarAlta,
  validarAporte,
  validarArchivar,
  validarCambioDeModo,
  validarCuenta,
  validarCuentaOrigen,
  validarEditable,
  validarEdicion,
  validarMonto,
  validarOrigenFijo,
  validarRestaurar,
  validarSaldoLibre,
  type ErrorMeta,
} from "../domain/meta/validar.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import type { InversionPatrimonio } from "../domain/resumen/resumen.js";
import type { Trm } from "../domain/trm/trm.js";
import { LineaDeTiempoService } from "../inversiones/linea-de-tiempo.service.js";
import { PreciosService } from "../precios/precios.service.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { MetasRepository, type CambiosMeta } from "../repositories/supabase/metas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { aTrmDto } from "../trm/dto.js";
import { TrmService } from "../trm/trm.service.js";
import {
  aApartadosDto,
  aFilaAporteDto,
  aFilaValorDto,
  aMetaDto,
  type MetaDetalleDto,
  type MetaDto,
  type MetaEvaluada,
  type MetasDto,
} from "./dto.js";
import type { CuerpoAporte, CuerpoCambioAporte, CuerpoCambioMeta, CuerpoMeta } from "./esquemas.js";

function lanzar(error: ErrorMeta | null): void {
  if (error) throw new ErrorApi(error.codigo, error.campo);
}

const SIN_DATOS: InversionPatrimonio = { activos: [], operaciones: [], precios: [] };

/** «Aporte a <nombre de la meta>», recortada a 80 caracteres. */
export function descripcionDeAporte(nombre: string): string {
  return `Aporte a ${nombre.trim()}`.slice(0, DESCRIPCION_MAXIMA).trimEnd();
}

/** Id provisional de la transferencia que se crea, para simular la línea de tiempo. */
const NUEVA = "nueva";

/** Todo lo que pide el dominio para evaluar las metas del usuario. */
type Contexto = {
  hoy: string;
  zona: string;
  metas: Meta[];
  cuentas: Map<string, CuentaDeMeta>;
  efectos: EfectoConFecha[];
  aportes: Aporte[];
  inversiones: Map<string, InversionPatrimonio>;
  /** TRM por fecha (hoy siempre, si hizo falta). */
  trm: Map<string, Trm | null>;
};

type OpcionesCarga = {
  /** Refresca los precios automáticos vencidos (lecturas, SPEC 11). */
  refrescar: boolean;
  /** Meta del detalle: completa los cierres de su historial y su TRM. */
  detalleDe?: string;
};

@Injectable()
export class MetasService {
  private readonly logger = new Logger(MetasService.name);

  constructor(
    private readonly metas: MetasRepository,
    private readonly cuentas: CuentasRepository,
    private readonly inversiones: InversionesRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly trm: TrmService,
    private readonly precios: PreciosService,
    private readonly lineaDeTiempo: LineaDeTiempoService,
  ) {}

  // -------------------------------------------------------------------------
  // Lecturas
  // -------------------------------------------------------------------------

  /** Metas no archivadas en activas y cumplidas, con totales y la TRM de hoy. */
  async listar(usuario: UsuarioAutenticado): Promise<MetasDto> {
    const ctx = await this.cargar(usuario, { refrescar: true });
    const evaluadas = await this.evaluarGuardando(
      usuario,
      ctx,
      ctx.metas.filter((m) => m.archivadaEn === null),
    );
    const activas = evaluadas.filter((e) => e.cumplida === null);
    const cumplidas = evaluadas.filter((e) => e.cumplida !== null);
    const suma = totales(activas.map((e) => ({ avance: e.avance, objetivo: e.meta.objetivo })));
    const trmHoy = ctx.trm.get(ctx.hoy) ?? null;
    return {
      fechaHoy: ctx.hoy,
      trm: trmHoy === null ? null : aTrmDto(trmHoy),
      totales: {
        avance: suma.avance.toString(),
        objetivo: suma.objetivo.toString(),
        incompleto: suma.incompleto,
      },
      activas: ordenarActivas(activas.map(ordenable)).map((o) => aMetaDto(o.evaluada)),
      cumplidas: ordenarCumplidas(cumplidas.map(ordenable)).map((o) => aMetaDto(o.evaluada)),
    };
  }

  async listarArchivadas(usuario: UsuarioAutenticado): Promise<MetaDto[]> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const evaluadas = ctx.metas
      .filter((m) => m.archivadaEn !== null)
      .map((m) => this.evaluar(ctx, m));
    return ordenarArchivadas(evaluadas.map(ordenable)).map((o) => aMetaDto(o.evaluada));
  }

  /** Detalle con historial y notas; también de una archivada. */
  async detalle(usuario: UsuarioAutenticado, id: string): Promise<MetaDetalleDto> {
    const ctx = await this.cargar(usuario, { refrescar: true, detalleDe: id });
    const meta = ctx.metas.find((m) => m.id === id);
    if (!meta) throw new ErrorApi("META_NO_ENCONTRADA");
    const [e] = await this.evaluarGuardando(usuario, ctx, [meta]);
    return this.aDetalle(ctx, e!);
  }

  // -------------------------------------------------------------------------
  // Escrituras de la meta
  // -------------------------------------------------------------------------

  async crear(usuario: UsuarioAutenticado, cuerpo: CuerpoMeta): Promise<MetaDetalleDto> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    lanzar(
      validarAlta(
        {
          nombre: cuerpo.nombre,
          modo: cuerpo.modo,
          objetivo: cuerpo.objetivo,
          fechaMeta: cuerpo.fechaMeta,
          conAporteInicial: cuerpo.aporteInicial !== null,
        },
        ctx.hoy,
      ),
    );
    const modo = cuerpo.modo as ModoMeta;
    const cuenta = await this.cuentaVisible(usuario, ctx, cuerpo.cuentaId);
    lanzar(validarCuenta(modo, cuenta));

    const inicial = cuerpo.aporteInicial;
    if (inicial !== null) {
      lanzar(validarMonto(inicial.monto, "aporteInicial.monto"));
      if (inicial.cuentaOrigenId === null) {
        const libre = this.saldoLibreDe(ctx, cuerpo.cuentaId, null);
        lanzar(validarSaldoLibre(inicial.monto, libre));
      } else {
        await this.validarOrigen(usuario, ctx, inicial.cuentaOrigenId, cuerpo.cuentaId, {
          id: NUEVA,
          monto: inicial.monto,
          fecha: ctx.hoy,
        });
      }
    }

    const nombre = cuerpo.nombre.trim();
    const id = await this.metas.crear(usuario, {
      nombre,
      cuentaId: cuerpo.cuentaId,
      modo,
      objetivo: cuerpo.objetivo,
      fechaMeta: cuerpo.fechaMeta === null ? null : parsearFechaMeta(cuerpo.fechaMeta),
      aporteInicial:
        inicial === null
          ? null
          : {
              monto: inicial.monto,
              fecha: ctx.hoy,
              cuentaOrigenId: inicial.cuentaOrigenId,
              descripcion: descripcionDeAporte(nombre),
            },
    });
    return this.detalle(usuario, id);
  }

  /**
   * Nombre, objetivo, fecha, cuenta y modo. Cambiar de cuenta con apartado
   * vigente exige que quepa en el saldo libre de la nueva; el modo solo cambia
   * sin aportes.
   */
  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoCambioMeta,
  ): Promise<MetaDetalleDto> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const e = this.evaluar(ctx, this.metaDe(ctx, id));
    lanzar(
      validarEditable({ archivada: e.meta.archivadaEn !== null, cumplida: e.cumplida !== null }),
    );
    lanzar(validarEdicion(cuerpo, ctx.hoy));

    const modo = (cuerpo.modo ?? e.meta.modo) as ModoMeta;
    lanzar(validarCambioDeModo(e.meta.modo, modo, e.aportes.length));

    const cuentaId = cuerpo.cuentaId ?? e.meta.cuentaId;
    if (cuentaId !== e.meta.cuentaId || modo !== e.meta.modo) {
      const cuenta = await this.cuentaVisible(usuario, ctx, cuentaId);
      lanzar(validarCuenta(modo, cuenta));
    }
    if (cuentaId !== e.meta.cuentaId && modo === "apartado") {
      const apartado = acumuladoA(e.aportes);
      if (apartado > 0n) {
        lanzar(validarSaldoLibre(apartado, this.saldoLibreDe(ctx, cuentaId, e.meta.id)));
      }
    }

    const cambios: CambiosMeta = {
      ...(cuerpo.nombre === undefined ? {} : { nombre: cuerpo.nombre.trim() }),
      ...(cuerpo.cuentaId === undefined ? {} : { cuentaId: cuerpo.cuentaId }),
      ...(cuerpo.modo === undefined ? {} : { modo }),
      ...(cuerpo.objetivo === undefined ? {} : { objetivo: cuerpo.objetivo }),
      ...(cuerpo.fechaMeta === undefined
        ? {}
        : { fechaMeta: cuerpo.fechaMeta === null ? null : parsearFechaMeta(cuerpo.fechaMeta) }),
    };
    await this.metas.actualizar(usuario, e.meta, cambios);
    return this.detalle(usuario, id);
  }

  /** Borra la meta y sus aportes; las transferencias siguen en movimientos. */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.metas.eliminar(usuario, id);
  }

  /** Solo una cumplida y, en `apartado`, con apartado vigente 0. */
  async archivar(usuario: UsuarioAutenticado, id: string): Promise<MetaDto> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const e = this.evaluar(ctx, this.metaDe(ctx, id));
    lanzar(
      validarArchivar({
        archivada: e.meta.archivadaEn !== null,
        cumplida: e.cumplida !== null,
        modo: e.meta.modo,
        apartado: acumuladoA(e.aportes),
      }),
    );
    await this.metas.archivar(usuario, id);
    const despues = await this.cargar(usuario, { refrescar: false });
    return aMetaDto(this.evaluar(despues, this.metaDe(despues, id)));
  }

  /** Los triggers validan la cuenta archivada y la exclusividad. */
  async restaurar(usuario: UsuarioAutenticado, id: string): Promise<MetaDetalleDto> {
    const meta = await this.metas.obtener(usuario, id);
    if (!meta) throw new ErrorApi("META_NO_ENCONTRADA");
    lanzar(validarRestaurar(meta.archivadaEn !== null));
    await this.metas.restaurar(usuario, id);
    return this.detalle(usuario, id);
  }

  // -------------------------------------------------------------------------
  // Aportes y retiros
  // -------------------------------------------------------------------------

  /**
   * Apartado: un aporte sin origen marca dinero que ya está en la cuenta (no
   * supera el saldo libre); con origen, además la transferencia real (RN-16).
   * Un retiro libera lo apartado. Modo `cuenta`: una transferencia común.
   */
  async registrarAporte(
    usuario: UsuarioAutenticado,
    id: string,
    cuerpo: CuerpoAporte,
  ): Promise<MetaDetalleDto> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const e = this.evaluar(ctx, this.metaDe(ctx, id));
    lanzar(validarAporte(cuerpo, this.paraAporte(e), ctx.hoy));
    const descripcion = descripcionDeAporte(e.meta.nombre);

    if (cuerpo.cuentaOrigenId !== null) {
      await this.validarOrigen(usuario, ctx, cuerpo.cuentaOrigenId, e.cuenta.id, {
        id: NUEVA,
        monto: cuerpo.monto,
        fecha: cuerpo.fecha,
      });
    }

    if (e.meta.modo === "cuenta") {
      await this.metas.registrarTransferencia(usuario, {
        monto: cuerpo.monto,
        fecha: cuerpo.fecha,
        cuentaOrigenId: cuerpo.cuentaOrigenId!,
        cuentaDestinoId: e.cuenta.id,
        descripcion,
      });
      return this.detalle(usuario, id);
    }

    if (cuerpo.tipo === "aporte" && cuerpo.cuentaOrigenId === null) {
      lanzar(validarSaldoLibre(cuerpo.monto, this.saldoLibreDe(ctx, e.cuenta.id, null)));
    }
    const nueva: AporteEnLinea = {
      tipo: cuerpo.tipo,
      monto: cuerpo.monto,
      fecha: cuerpo.fecha,
      creadoEn: new Date(),
    };
    lanzar(validarAcumulado([...e.aportes, nueva]));

    await this.metas.registrarAporte(usuario, id, {
      tipo: cuerpo.tipo,
      monto: cuerpo.monto,
      fecha: cuerpo.fecha,
      motivo: cuerpo.motivo?.trim() ?? null,
      cuentaOrigenId: cuerpo.cuentaOrigenId,
      descripcion,
    });
    return this.detalle(usuario, id);
  }

  /** Monto, fecha, motivo y, si la tiene, la cuenta de origen (no se agrega ni se quita). */
  async editarAporte(
    usuario: UsuarioAutenticado,
    id: string,
    aporteId: string,
    cuerpo: CuerpoCambioAporte,
  ): Promise<MetaDetalleDto> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const e = this.evaluar(ctx, this.metaDe(ctx, id));
    const actual = this.aporteDe(e, aporteId);
    // Editar en una cumplida sí se admite: corregir un aporte puede volverla activa.
    lanzar(
      validarAporte(
        { ...cuerpo, tipo: actual.tipo },
        { ...this.paraAporte(e), cumplida: false },
        ctx.hoy,
      ),
    );
    lanzar(validarOrigenFijo(actual.movimientoId !== null, cuerpo.cuentaOrigenId));

    if (cuerpo.cuentaOrigenId !== null) {
      await this.validarOrigen(usuario, ctx, cuerpo.cuentaOrigenId, e.cuenta.id, {
        id: actual.movimientoId!,
        monto: cuerpo.monto,
        fecha: cuerpo.fecha,
      });
    } else if (actual.tipo === "aporte") {
      // El saldo libre sin este aporte.
      const libre = this.saldoLibreDe(ctx, e.cuenta.id, null) + actual.monto;
      lanzar(validarSaldoLibre(cuerpo.monto, libre));
    }
    const otros = e.aportes.filter((a) => a.id !== aporteId);
    lanzar(validarAcumulado([...otros, { ...actual, monto: cuerpo.monto, fecha: cuerpo.fecha }]));

    await this.metas.actualizarAporte(usuario, actual, {
      monto: cuerpo.monto,
      fecha: cuerpo.fecha,
      motivo: cuerpo.motivo?.trim() ?? null,
      cuentaOrigenId: cuerpo.cuentaOrigenId,
    });
    return this.detalle(usuario, id);
  }

  /** Con origen, borra también su transferencia, con historial (RN-13). */
  async eliminarAporte(usuario: UsuarioAutenticado, id: string, aporteId: string): Promise<void> {
    const ctx = await this.cargar(usuario, { refrescar: false });
    const e = this.evaluar(ctx, this.metaDe(ctx, id));
    const actual = this.aporteDe(e, aporteId);
    if (e.meta.archivadaEn !== null) throw new ErrorApi("META_ARCHIVADA");
    lanzar(validarAcumulado(e.aportes.filter((a) => a.id !== aporteId)));
    await this.metas.eliminarAporte(usuario, actual);
  }

  // -------------------------------------------------------------------------
  // Carga y evaluación
  // -------------------------------------------------------------------------

  /**
   * Lee metas, aportes, cuentas, movimientos y, si hay metas sobre inversión,
   * sus datos y la TRM. Con `refrescar`, trae antes los precios automáticos
   * vencidos; con `detalleDe`, completa los cierres de su historial.
   */
  private async cargar(usuario: UsuarioAutenticado, opciones: OpcionesCarga): Promise<Contexto> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const zona = perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO;
    const hoy = fechaLocal(new Date(), zona);
    const [metas, aportes, efectos] = await Promise.all([
      this.metas.listar(usuario),
      this.metas.aportes(usuario),
      this.cuentas.efectos(usuario),
    ]);
    const cuentas = await this.metas.cuentas(
      usuario,
      metas.map((m) => m.cuentaId),
    );

    const idsInversion = [...cuentas.values()]
      .filter((c) => c.tipo === TIPO_INVERSION)
      .map((c) => c.id);
    let inversiones = await this.inversiones.datos(usuario, idsInversion);
    if (opciones.refrescar && idsInversion.length > 0) {
      const activos = [...inversiones.values()].flatMap((d) => d.activos);
      if (await this.precios.refrescar(usuario, activos)) {
        inversiones = await this.inversiones.datos(usuario, idsInversion);
      }
    }

    // Fechas cuyo valor de mercado pide la lectura: el ritmo sin fecha y el
    // historial del detalle.
    const fechas = new Set<string>([hoy]);
    for (const m of metas) {
      const cuenta = cuentas.get(m.cuentaId);
      if (cuenta?.tipo !== TIPO_INVERSION || m.archivadaEn !== null) continue;
      if (m.fechaMeta === null) {
        fechas.add(inicioDeVentana(hoy, fechaLocal(m.creadoEn, zona)).base);
      }
    }
    const detalle = metas.find((m) => m.id === opciones.detalleDe);
    const cuentaDetalle = detalle === undefined ? undefined : cuentas.get(detalle.cuentaId);
    if (detalle !== undefined && cuentaDetalle?.tipo === TIPO_INVERSION) {
      const creadaEl = fechaLocal(detalle.creadoEn, zona);
      for (const f of fechasDeCierre(creadaEl, hoy)) fechas.add(f);
      const propios = new Map(
        [...inversiones].filter(([cuentaId]) => cuentaId === cuentaDetalle.id),
      );
      const historicas = [...fechasDeCierre(creadaEl, hoy), hoy];
      if (await this.precios.completarHistorico(usuario, propios, historicas)) {
        inversiones = await this.inversiones.datos(usuario, idsInversion);
      }
    }

    const trm = await this.trmEn(usuario, hoy, [...fechas]);
    return { hoy, zona, metas, cuentas, efectos, aportes, inversiones, trm };
  }

  /** TRM de hoy siempre (N-01 del menú y metas USD) y de las demás fechas si hay alguna USD. */
  private async trmEn(
    usuario: UsuarioAutenticado,
    hoy: string,
    fechas: string[],
  ): Promise<Map<string, Trm | null>> {
    if (fechas.length <= 1) {
      const resuelta = await this.trm.en(usuario.token, hoy);
      return new Map([[hoy, resuelta.trm]]);
    }
    const resueltas = await this.trm.enFechas(usuario.token, fechas);
    return new Map([...resueltas].map(([f, r]) => [f, r.trm]));
  }

  /**
   * Valor en COP de una cuenta de inversión en `fecha`, con la TRM de esa
   * fecha; sin fecha, con todos los movimientos, el último precio y la TRM de
   * hoy (el saldo de Cuentas). `null` en USD sin TRM.
   */
  private valorInversion(ctx: Contexto, cuenta: CuentaDeMeta, fecha?: string): bigint | null {
    const efectos = fecha === undefined ? ctx.efectos : ctx.efectos.filter((m) => m.fecha <= fecha);
    const saldoCuenta = calcularSaldo(cuentaConSaldo(cuenta), efectos);
    const { valorMercado } = valorarInversion(
      { saldoCuenta, ...(ctx.inversiones.get(cuenta.id) ?? SIN_DATOS) },
      fecha,
    );
    const trm = ctx.trm.get(fecha ?? ctx.hoy)?.valorCent ?? null;
    return aCop(valorMercado, cuenta.moneda, cuenta.moneda === "COP" ? null : trm);
  }

  /** Valor de mercado de la inversión en su moneda, hoy. */
  private valorMercado(ctx: Contexto, cuenta: CuentaDeMeta): bigint {
    const saldoCuenta = calcularSaldo(cuentaConSaldo(cuenta), ctx.efectos);
    return valorarInversion({ saldoCuenta, ...(ctx.inversiones.get(cuenta.id) ?? SIN_DATOS) })
      .valorMercado;
  }

  /** Avance, cumplimiento, uso y ritmo de una meta. */
  private evaluar(ctx: Contexto, meta: Meta): MetaEvaluada {
    const cuenta = ctx.cuentas.get(meta.cuentaId);
    if (!cuenta) throw new Error(`Meta ${meta.id} sin cuenta visible.`);
    const creadaEl = fechaLocal(meta.creadoEn, ctx.zona);
    const aportes = ctx.aportes.filter((a) => a.metaId === meta.id);

    let avance: bigint | null;
    let cumplida: MetaEvaluada["cumplida"];
    let avanceEn: (fecha: string) => bigint;
    if (meta.modo === "apartado") {
      avance = acumuladoA(aportes);
      cumplida = cumplimientoApartado(aportes, meta.objetivo);
      avanceEn = (f) => acumuladoA(aportes, f);
    } else if (cuenta.tipo !== TIPO_INVERSION) {
      const conSaldo = cuentaConSaldo(cuenta);
      avance = calcularSaldo(conSaldo, ctx.efectos);
      cumplida = cumplimientoPorSaldo(conSaldo, ctx.efectos, creadaEl, ctx.hoy, meta.objetivo);
      avanceEn = (f) => saldoEn(conSaldo, ctx.efectos, f);
    } else {
      avance = this.valorInversion(ctx, cuenta);
      cumplida =
        meta.cumplidaEn === null || meta.avanceCumplida === null
          ? null
          : { fecha: meta.cumplidaEn, avance: meta.avanceCumplida };
      avanceEn = (f) => this.valorInversion(ctx, cuenta, f) ?? 0n;
    }

    const ritmo =
      cumplida !== null || avance === null
        ? null
        : calcularRitmo({
            fechaMeta: meta.fechaMeta,
            fechaMetaEsMes: meta.fechaMetaEsMes,
            falta: falta(meta.objetivo, avance),
            hoy: ctx.hoy,
            creadaEl,
            avanceEn,
          });
    return {
      meta,
      cuenta,
      creadaEl,
      aportes,
      avance,
      cumplida,
      uso: cumplida === null ? null : usoDeCumplida(aportes, cumplida.fecha),
      ritmo,
    };
  }

  /**
   * Evalúa y guarda el cumplimiento de las metas sobre inversión que la
   * lectura detecta por primera vez (N-58). Un fallo al guardar no tumba la
   * lectura: la meta sale cumplida igual y la siguiente lectura reintenta.
   */
  private async evaluarGuardando(
    usuario: UsuarioAutenticado,
    ctx: Contexto,
    metas: readonly Meta[],
  ): Promise<MetaEvaluada[]> {
    const evaluadas: MetaEvaluada[] = [];
    for (const meta of metas) {
      let e = this.evaluar(ctx, meta);
      if (e.cuenta.tipo === TIPO_INVERSION && debeGuardarCumplimiento(meta, e.avance)) {
        const avance = e.avance!;
        try {
          await this.metas.guardarCumplimiento(usuario, meta.id, ctx.hoy, avance);
        } catch (error) {
          const motivo = error instanceof Error ? error.message : String(error);
          this.logger.warn(`No se pudo guardar el cumplimiento de la meta ${meta.id}: ${motivo}`);
        }
        e = this.evaluar(ctx, { ...meta, cumplidaEn: ctx.hoy, avanceCumplida: avance });
      }
      evaluadas.push(e);
    }
    return evaluadas;
  }

  private aDetalle(ctx: Contexto, e: MetaEvaluada): MetaDetalleDto {
    const base = aMetaDto(e);
    const trmHoy = ctx.trm.get(ctx.hoy) ?? null;
    const usd = e.cuenta.moneda === "USD";

    if (e.meta.modo === "apartado") {
      const saldo = calcularSaldo(cuentaConSaldo(e.cuenta), ctx.efectos);
      return {
        ...base,
        historial: historialAportes(e.aportes).map(aFilaAporteDto),
        apartados: aApartadosDto(
          notaApartados(e.meta.id, saldo, this.apartadosDe(ctx, e.cuenta.id, e.meta.id)),
        ),
        inversion: null,
      };
    }

    const esInversion = e.cuenta.tipo === TIPO_INVERSION;
    const conSaldo = cuentaConSaldo(e.cuenta);
    const valorEn = esInversion
      ? (f: string) => this.valorInversion(ctx, e.cuenta, f)
      : (f: string) => saldoEn(conSaldo, ctx.efectos, f);
    return {
      ...base,
      historial: historialValor(e.creadaEl, ctx.hoy, valorEn).map((f) =>
        aFilaValorDto(f, usd ? trmHoy : null),
      ),
      apartados: null,
      inversion: esInversion
        ? {
            valorMercado: this.valorMercado(ctx, e.cuenta).toString(),
            moneda: e.cuenta.moneda,
            trm: usd && trmHoy !== null ? aTrmDto(trmHoy) : null,
          }
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  /**
   * Apartado vigente de las metas por apartado de la cuenta sin archivar; con
   * `incluir`, también esa meta.
   */
  private apartadosDe(ctx: Contexto, cuentaId: string, incluir: string | null): ApartadoDeMeta[] {
    return ctx.metas
      .filter(
        (m) =>
          m.modo === "apartado" &&
          m.cuentaId === cuentaId &&
          (m.archivadaEn === null || m.id === incluir),
      )
      .map((m) => ({
        metaId: m.id,
        nombre: m.nombre,
        apartado: acumuladoA(ctx.aportes.filter((a) => a.metaId === m.id)),
      }));
  }

  /** Saldo libre de la cuenta sin lo apartado en `excluir` (la meta que se mueve). */
  private saldoLibreDe(ctx: Contexto, cuentaId: string, excluir: string | null): bigint {
    const cuenta = ctx.cuentas.get(cuentaId);
    const saldo = cuenta === undefined ? 0n : calcularSaldo(cuentaConSaldo(cuenta), ctx.efectos);
    return saldoLibre(
      saldo,
      this.apartadosDe(ctx, cuentaId, null).filter((a) => a.metaId !== excluir),
    );
  }

  /** La cuenta del cuerpo, leída si no está en el contexto. Una ajena no es visible: `null`. */
  private async cuentaVisible(
    usuario: UsuarioAutenticado,
    ctx: Contexto,
    cuentaId: string,
  ): Promise<CuentaDeMeta | null> {
    if (!ctx.cuentas.has(cuentaId)) {
      for (const [id, c] of await this.metas.cuentas(usuario, [cuentaId])) ctx.cuentas.set(id, c);
    }
    return ctx.cuentas.get(cuentaId) ?? null;
  }

  /**
   * Cuenta de origen válida (COP, distinta, no préstamo) y, si es una
   * inversión, sin efectivo negativo ningún día tras la transferencia (N-65).
   */
  private async validarOrigen(
    usuario: UsuarioAutenticado,
    ctx: Contexto,
    origenId: string,
    destinoId: string,
    transferencia: { id: string; monto: bigint; fecha: string },
  ): Promise<void> {
    const origen = await this.cuentaVisible(usuario, ctx, origenId);
    lanzar(validarCuentaOrigen(origen, destinoId));
    if (origen?.tipo === TIPO_INVERSION) {
      await this.lineaDeTiempo.validar(usuario, origenId, {
        movimiento: {
          id: transferencia.id,
          nuevo: {
            ...transferencia,
            montoDestino: null,
            cuentaOrigenId: origenId,
            cuentaDestinoId: destinoId,
          },
        },
      });
    }
  }

  private paraAporte(e: MetaEvaluada) {
    return {
      modo: e.meta.modo,
      tipoCuenta: e.cuenta.tipo,
      archivada: e.meta.archivadaEn !== null,
      cumplida: e.cumplida !== null,
      creadaEl: e.creadaEl,
    };
  }

  private metaDe(ctx: Contexto, id: string): Meta {
    const meta = ctx.metas.find((m) => m.id === id);
    if (!meta) throw new ErrorApi("META_NO_ENCONTRADA");
    return meta;
  }

  private aporteDe(e: MetaEvaluada, aporteId: string): Aporte {
    const aporte = e.aportes.find((a) => a.id === aporteId);
    if (!aporte) throw new ErrorApi("APORTE_NO_ENCONTRADO");
    return aporte;
  }
}

/** Forma que ordenan las funciones de `orden.ts`. */
function ordenable(evaluada: MetaEvaluada) {
  return {
    evaluada,
    fechaMeta: evaluada.meta.fechaMeta,
    creadoEn: evaluada.meta.creadoEn,
    cumplidaEl: evaluada.cumplida?.fecha ?? null,
    archivadaEn: evaluada.meta.archivadaEn,
  };
}
