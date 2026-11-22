import { Module } from "@nestjs/common";
import { leerEnv } from "../config/env.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PreciosFuente } from "../repositories/twelve-data/precios.fuente.js";
import { PreciosService } from "./precios.service.js";

/**
 * Precios automáticos (SPEC 11). Exporta `PreciosService` para inversiones,
 * cuentas y resumen. La fuente se construye con la clave del entorno (o sin
 * ella: entonces todo queda manual); las e2e la reemplazan por una falsa.
 */
@Module({
  providers: [
    PreciosService,
    InversionesRepository,
    PerfilesRepository,
    { provide: PreciosFuente, useFactory: () => new PreciosFuente(leerEnv().twelveDataApiKey) },
  ],
  exports: [PreciosService],
})
export class PreciosModule {}
