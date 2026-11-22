import { Module } from "@nestjs/common";
import { AvisosRepository } from "../repositories/supabase/avisos.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PrestamosRepository } from "../repositories/supabase/prestamos.repository.js";
import { RecurrentesRepository } from "../repositories/supabase/recurrentes.repository.js";
import { AvisosController } from "./avisos.controller.js";
import { AvisosService } from "./avisos.service.js";

/**
 * Avisos (SPEC 12). Provee los repositorios que lee, como `RecurrentesModule`.
 * No importa precios ni TRM: los avisos no refrescan precios (SPEC 11).
 */
@Module({
  controllers: [AvisosController],
  providers: [
    AvisosService,
    AvisosRepository,
    PerfilesRepository,
    RecurrentesRepository,
    PrestamosRepository,
    InversionesRepository,
  ],
})
export class AvisosModule {}
