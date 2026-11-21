import { Module } from "@nestjs/common";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { ResumenRepository } from "../repositories/supabase/resumen.repository.js";
import { ResumenController } from "./resumen.controller.js";
import { ResumenService } from "./resumen.service.js";

@Module({
  controllers: [ResumenController],
  providers: [ResumenService, ResumenRepository, CategoriasRepository, PerfilesRepository],
})
export class ResumenModule {}
