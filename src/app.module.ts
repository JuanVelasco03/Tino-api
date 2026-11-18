import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AutenticacionGuard } from "./autenticacion/autenticacion.guard.js";
import { PerfilModule } from "./perfil/perfil.module.js";
import { SupabaseModule } from "./repositories/supabase/supabase.module.js";

@Module({
  imports: [SupabaseModule, PerfilModule],
  // Guard global: toda ruta exige un token válido del proveedor (RF-03).
  providers: [{ provide: APP_GUARD, useClass: AutenticacionGuard }],
})
export class AppModule {}
