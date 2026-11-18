/**
 * Carga `.env.local` en `process.env` si existe. Se importa primero en `main.ts`
 * para que corra antes que cualquier otro módulo.
 * Las pruebas cargan el entorno desde `vitest.config.ts`.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin archivo: en producción las variables llegan del entorno.
}
