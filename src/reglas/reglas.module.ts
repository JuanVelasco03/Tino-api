import { Module } from "@nestjs/common";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { ReglasRepository } from "../repositories/supabase/reglas.repository.js";
import { ReglasController } from "./reglas.controller.js";
import { ReglasService } from "./reglas.service.js";

@Module({
  controllers: [ReglasController],
  providers: [ReglasService, ReglasRepository, CategoriasRepository],
})
export class ReglasModule {}
