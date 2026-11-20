/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`.
 */
import { z } from "zod";
import { TIPOS_MOVIMIENTO } from "../domain/movimiento/movimiento.js";

/** `?tipo=gasto|ingreso|transferencia&texto=`; texto ausente equivale a vacío. */
export const consultaSugerencias = z.object(
  {
    tipo: z.enum(TIPOS_MOVIMIENTO, { error: "TIPO_MOVIMIENTO_INVALIDO" }),
    texto: z
      .string({ error: "ENTRADA_INVALIDA" })
      .max(80, { error: "DESCRIPCION_LARGA" })
      .optional()
      .transform((t) => t ?? ""),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type ConsultaSugerencias = z.output<typeof consultaSugerencias>;
