import { Module } from "@nestjs/common";
import { InversionesModule } from "../inversiones/inversiones.module.js";
import { PreciosModule } from "../precios/precios.module.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { MetasRepository } from "../repositories/supabase/metas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { TrmModule } from "../trm/trm.module.js";
import { MetasController } from "./metas.controller.js";
import { MetasService } from "./metas.service.js";

/**
 * Metas de ahorro (SPEC 13). Importa `InversionesModule` para valorar las
 * metas sobre inversión y validar la línea de tiempo de un origen inversión,
 * `PreciosModule` para refrescar y completar precios y `TrmModule` para la
 * TRM.
 */
@Module({
  imports: [InversionesModule, PreciosModule, TrmModule],
  controllers: [MetasController],
  providers: [MetasService, MetasRepository, CuentasRepository, PerfilesRepository],
})
export class MetasModule {}
