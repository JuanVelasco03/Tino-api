import { Module } from "@nestjs/common";
import { CategoriasRepository } from "../repositories/supabase/categorias.repository.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { DetalleCuentaRepository } from "../repositories/supabase/detalle-cuenta.repository.js";
import { MovimientosRepository } from "../repositories/supabase/movimientos.repository.js";
import { PerfilesRepository } from "../repositories/supabase/perfiles.repository.js";
import { DetalleCuentaController } from "./detalle-cuenta.controller.js";
import { DetalleCuentaService } from "./detalle-cuenta.service.js";

/** Historial, conciliación, ajuste de saldo y ciclo de tarjeta (SPEC 14). */
@Module({
  controllers: [DetalleCuentaController],
  providers: [
    DetalleCuentaService,
    CuentasRepository,
    MovimientosRepository,
    DetalleCuentaRepository,
    CategoriasRepository,
    PerfilesRepository,
  ],
})
export class DetalleCuentaModule {}
