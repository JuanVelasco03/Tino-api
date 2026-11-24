/**
 * Forma de la entrada (Zod). Cada `message` es un código del catálogo de
 * `comun/error-api.ts`. La forma por tipo (cuentas, categoría, partes) la
 * valida `domain/movimiento/validar.ts`.
 */
import { z } from "zod";
import { esFechaValida, esMesValido } from "../domain/fecha/mes.js";
import { TIPOS_MOVIMIENTO, TIPOS_MOVIMIENTO_GUARDADO } from "../domain/movimiento/movimiento.js";

/** Entero en unidades menores, como string. Ausente → MONTO_REQUERIDO; mal formado → MONTO_INVALIDO. */
const monto = z
  .string({ error: (issue) => (issue.input === undefined ? "MONTO_REQUERIDO" : "MONTO_INVALIDO") })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m));

/** Lo que llegó al destino entre monedas (SPEC 10). Ausente o null → null; mal formado → MONTO_INVALIDO. */
const montoDestino = z
  .string({ error: "MONTO_INVALIDO" })
  .regex(/^\d{1,19}$/, { error: "MONTO_INVALIDO" })
  .transform((m) => BigInt(m))
  .nullish()
  .transform((m) => m ?? null);

const fecha = z
  .string({ error: "FECHA_INVALIDA" })
  .refine(esFechaValida, { error: "FECHA_INVALIDA" });

/** Texto libre opcional; vacío equivale a no informado. */
function textoOpcional(maximo: number, codigoLargo: "DESCRIPCION_LARGA" | "NOTA_LARGA") {
  return z
    .string({ error: "ENTRADA_INVALIDA" })
    .trim()
    .max(maximo, { error: codigoLargo })
    .transform((t) => (t === "" ? null : t))
    .nullish()
    .transform((t) => t ?? null);
}

/** UUID opcional; "" o ausente equivalen a null. */
const idOpcional = z
  .preprocess((v) => (v === "" ? null : v), z.uuid({ error: "ENTRADA_INVALIDA" }).nullish())
  .transform((v) => v ?? null);

const parte = z.object(
  { categoriaId: z.uuid({ error: "ENTRADA_INVALIDA" }), monto },
  { error: "ENTRADA_INVALIDA" },
);

/** Lista vacía o ausente = sin división. */
const partes = z
  .array(parte, { error: "ENTRADA_INVALIDA" })
  .nullish()
  .transform((p) => (p === undefined || p === null || p.length === 0 ? null : p));

const campos = {
  tipo: z.enum(TIPOS_MOVIMIENTO, { error: "TIPO_MOVIMIENTO_INVALIDO" }),
  monto,
  montoDestino,
  descripcion: textoOpcional(80, "DESCRIPCION_LARGA"),
  nota: textoOpcional(500, "NOTA_LARGA"),
  cuentaOrigenId: idOpcional,
  cuentaDestinoId: idOpcional,
  categoriaId: idOpcional,
  partes,
};

/** POST: sin fecha, hoy en la zona del perfil. Un ajuste no se crea aquí (SPEC 14). */
export const cuerpoAlta = z.object(
  { ...campos, fecha: fecha.optional().transform((f) => f ?? null) },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoAlta = z.output<typeof cuerpoAlta>;

/** PUT: reemplazo completo, fecha obligatoria. Admite ajustes (SPEC 14). */
export const cuerpoReemplazo = z.object(
  {
    ...campos,
    tipo: z.enum(TIPOS_MOVIMIENTO_GUARDADO, { error: "TIPO_MOVIMIENTO_INVALIDO" }),
    fecha,
  },
  { error: "ENTRADA_INVALIDA" },
);
export type CuerpoReemplazo = z.output<typeof cuerpoReemplazo>;

export const idMovimiento = z.uuid({ error: "ENTRADA_INVALIDA" });

/** `?mes=YYYY-MM`; ausente = mes actual en la zona del usuario. */
export const consultaMes = z
  .string({ error: "MES_INVALIDO" })
  .refine(esMesValido, { error: "MES_INVALIDO" })
  .optional();
