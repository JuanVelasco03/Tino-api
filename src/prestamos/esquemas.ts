/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. Las reglas (nombre, tasa, fechas, capital) las valida
 * `domain/prestamo/validar.ts`.
 */
import { z } from "zod";
import { esFechaValida } from "../domain/fecha/mes.js";

/** Entero en unidades menores, como string. Ausente → MONTO_REQUERIDO; mal formado → MONTO_INVALIDO. */
const monto = z
  .string({ error: (issue) => (issue.input === undefined ? "MONTO_REQUERIDO" : "MONTO_INVALIDO") })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

/** Capital o interés de un abono: entero ≥ 0, obligatorio. */
const parteAbono = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

const fecha = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA" });

/** Ausente → undefined (hoy, lo resuelve el servicio). */
const fechaOpcional = fecha.optional();

const cuentaId = z.uuid({ error: "CUENTA_INVALIDA" });

export const idPrestamo = z.uuid({ error: "ENTRADA_INVALIDA" });

/** POST /prestamos. */
export const cuerpoPrestamo = z.object(
  {
    tipo: z.string({ error: "TIPO_INVALIDO" }),
    nombre: z.string({ error: "NOMBRE_REQUERIDO" }),
    monto,
    cuentaId,
    fecha: fechaOpcional,
    tasaMensual: z.string({ error: "TASA_INVALIDA" }).optional(),
    fechaAcordada: z
      .string({ error: "FECHA_INVALIDA" })
      .nullish()
      .transform((f) => f ?? null),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoPrestamo = z.output<typeof cuerpoPrestamo>;

/** POST /prestamos/:id/desembolsos. */
export const cuerpoDesembolso = z.object(
  { monto, cuentaId, fecha: fechaOpcional },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoDesembolso = z.output<typeof cuerpoDesembolso>;

/** PATCH /prestamos/:id. `fechaAcordada: null` la quita; ausente no la toca. */
export const cuerpoCambio = z.object(
  {
    nombre: z.string({ error: "NOMBRE_REQUERIDO" }).optional(),
    fechaAcordada: z.string({ error: "FECHA_INVALIDA" }).nullable().optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoCambio = z.output<typeof cuerpoCambio>;

/** GET /prestamos/:id/propuesta-abono?fecha=&monto=. */
export const consultaPropuesta = z.object({ fecha, monto }, { error: "ENTRADA_INVALIDA" });
export type ConsultaPropuesta = z.output<typeof consultaPropuesta>;

/** POST /prestamos/:id/abonos. `categoriaInteresId` ausente → «Intereses»; null → sin categoría. */
export const cuerpoAbono = z.object(
  {
    cuentaId,
    fecha,
    capital: parteAbono,
    interes: parteAbono,
    categoriaInteresId: z.uuid({ error: "CATEGORIA_INVALIDA" }).nullable().optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAbono = z.output<typeof cuerpoAbono>;

/** POST /prestamos/:id/condonaciones. */
export const cuerpoCondonacion = z.object(
  { monto, categoriaId: z.uuid({ error: "CATEGORIA_INVALIDA" }) },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoCondonacion = z.output<typeof cuerpoCondonacion>;
