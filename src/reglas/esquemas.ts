/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. La normalización y el largo final de la palabra clave
 * los decide el servicio con `domain/texto/normalizar.ts`.
 */
import { z } from "zod";

const categoriaId = z.uuid({ error: "CATEGORIA_INVALIDA" });

export const cuerpoAlta = z.object(
  {
    palabraClave: z
      .string({ error: "PALABRA_CLAVE_REQUERIDA" })
      .max(200, { error: "PALABRA_CLAVE_LARGA" }),
    categoriaId,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAlta = z.output<typeof cuerpoAlta>;

export const cuerpoEdicion = z.object({ categoriaId }, { error: "ENTRADA_INVALIDA" });
export type CuerpoEdicion = z.output<typeof cuerpoEdicion>;

export const idRegla = z.uuid({ error: "ENTRADA_INVALIDA" });
