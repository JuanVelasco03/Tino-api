import { Module } from "@nestjs/common";
import { InversionesModule } from "../inversiones/inversiones.module.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { MovimientosController } from "./movimientos.controller.js";
import { MovimientosService } from "./movimientos.service.js";

/** Importa `InversionesModule` por `LineaDeTiempoService` (SPEC 10). */
@Module({
  imports: [InversionesModule],
  controllers: [MovimientosController],
  providers: [MovimientosService, MovimientosRepository, PerfilesRepository],
})
export class MovimientosModule {}
