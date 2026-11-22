import type { MovimientoEntrada } from "./movimiento.js";

export type CodigoErrorMovimiento =
  | "MONTO_REQUERIDO"
  | "ORIGEN_REQUERIDO"
  | "DESTINO_REQUERIDO"
  | "ORIGEN_NO_PERMITIDO"
  | "DESTINO_NO_PERMITIDO"
  | "CUENTAS_IGUALES"
  | "CATEGORIA_NO_PERMITIDA"
  | "DIVISION_NO_PERMITIDA"
  | "PARTES_CON_CATEGORIA"
  | "PARTES_INSUFICIENTES"
  | "PARTES_REPETIDAS"
  | "PARTES_NO_SUMAN"
  | "MONTO_INVALIDO"
  | "MONTO_DESTINO_NO_PERMITIDO";

export type ErrorMovimiento = { codigo: CodigoErrorMovimiento; campo: string };

const informado = (id: string | null): id is string => id !== null && id !== "";

const error = (codigo: CodigoErrorMovimiento, campo: string): ErrorMovimiento => ({
  codigo,
  campo,
});

/**
 * Forma del movimiento según su tipo. Devuelve el primer error o `null`.
 *
 * - Gasto: origen, sin destino. Ingreso: destino, sin origen.
 * - Transferencia (RN-03, RN-05): origen y destino distintos, sin categoría ni división.
 * - La categoría es opcional («sin clasificar»).
 * - División: sin categoría propia, dos o más partes con monto > 0, categorías
 *   distintas, que sumen el monto.
 * - `montoDestino` (SPEC 10): solo en una transferencia, y > 0. Si las monedas
 *   exigen o rechazan el segundo monto lo decide la base, que conoce las cuentas.
 *
 * Una cadena vacía cuenta como cuenta no informada. Que las cuentas y
 * categorías existan, sean del usuario y del tipo lo garantiza la base.
 */
export function validarMovimiento(m: MovimientoEntrada): ErrorMovimiento | null {
  if (m.monto <= 0n) return error("MONTO_REQUERIDO", "monto");
  if (m.montoDestino !== null) {
    if (m.tipo !== "transferencia") return error("MONTO_DESTINO_NO_PERMITIDO", "montoDestino");
    if (m.montoDestino <= 0n) return error("MONTO_INVALIDO", "montoDestino");
  }

  const origen = informado(m.cuentaOrigenId);
  const destino = informado(m.cuentaDestinoId);
  const partes = m.partes ?? [];

  switch (m.tipo) {
    case "gasto":
      if (!origen) return error("ORIGEN_REQUERIDO", "cuentaOrigenId");
      if (destino) return error("DESTINO_NO_PERMITIDO", "cuentaDestinoId");
      break;
    case "ingreso":
      if (!destino) return error("DESTINO_REQUERIDO", "cuentaDestinoId");
      if (origen) return error("ORIGEN_NO_PERMITIDO", "cuentaOrigenId");
      break;
    case "transferencia":
      if (!origen) return error("ORIGEN_REQUERIDO", "cuentaOrigenId");
      if (!destino) return error("DESTINO_REQUERIDO", "cuentaDestinoId");
      if (m.cuentaOrigenId === m.cuentaDestinoId) {
        return error("CUENTAS_IGUALES", "cuentaDestinoId");
      }
      if (informado(m.categoriaId)) return error("CATEGORIA_NO_PERMITIDA", "categoriaId");
      if (partes.length > 0) return error("DIVISION_NO_PERMITIDA", "partes");
      return null;
  }

  if (partes.length === 0) return null;
  if (informado(m.categoriaId)) return error("PARTES_CON_CATEGORIA", "partes");
  if (partes.length < 2) return error("PARTES_INSUFICIENTES", "partes");

  const vistas = new Set<string>();
  let total = 0n;
  for (const [i, parte] of partes.entries()) {
    if (parte.monto <= 0n) return error("MONTO_REQUERIDO", `partes.${i}.monto`);
    if (vistas.has(parte.categoriaId)) return error("PARTES_REPETIDAS", "partes");
    vistas.add(parte.categoriaId);
    total += parte.monto;
  }
  if (total !== m.monto) return error("PARTES_NO_SUMAN", "partes");
  return null;
}
