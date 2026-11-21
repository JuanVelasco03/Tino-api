import { Module } from "@nestjs/common";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { RecurrentesRepository } from "../repositories/supabase/recurrentes.repository.js";
import { RecurrentesController } from "./recurrentes.controller.js";
import { RecurrentesService } from "./recurrentes.service.js";

@Module({
  controllers: [RecurrentesController],
  providers: [
    RecurrentesService,
    RecurrentesRepository,
    CuentasRepository,
    MovimientosRepository,
    PerfilesRepository,
  ],
})
export class RecurrentesModule {}
