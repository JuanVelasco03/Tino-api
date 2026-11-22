import { esTipoPrestamo } from "../domain/prestamo/prestamo.js";
import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { mesAnterior, rangoDelMes } from "../domain/fecha/mes.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { resumirMes } from "../domain/resumen/mes.js";
import { TIPO_INVERSION } from "../domain/inversion/inversion.js";
import {
  cambioDelMes,
  fechasConTrm,
  inicio,
  patrimonioEn,
  seriePatrimonio,
  variacionDeSerie,
} from "../domain/resumen/patrimonio.js";
import type { DatosPatrimonio } from "../domain/resumen/resumen.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { ResumenRepository } from "../repositories/supabase/resumen.repository.js";
import { TrmService } from "../trm/trm.service.js";
import {
  aCambioDelMesDto,
  aCategoriasDto,
  aComparacionDto,
  aSerieDto,
  aSinCategoriaDto,
  type ResumenDto,
} from "./dto.js";

@Injectable()
export class ResumenService {
  constructor(
    private readonly resumen: ResumenRepository,
    private readonly categorias: CategoriasRepository,
    private readonly perfiles: PerfilesRepository,
    private readonly inversiones: InversionesRepository,
    private readonly trm: TrmService,
  ) {}

  /**
   * Resumen del mes `mes` ("YYYY-MM"); sin mes, el actual en la zona del
   * perfil. Un mes posterior al actual → MES_FUTURO. Todo lo calcula el dominio.
   * Las inversiones aportan su valor de mercado en COP; la TRM de todas las
   * fechas que hacen falta sale de una sola llamada a `enFechas`, y solo si
   * hay alguna inversión USD (SPEC 10).
   */
  async obtener(usuario: UsuarioAutenticado, mes: string | undefined): Promise<ResumenDto> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const zona = perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO;
    const fechaHoy = fechaLocal(new Date(), zona);
    const mesActual = fechaHoy.slice(0, 7);
    const mesMostrado = mes ?? mesActual;
    // "YYYY-MM" ordena igual como texto que como fecha.
    if (mesMostrado > mesActual) throw new ErrorApi("MES_FUTURO");

    const previo = mesAnterior(mesMostrado);
    const { desde, hasta } = rangoDelMes(mesMostrado);
    const [lectura, categorias] = await Promise.all([
      this.resumen.leer(usuario, rangoDelMes(previo).desde, hasta),
      this.categorias.listar(usuario.token),
    ]);

    const idsInversion = lectura.cuentas.filter((c) => c.tipo === TIPO_INVERSION).map((c) => c.id);
    const base: DatosPatrimonio = {
      cuentas: lectura.cuentas.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        moneda: c.moneda,
        saldoInicial: c.saldoInicial,
        creadaEl: fechaLocal(c.creadoEn, zona),
      })),
      cambios: lectura.cambios.map((c) => ({ ...c, fecha: fechaLocal(c.cambiadoEn, zona) })),
      movimientos: lectura.movimientos,
      inversiones: await this.inversiones.datos(usuario, idsInversion),
    };
    const fechasTrm = fechasConTrm(base, fechaHoy, mesMostrado);
    const trm =
      fechasTrm.length === 0 ? new Map() : await this.trm.enFechas(usuario.token, fechasTrm);
    const datos: DatosPatrimonio = {
      ...base,
      trm: new Map([...trm].map(([fecha, r]) => [fecha, r.trm?.valorCent ?? null])),
    };

    const delMes = resumirMes(lectura.movimientos, lectura.partes, categorias, mesMostrado);
    const serie = seriePatrimonio(datos, fechaHoy);
    const nombres = new Map(categorias.map((c) => [c.id, c]));

    return {
      mes: mesMostrado,
      mesAnterior: previo,
      desde,
      hasta,
      fechaHoy,
      inicio: inicio(datos.cuentas),
      tieneMovimientos: lectura.movimientos.length > 0,
      // Los préstamos no son cuentas propias (SPEC 08): entran en el patrimonio, no aquí.
      cuentasActivas: lectura.cuentas.filter(
        (c) => c.archivadaEn === null && !esTipoPrestamo(c.tipo),
      ).length,
      cantidadMovimientos: delMes.cantidadMovimientos,
      ingresos: aComparacionDto(delMes.ingresos),
      gastos: aComparacionDto(delMes.gastos),
      resultado: aComparacionDto(delMes.resultado),
      categorias: aCategoriasDto(delMes, nombres),
      sinCategoria: aSinCategoriaDto(delMes),
      patrimonio: {
        hoy: patrimonioEn(datos, fechaHoy).toString(),
        serie: aSerieDto(serie),
        variacionSerie: variacionDeSerie(serie).toString(),
      },
      cambioDelMes: aCambioDelMesDto(cambioDelMes(datos, mesMostrado, delMes.resultado.actual)),
    };
  }
}
