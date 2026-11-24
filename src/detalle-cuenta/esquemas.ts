/**
 * Forma de la entrada del detalle de cuenta (SPEC 14). Cada `message` es un
 * código del catálogo de `comun/error-api.ts`.
 */
import { z } from "zod";
import { esFechaValida } from "../domain/fecha/mes.js";

const fecha = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA" });

/** Entero en pesos, como string. */
const monto = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

/** `?desde=&hasta=`; sin `desde`, últimos 30 días; sin `hasta`, sin tope. */
export const consultaHistorial = z.object(
  { desde: fecha.optional(), hasta: fecha.optional() },
  { error: "ENTRADA_INVALIDA" },
);
export type ConsultaHistorial = z.output<typeof consultaHistorial>;

export const cuerpoConciliacion = z.object(
  {
    movimientoIds: z
      .array(z.uuid({ error: "ENTRADA_INVALIDA" }), { error: "ENTRADA_INVALIDA" })
      .min(1, { error: "ENTRADA_INVALIDA" })
      .max(500, { error: "ENTRADA_INVALIDA" })
      .refine((ids) => new Set(ids).size === ids.length, { error: "ENTRADA_INVALIDA" }),
    conciliado: z.boolean({ error: "ENTRADA_INVALIDA" }),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoConciliacion = z.output<typeof cuerpoConciliacion>;

export const cuerpoAjuste = z.object(
  {
    saldoReal: monto,
    conciliarHastaHoy: z
      .boolean({ error: "ENTRADA_INVALIDA" })
      .optional()
      .transform((c) => c ?? true),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAjuste = z.output<typeof cuerpoAjuste>;

/** `?compra=`: entero en pesos mayor que 0. */
export const consultaCiclo = z.object(
  {
    compra: monto.refine((m) => m > 0n, { error: "MONTO_INVALIDO" }).optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type ConsultaCiclo = z.output<typeof consultaCiclo>;
