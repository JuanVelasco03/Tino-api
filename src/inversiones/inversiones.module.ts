import { Module } from "@nestjs/common";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { TrmModule } from "../trm/trm.module.js";
import { InversionesController } from "./inversiones.controller.js";
import { InversionesService } from "./inversiones.service.js";
import { LineaDeTiempoService } from "./linea-de-tiempo.service.js";

/**
 * Cuentas de inversión (SPEC 10). Exporta `LineaDeTiempoService` e
 * `InversionesRepository` para movimientos y cuentas, que validan la línea de
 * tiempo y valoran las inversiones.
 */
@Module({
  imports: [TrmModule],
  controllers: [InversionesController],
  providers: [
    InversionesService,
    InversionesRepository,
    CuentasRepository,
    PerfilesRepository,
    LineaDeTiempoService,
  ],
  exports: [LineaDeTiempoService, InversionesRepository],
})
export class InversionesModule {}
