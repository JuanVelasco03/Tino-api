import "./config/cargar-env.js";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { crearPipeValidacion } from "./comun/error-api.js";
import { comprobarSinSecretoDeServicio, leerEnv } from "./config/env.js";

async function bootstrap() {
  comprobarSinSecretoDeServicio();
  const env = leerEnv();
  if (env.twelveDataApiKey === null) {
    // SPEC 11: sin clave, la API arranca igual y todo activo queda manual.
    new Logger("Precios").warn(
      "Falta TWELVE_DATA_API_KEY: los precios de inversiones quedan manuales.",
    );
  }

  const app = await NestFactory.create(AppModule);
  // Sin cookies: la autenticación va en la cabecera Authorization (API sin estado).
  app.enableCors({ origin: env.origenWeb });
  // Validación con Zod (Standard Schema); los fallos salen en formato ErrorApi.
  app.useGlobalPipes(crearPipeValidacion());
  await app.listen(env.puerto);
}
await bootstrap();
