import { Module } from "@nestjs/common";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { CuentasController } from "./cuentas.controller.js";
import { CuentasService } from "./cuentas.service.js";

@Module({
  controllers: [CuentasController],
  providers: [CuentasService, CuentasRepository, PerfilesRepository],
})
export class CuentasModule {}
