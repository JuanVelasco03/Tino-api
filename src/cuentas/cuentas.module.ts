import { Module } from "@nestjs/common";
import { InversionesModule } from "../inversiones/inversiones.module.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { TrmModule } from "../trm/trm.module.js";
import { CuentasController } from "./cuentas.controller.js";
import { CuentasService } from "./cuentas.service.js";

/** Importa `InversionesModule` y `TrmModule` para valorar las inversiones (SPEC 10). */
@Module({
  imports: [InversionesModule, TrmModule],
  controllers: [CuentasController],
  providers: [CuentasService, CuentasRepository, PerfilesRepository],
})
export class CuentasModule {}
