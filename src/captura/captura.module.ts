import { Module } from "@nestjs/common";
import { CapturaRepository } from "../repositories/supabase/captura.repository.js";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { ReglasRepository } from "../repositories/supabase/reglas.repository.js";
import { CapturaController } from "./captura.controller.js";
import { CapturaService } from "./captura.service.js";

@Module({
  controllers: [CapturaController],
  providers: [
    CapturaService,
    CapturaRepository,
    CategoriasRepository,
    ReglasRepository,
    CuentasRepository,
    PerfilesRepository,
  ],
})
export class CapturaModule {}
