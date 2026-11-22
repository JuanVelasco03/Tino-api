import { Module } from "@nestjs/common";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { ResumenRepository } from "../repositories/supabase/resumen.repository.js";
import { PreciosModule } from "../precios/precios.module.js";
import { TrmModule } from "../trm/trm.module.js";
import { ResumenController } from "./resumen.controller.js";
import { ResumenService } from "./resumen.service.js";

/**
 * Importa `TrmModule` para valorar las inversiones USD (SPEC 10) y
 * `PreciosModule` para refrescar y completar sus precios (SPEC 11).
 */
@Module({
  imports: [TrmModule, PreciosModule],
  controllers: [ResumenController],
  providers: [
    ResumenService,
    ResumenRepository,
    CategoriasRepository,
    PerfilesRepository,
    InversionesRepository,
  ],
})
export class ResumenModule {}
