/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. Las reglas (nombre, objetivo > 0, fechas, cuentas,
 * saldo libre) las valida `domain/meta/validar.ts`.
 */
import { z } from "zod";
import { TIPOS_APORTE } from "../domain/meta/meta.js";

/** Entero en pesos, como string `^\d{1,19}$`. */
const monto = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

const cuentaOrigenId = z
  .uuid({ error: "CUENTA_INVALIDA" })
  .nullish()
  .transform((id) => id ?? null);

const motivo = z
  .string({ error: "MOTIVO_INVALIDO" })
  .nullish()
  .transform((m) => m ?? null);

const fecha = z.string({ error: "FECHA_INVALIDA" });

export const idMeta = z.uuid({ error: "ENTRADA_INVALIDA" });
export const idAporte = z.uuid({ error: "ENTRADA_INVALIDA" });

/** POST /metas. `fechaMeta`: "YYYY-MM-DD" o "YYYY-MM". */
export const cuerpoMeta = z.object(
  {
    nombre: z.string({ error: "NOMBRE_INVALIDO" }),
    cuentaId: z.uuid({ error: "CUENTA_INVALIDA" }),
    modo: z.string({ error: "MODO_INVALIDO" }),
    objetivo: monto,
    fechaMeta: z
      .string({ error: "FECHA_INVALIDA" })
      .nullish()
      .transform((f) => f ?? null),
    aporteInicial: z
      .object({ monto, cuentaOrigenId }, { error: "ENTRADA_INVALIDA" })
      .nullish()
      .transform((a) => a ?? null),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoMeta = z.output<typeof cuerpoMeta>;

/** PATCH /metas/:id. Ausente no toca el campo; `fechaMeta: null` la quita. */
export const cuerpoCambioMeta = z.object(
  {
    nombre: z.string({ error: "NOMBRE_INVALIDO" }).optional(),
    cuentaId: z.uuid({ error: "CUENTA_INVALIDA" }).optional(),
    modo: z.string({ error: "MODO_INVALIDO" }).optional(),
    objetivo: monto.optional(),
    fechaMeta: z.string({ error: "FECHA_INVALIDA" }).nullable().optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoCambioMeta = z.output<typeof cuerpoCambioMeta>;

/** POST /metas/:id/aportes. */
export const cuerpoAporte = z.object(
  {
    tipo: z.enum(TIPOS_APORTE, { error: "ENTRADA_INVALIDA" }),
    monto,
    fecha,
    cuentaOrigenId,
    motivo,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAporte = z.output<typeof cuerpoAporte>;

/** PUT /metas/:id/aportes/:aporteId. El tipo es fijo. */
export const cuerpoCambioAporte = z.object(
  { monto, fecha, cuentaOrigenId, motivo },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoCambioAporte = z.output<typeof cuerpoCambioAporte>;
