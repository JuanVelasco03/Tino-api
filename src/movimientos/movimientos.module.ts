import { Module } from "@nestjs/common";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { MovimientosController } from "./movimientos.controller.js";
import { MovimientosService } from "./movimientos.service.js";

@Module({
  controllers: [MovimientosController],
  providers: [MovimientosService, MovimientosRepository, PerfilesRepository],
})
export class MovimientosModule {}
