import { Module } from "@nestjs/common";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PrestamosRepository } from "../repositories/supabase/prestamos.repository.js";
import { PrestamosController } from "./prestamos.controller.js";
import { PrestamosService } from "./prestamos.service.js";

@Module({
  controllers: [PrestamosController],
  providers: [
    PrestamosService,
    PrestamosRepository,
    MovimientosRepository,
    CategoriasRepository,
    PerfilesRepository,
  ],
})
export class PrestamosModule {}
