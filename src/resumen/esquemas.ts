/**
 * Forma de la entrada (Zod). `?mes` reutiliza el esquema de `GET /movimientos`
 * (`MES_INVALIDO`): la misma regla en las dos rutas.
 */
export { consultaMes } from "../movimientos/esquemas.js";
