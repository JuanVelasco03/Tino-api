/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. Que `dias` esté entre las opciones del tipo lo valida
 * `domain/aviso/config.ts`.
 */
import { z } from "zod";
import { TIPOS_AVISO } from "../domain/aviso/aviso.js";
import { esClaveValida } from "../domain/aviso/clave.js";

/** `:clave` de la ruta: `<tipo>:<uuid>:<YYYY-MM-DD>`. */
export const claveRuta = z
  .string({ error: "ENTRADA_INVALIDA" })
  .refine(esClaveValida, { error: "ENTRADA_INVALIDA" });

/** `:tipo` de la ruta. */
export const tipoRuta = z.enum(TIPOS_AVISO, { error: "ENTRADA_INVALIDA" });

export const cuerpoMarca = z.object(
  { leido: z.boolean({ error: "ENTRADA_INVALIDA" }) },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoMarca = z.output<typeof cuerpoMarca>;

/** Sin campos llega como `{}` y el dominio responde SIN_CAMBIOS. */
export const cuerpoConfig = z.object(
  {
    activo: z.boolean({ error: "ENTRADA_INVALIDA" }).optional(),
    dias: z
      .number({ error: "ANTELACION_INVALIDA" })
      .int({ error: "ANTELACION_INVALIDA" })
      .optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoConfig = z.output<typeof cuerpoConfig>;
