import { Module } from "@nestjs/common";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PerfilController } from "./perfil.controller.js";
import { PerfilService } from "./perfil.service.js";

@Module({
  controllers: [PerfilController],
  providers: [PerfilService, PerfilesRepository, CuentasRepository],
})
export class PerfilModule {}
