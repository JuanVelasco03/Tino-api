/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. Las reglas (nombre, moneda, símbolo, cantidad, fechas,
 * precio) las valida `domain/inversion/validar.ts`.
 */
import { z } from "zod";
import { esFechaValida } from "../domain/fecha/mes.js";

/** Entero en unidades menores, como string. Ausente → MONTO_REQUERIDO; mal formado → MONTO_INVALIDO. */
const monto = z
  .string({ error: (issue) => (issue.input === undefined ? "MONTO_REQUERIDO" : "MONTO_INVALIDO") })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

const montoOpcional = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m))
  .optional();

/** Ausente → undefined (hoy, lo resuelve el servicio). */
const fechaOpcional = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA" })
  .optional();

/** La cantidad viaja como texto decimal; su formato lo valida el dominio. */
const cantidad = z.string({ error: "CANTIDAD_INVALIDA" });

const simbolo = z.string({ error: "SIMBOLO_INVALIDO" });

const uuid = z.uuid({ error: "ENTRADA_INVALIDA" });

export const idInversion = uuid;
export const idOperacion = uuid;
export const idActivo = uuid;

const posicionInicial = z.object(
  {
    simbolo,
    nombre: z.string({ error: "NOMBRE_REQUERIDO" }),
    cantidad,
    costo: monto,
    fecha: fechaOpcional,
  },
  { error: "ENTRADA_INVALIDA" },
);

/** POST /inversiones. */
export const cuerpoInversion = z.object(
  {
    nombre: z.string({ error: "NOMBRE_REQUERIDO" }),
    moneda: z.string({ error: "MONEDA_INVALIDA" }),
    efectivoInicial: montoOpcional.transform((m) => m ?? 0n),
    posiciones: z
      .array(posicionInicial, { error: "ENTRADA_INVALIDA" })
      .optional()
      .transform((p) => p ?? []),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoInversion = z.output<typeof cuerpoInversion>;

/** POST /inversiones/:id/operaciones. */
export const cuerpoOperacion = z.object(
  {
    clase: z.string({ error: "ENTRADA_INVALIDA" }),
    simbolo,
    nombre: z
      .string({ error: "NOMBRE_REQUERIDO" })
      .nullish()
      .transform((n) => n ?? null),
    cantidad,
    monto,
    fecha: fechaOpcional,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoOperacion = z.output<typeof cuerpoOperacion>;

/** PUT /inversiones/:id/operaciones/:operacionId. Al menos un campo (lo valida el dominio). */
export const cuerpoCambioOperacion = z.object(
  {
    cantidad: cantidad.optional(),
    monto: montoOpcional,
    fecha: fechaOpcional,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoCambioOperacion = z.output<typeof cuerpoCambioOperacion>;

/** POST /inversiones/:id/activos/:activoId/precios. */
export const cuerpoPrecio = z.object(
  {
    precio: z
      .string({ error: "PRECIO_INVALIDO" })
      .regex(/^\d{1,18}$/, { error: "PRECIO_INVALIDO" })
      .transform((p) => BigInt(p)),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoPrecio = z.output<typeof cuerpoPrecio>;

/** GET /inversiones/:id/operaciones?activoId=. */
export const consultaActivo = uuid.optional();
