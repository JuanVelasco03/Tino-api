import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import type { Perfil } from "../domain/perfil/perfil.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";

@Injectable()
export class PerfilService {
  constructor(private readonly perfiles: PerfilesRepository) {}

  obtener(usuario: UsuarioAutenticado): Promise<Perfil | null> {
    return this.perfiles.leerPropio(usuario.token);
  }
}
