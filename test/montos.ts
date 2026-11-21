/**
 * Montos cifrados en las pruebas que escriben o leen la base directamente
 * (SPEC 05). Usa el mismo `CifradorMontos` y la misma clave que la API
 * (`CLAVE_MONTOS_V1`, cargada desde `.env.local` por `vitest.config.ts`), para
 * que las filas creadas a mano sean válidas y legibles por la API.
 */
import { CifradorMontos, contexto } from "../src/repositories/cifrado/montos.js";

export { contexto };

/** Mismo formato que exige la base (restricciones `*_cifrado`). */
export const FORMATO_CIFRADO = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$/;

const clave = process.env.CLAVE_MONTOS_V1;

export const conClave = Boolean(clave);

let cache: CifradorMontos | null = null;

export function cifrador(): CifradorMontos {
  if (!clave) throw new Error("Falta CLAVE_MONTOS_V1 en .env.local: las pruebas la necesitan.");
  cache ??= new CifradorMontos(new Map([[1, Buffer.from(clave, "base64")]]));
  return cache;
}
