/** Datos de prueba del dominio de inversiones (SPEC 10). */
import type { Activo, ClaseOperacion, OrigenPrecio, Operacion, Precio } from "./inversion.js";

export const UNA = 100_000_000n;

let secuencia = 0;

export function activo(
  simbolo: string,
  creadoEn = "2026-01-01T00:00:00Z",
  extra: Partial<Activo> = {},
): Activo {
  return {
    id: `activo-${simbolo}`,
    cuentaId: "cuenta",
    simbolo,
    nombre: simbolo,
    creadoEn: new Date(creadoEn),
    cotizacion: "manual",
    clase: null,
    simboloFuente: null,
    consultadoEn: null,
    ...extra,
  };
}

/** Operación del activo `simbolo`. `creadoEn` creciente por defecto, para desempatar. */
export function op(
  simbolo: string,
  clase: ClaseOperacion,
  cantidad: bigint,
  monto: bigint,
  fecha: string,
  extra: Partial<Operacion> = {},
): Operacion {
  secuencia++;
  const creadoEn = new Date(Date.UTC(2026, 0, 1, 0, 0, secuencia));
  return {
    id: `op-${secuencia}`,
    activoId: `activo-${simbolo}`,
    clase,
    cantidad,
    monto,
    fecha,
    creadoEn,
    actualizadoEn: creadoEn,
    ...extra,
  };
}

export function precio(
  simbolo: string,
  valor: bigint,
  fecha: string,
  cotizadoEn = `${fecha}T12:00:00Z`,
  origen: OrigenPrecio = "manual",
): Precio {
  return {
    activoId: `activo-${simbolo}`,
    precio: valor,
    fecha,
    origen,
    cotizadoEn: new Date(cotizadoEn),
  };
}
