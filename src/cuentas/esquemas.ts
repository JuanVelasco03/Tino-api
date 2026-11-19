/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. Las reglas de negocio viven en `domain/cuenta/`.
 */
import { z } from "zod";
import { TIPOS_EN_ALCANCE } from "../domain/cuenta/cuenta.js";

const nombre = z
  .string({ error: "NOMBRE_REQUERIDO" })
  .trim()
  .min(1, { error: "NOMBRE_REQUERIDO" })
  .max(60, { error: "NOMBRE_LARGO" });

const tipo = z.enum(TIPOS_EN_ALCANCE, { error: "TIPO_INVALIDO" });

/** Texto libre ≤ 60; vacío equivale a no informado. */
const detalle = z
  .string({ error: "ENTRADA_INVALIDA" })
  .trim()
  .max(60, { error: "DETALLE_LARGO" })
  .transform((d) => (d === "" ? null : d));

/** Entero en unidades menores, como string: `"1284300"`. */
const monto = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

export const idCuenta = z.uuid({ error: "ENTRADA_INVALIDA" });

export const cuerpoAlta = z.object(
  {
    nombre,
    tipo,
    detalle: detalle.optional(),
    saldoInicial: monto,
    cupo: monto.optional(),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAlta = z.output<typeof cuerpoAlta>;

export const cuerpoEdicion = z
  .object(
    {
      nombre: nombre.optional(),
      tipo: tipo.optional(),
      detalle: detalle.nullable().optional(),
      saldoInicial: monto.optional(),
      cupo: monto.optional(),
    },
    { error: "ENTRADA_INVALIDA" },
  )
  .refine((c) => Object.values(c).some((v) => v !== undefined), { error: "SIN_CAMBIOS" });
export type CuerpoEdicion = z.output<typeof cuerpoEdicion>;

export const cuerpoOrden = z.object(
  {
    naturaleza: z.enum(["activo", "pasivo"], { error: "ENTRADA_INVALIDA" }),
    ids: z.array(z.uuid({ error: "ENTRADA_INVALIDA" }), { error: "ENTRADA_INVALIDA" }),
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoOrden = z.output<typeof cuerpoOrden>;

/** El cuerpo es opcional: sin cuerpo, se restaura con el nombre actual. */
export const cuerpoRestaurar = z
  .object({ nombre: nombre.optional() }, { error: "ENTRADA_INVALIDA" })
  .optional()
  .transform((c) => c ?? {});
export type CuerpoRestaurar = z.output<typeof cuerpoRestaurar>;
