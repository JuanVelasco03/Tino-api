import { Module } from "@nestjs/common";
import { TrmFuente } from "../repositories/datos-gov/trm.fuente.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { TrmRepository } from "../repositories/supabase/trm.repository.js";
import { TrmController } from "./trm.controller.js";
import { TrmService } from "./trm.service.js";

/** Exporta `TrmService` para los equivalentes en COP de SPEC 10. */
@Module({
  controllers: [TrmController],
  providers: [TrmService, TrmRepository, TrmFuente, PerfilesRepository],
  exports: [TrmService],
})
export class TrmModule {}
