import { Global, Module } from "@nestjs/common";
import { leerEnv } from "../../config/env.js";
import { CifradorMontos } from "./montos.js";

/** Un único cifrador para toda la app, con las claves del entorno (SPEC 05). */
@Global()
@Module({
  providers: [
    {
      provide: CifradorMontos,
      useFactory: () => new CifradorMontos(new Map([[1, leerEnv().claveMontosV1]])),
    },
  ],
  exports: [CifradorMontos],
})
export class CifradoModule {}
