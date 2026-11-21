import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { Categoria } from "../domain/categorizacion/categoria.js";
import { proponerCategoria, type ReglaEvaluable } from "../domain/categorizacion/proponer.js";
import { resolverCuentaPredeterminada } from "../domain/cuenta/predeterminada.js";
import { fechaLocal } from "../domain/fecha/fecha-local.js";
import { restarDias } from "../domain/fecha/mes.js";
import { sumarGastos } from "../domain/movimiento/gasto-del-dia.js";
import type { TipoMovimiento } from "../domain/movimiento/movimiento.js";
import { ZONA_HORARIA_POR_DEFECTO } from "../domain/perfil/perfil.js";
import { normalizarTexto } from "../domain/texto/normalizar.js";
import { CapturaRepository } from "../repositories/supabase/captura.repository.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { ReglasRepository } from "../repositories/supabase/reglas.repository.js";
import { aCategoriaDto, type CapturaDto, type SugerenciasDto } from "./dto.js";

/** Conceptos frecuentes: los de los últimos 90 días (contando hoy), 6 por tipo. */
const DIAS_FRECUENTES = 90;
const LIMITE_FRECUENTES = 6;
/** Autocompletado: 2 conceptos, todo el historial. */
const LIMITE_SUGERENCIAS = 2;

type ReglaConCategoria = ReglaEvaluable & { categoria: Categoria };

@Injectable()
export class CapturaService {
  constructor(
    private readonly captura: CapturaRepository,
    private readonly categorias: CategoriasRepository,
    private readonly reglas: ReglasRepository,
    private readonly cuentas: CuentasRepository,
    private readonly perfiles: PerfilesRepository,
  ) {}

  /** Todo lo que necesita el formulario al abrir, en una llamada. */
  async obtener(usuario: UsuarioAutenticado): Promise<CapturaDto> {
    const perfil = await this.perfiles.leerPropio(usuario.token);
    const fechaHoy = fechaLocal(new Date(), perfil?.zonaHoraria ?? ZONA_HORARIA_POR_DEFECTO);

    const [cuentas, categorias, gastosHoy, frecuentes] = await Promise.all([
      this.cuentas.listar(usuario),
      this.categorias.listar(usuario.token),
      this.captura.gastosDelDia(usuario, fechaHoy),
      this.captura.conceptosFrecuentes(
        usuario.token,
        restarDias(fechaHoy, DIAS_FRECUENTES - 1),
        LIMITE_FRECUENTES,
      ),
    ]);

    const deTipo = (tipo: TipoMovimiento) =>
      frecuentes.filter((f) => f.tipo === tipo).map((f) => f.descripcion);

    return {
      fechaHoy,
      cuentaPredeterminadaId: resolverCuentaPredeterminada(
        perfil?.cuentaPredeterminadaId ?? null,
        cuentas,
      ),
      categorias: {
        gasto: categorias.filter((c) => c.tipo === "gasto").map(aCategoriaDto),
        ingreso: categorias.filter((c) => c.tipo === "ingreso").map(aCategoriaDto),
      },
      gastosHoy: sumarGastos(gastosHoy).toString(),
      conceptosFrecuentes: {
        gasto: deTipo("gasto"),
        ingreso: deTipo("ingreso"),
        transferencia: deTipo("transferencia"),
      },
    };
  }

  /**
   * Autocompletado y categoría propuesta mientras se escribe (RN-11). La
   * categoría de cada concepto es la que propone la regla para ese concepto.
   */
  async sugerir(
    usuario: UsuarioAutenticado,
    tipo: TipoMovimiento,
    texto: string,
  ): Promise<SugerenciasDto> {
    if (normalizarTexto(texto) === "") return { conceptos: [], propuesta: null };

    const [conceptos, reglas] = await Promise.all([
      this.captura.conceptosPorPrefijo(usuario.token, tipo, texto, LIMITE_SUGERENCIAS),
      tipo === "transferencia" ? [] : this.reglasConCategoria(usuario),
    ]);

    const proponer = (t: string) => proponerCategoria(t, tipo, reglas);
    const propuesta = proponer(texto);

    return {
      conceptos: conceptos.map((descripcion) => {
        const regla = proponer(descripcion);
        return { descripcion, categoria: regla ? aCategoriaDto(regla.categoria) : null };
      }),
      propuesta: propuesta
        ? {
            categoria: aCategoriaDto(propuesta.categoria),
            regla: { id: propuesta.id, palabraClave: propuesta.palabraClave },
          }
        : null,
    };
  }

  private async reglasConCategoria(usuario: UsuarioAutenticado): Promise<ReglaConCategoria[]> {
    const [reglas, categorias] = await Promise.all([
      this.reglas.listar(usuario.token),
      this.categorias.listar(usuario.token),
    ]);
    const porId = new Map(categorias.map((c) => [c.id, c]));
    return reglas.flatMap((regla) => {
      const categoria = porId.get(regla.categoriaId);
      return categoria ? [{ ...regla, tipoCategoria: categoria.tipo, categoria }] : [];
    });
  }
}
