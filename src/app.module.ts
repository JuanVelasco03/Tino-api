import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AutenticacionGuard } from "./autenticacion/autenticacion.guard.js";
import { CapturaModule } from "./captura/captura.module.js";
import { ErrorApiFilter } from "./comun/error-api.filter.js";
import { CuentasModule } from "./cuentas/cuentas.module.js";
import { MovimientosModule } from "./movimientos/movimientos.module.js";
import { PerfilModule } from "./perfil/perfil.module.js";
import { RecurrentesModule } from "./recurrentes/recurrentes.module.js";
import { ReglasModule } from "./reglas/reglas.module.js";
import { CifradoModule } from "./repositories/cifrado/cifrado.module.js";
import { SupabaseModule } from "./repositories/supabase/supabase.module.js";
import { ResumenModule } from "./resumen/resumen.module.js";

@Module({
  imports: [
    SupabaseModule,
    CifradoModule,
    PerfilModule,
    CuentasModule,
    MovimientosModule,
    CapturaModule,
    ReglasModule,
    ResumenModule,
    RecurrentesModule,
  ],
  providers: [
    // Guard global: toda ruta exige un token válido del proveedor (RF-03).
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    // Formato único de error: { statusCode, codigo, mensaje, campo? }.
    { provide: APP_FILTER, useClass: ErrorApiFilter },
  ],
})
export class AppModule {}
