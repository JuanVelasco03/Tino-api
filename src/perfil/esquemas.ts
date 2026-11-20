/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`.
 */
import { z } from "zod";

export const cuerpoEdicionPerfil = z.object(
  {
    cuentaPredeterminadaId: z.uuid({ error: "ENTRADA_INVALIDA" }).nullable(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoEdicionPerfil = z.output<typeof cuerpoEdicionPerfil>;
