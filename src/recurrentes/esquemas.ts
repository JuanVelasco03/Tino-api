/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. La forma por tipo, el concepto y el calendario los
 * valida `domain/recurrente/validar.ts`.
 */
import { z } from "zod";
import { esFechaValida } from "../domain/fecha/mes.js";
import { TIPOS_MOVIMIENTO } from "../domain/movimiento/movimiento.js";
import { PERIODICIDADES } from "../domain/recurrente/recurrente.js";

/** Entero en unidades menores, como string. Ausente → MONTO_REQUERIDO; mal formado → MONTO_INVALIDO. */
const monto = z
  .string({ error: (issue) => (issue.input === undefined ? "MONTO_REQUERIDO" : "MONTO_INVALIDO") })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

const fecha = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA" });

/** UUID opcional; "" o ausente equivalen a null. */
const idOpcional = z
  .preprocess((v) => (v === "" ? null : v), z.uuid({ error: "ENTRADA_INVALIDA" }).nullish())
  .transform((v) => v ?? null);

/** POST y PUT. */
export const cuerpoRecurrente = z.object(
  {
    tipo: z.enum(TIPOS_MOVIMIENTO, { error: "TIPO_MOVIMIENTO_INVALIDO" }),
    concepto: z.string({ error: "CONCEPTO_REQUERIDO" }),
    monto,
    variable: z.boolean({ error: "ENTRADA_INVALIDA" }),
    periodicidad: z.enum(PERIODICIDADES, { error: "PERIODICIDAD_INVALIDA" }),
    primerVencimiento: fecha,
    ultimoDia: z
      .boolean({ error: "ENTRADA_INVALIDA" })
      .optional()
      .transform((u) => u ?? false),
    cuentaOrigenId: idOpcional,
    cuentaDestinoId: idOpcional,
    categoriaId: idOpcional,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoRecurrente = z.output<typeof cuerpoRecurrente>;

export const cuerpoPausa = z.object(
  { pausada: z.boolean({ error: "ENTRADA_INVALIDA" }) },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoPausa = z.output<typeof cuerpoPausa>;

/** Sin monto, se usa el importe mostrado. Con monto, debe ser mayor que cero (N-25). */
export const cuerpoConfirmar = z.object(
  {
    vencimiento: fecha,
    monto: monto
      .refine((m) => m > 0n, { error: "MONTO_REQUERIDO" })
      .optional()
      .transform((m) => m ?? null),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoConfirmar = z.output<typeof cuerpoConfirmar>;

export const cuerpoOmitir = z.object({ vencimiento: fecha }, { error: "ENTRADA_INVALIDA" });
export type CuerpoOmitir = z.output<typeof cuerpoOmitir>;

export const idRecurrente = z.uuid({ error: "ENTRADA_INVALIDA" });

/** `:vencimiento` de la ruta; el error lleva `campo: "vencimiento"`. */
export const vencimientoRuta = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA", path: ["vencimiento"] });
