import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { aCategoriaDto, type CategoriaDto } from "../captura/dto.js";
import { ErrorApi } from "../comun/error-api.js";
import type { Categoria } from "../domain/categorizacion/categoria.js";
import type { Regla } from "../domain/categorizacion/proponer.js";
import { normalizarTexto } from "../domain/texto/normalizar.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { ReglasRepository } from "../repositories/supabase/reglas.repository.js";

export type ReglaDto = { id: string; palabraClave: string; categoria: CategoriaDto };

const LARGO_MAXIMO = 60;

function aReglaDto(regla: Regla, categoria: Categoria): ReglaDto {
  return { id: regla.id, palabraClave: regla.palabraClave, categoria: aCategoriaDto(categoria) };
}

/** Reglas de categorización (RN-11): el cliente ofrece crearlas o ajustarlas al corregir. */
@Injectable()
export class ReglasService {
  constructor(
    private readonly reglas: ReglasRepository,
    private readonly categorias: CategoriasRepository,
  ) {}

  /** La palabra clave se guarda normalizada: «Peluquería» → «peluqueria». */
  async crear(
    usuario: UsuarioAutenticado,
    palabraClave: string,
    categoriaId: string,
  ): Promise<ReglaDto> {
    const normalizada = normalizarTexto(palabraClave);
    if (normalizada === "") throw new ErrorApi("PALABRA_CLAVE_REQUERIDA");
    if (normalizada.length > LARGO_MAXIMO) throw new ErrorApi("PALABRA_CLAVE_LARGA");
    const categoria = await this.categoriaPropia(usuario, categoriaId);
    const regla = await this.reglas.crear(usuario.token, normalizada, categoria.id);
    return aReglaDto(regla, categoria);
  }

  async cambiarCategoria(
    usuario: UsuarioAutenticado,
    id: string,
    categoriaId: string,
  ): Promise<ReglaDto> {
    const categoria = await this.categoriaPropia(usuario, categoriaId);
    const regla = await this.reglas.cambiarCategoria(usuario.token, id, categoria.id);
    return aReglaDto(regla, categoria);
  }

  private async categoriaPropia(usuario: UsuarioAutenticado, id: string): Promise<Categoria> {
    const categoria = await this.categorias.obtener(usuario.token, id);
    if (!categoria) throw new ErrorApi("CATEGORIA_INVALIDA", "categoriaId");
    return categoria;
  }
}
