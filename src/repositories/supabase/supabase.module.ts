import { Global, Module } from "@nestjs/common";
import { AutenticacionRepository } from "./autenticacion.repository.js";
import { ClienteSupabase } from "./cliente.js";

@Global()
@Module({
  providers: [ClienteSupabase, AutenticacionRepository],
  exports: [ClienteSupabase, AutenticacionRepository],
})
export class SupabaseModule {}
