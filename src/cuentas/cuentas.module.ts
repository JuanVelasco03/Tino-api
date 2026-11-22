import { Module } from "@nestjs/common";
import { InversionesModule } from "../inversiones/inversiones.module.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { PreciosModule } from "../precios/precios.module.js";
import { TrmModule } from "../trm/trm.module.js";
import { CuentasController } from "./cuentas.controller.js";
import { CuentasService } from "./cuentas.service.js";

/**
 * Importa `InversionesModule` y `TrmModule` para valorar las inversiones
 * (SPEC 10), y `PreciosModule` para refrescar sus precios (SPEC 11).
 */
@Module({
  imports: [InversionesModule, TrmModule, PreciosModule],
  controllers: [CuentasController],
  providers: [CuentasService, CuentasRepository, PerfilesRepository],
})
export class CuentasModule {}
