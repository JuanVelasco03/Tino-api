/**
 * Datos del diseño (referencias/export-deudas): Camila (otorgado, 1 %),
 * Mamá (contraída, sin intereses) y Andrés (otorgado, saldado). Hoy es
 * 2026-11-11.
 */
import type { Ref } from "../movimiento/movimiento.js";
import type {
  InteresDePrestamo,
  MovimientoDePrestamo,
  Prestamo,
  TipoPrestamo,
} from "./prestamo.js";

export const HOY = "2026-11-11";

export const NEQUI: Ref = { id: "nequi", nombre: "Nequi" };
export const BANCOLOMBIA: Ref = { id: "bancolombia", nombre: "Bancolombia" };
export const EFECTIVO: Ref = { id: "efectivo", nombre: "Efectivo" };
export const OTROS_GASTOS: Ref = { id: "otros-gastos", nombre: "Otros gastos" };

let secuencia = 0;

/** creadoEn creciente: dos movimientos del mismo día quedan en orden de alta. */
function instante(fecha: string): Date {
  secuencia += 1;
  return new Date(`${fecha}T12:00:${String(secuencia % 60).padStart(2, "0")}Z`);
}

export function prestamo(id: string, tipo: TipoPrestamo, extra: Partial<Prestamo> = {}): Prestamo {
  return {
    id,
    nombre: id,
    tipo,
    tasaCpb: 0,
    fechaAcordada: null,
    creadoEn: new Date("2026-01-01T00:00:00Z"),
    ...extra,
  };
}

/** Transferencia entre la cuenta propia y el préstamo. */
export function transferencia(
  id: string,
  fecha: string,
  monto: bigint,
  origen: Ref,
  destino: Ref,
): MovimientoDePrestamo {
  return {
    id,
    tipo: "transferencia",
    monto,
    fecha,
    creadoEn: instante(fecha),
    cuentaOrigenId: origen.id,
    cuentaDestinoId: destino.id,
    cuentaOrigen: origen,
    cuentaDestino: destino,
    categoria: null,
  };
}

/** Condonación: gasto con origen el préstamo. */
export function condonacion(
  id: string,
  fecha: string,
  monto: bigint,
  p: Ref,
): MovimientoDePrestamo {
  return {
    id,
    tipo: "gasto",
    monto,
    fecha,
    creadoEn: instante(fecha),
    cuentaOrigenId: p.id,
    cuentaDestinoId: null,
    cuentaOrigen: p,
    cuentaDestino: null,
    categoria: OTROS_GASTOS,
  };
}

export function interes(
  movimientoId: string,
  fecha: string,
  monto: bigint,
  movimientoCapitalId: string | null,
  cuenta: Ref = NEQUI,
): InteresDePrestamo {
  return { movimientoId, movimientoCapitalId, monto, fecha, creadoEn: instante(fecha), cuenta };
}

export const ref = (p: Prestamo): Ref => ({ id: p.id, nombre: p.nombre });

// Camila: le prestaste 600.000 desde Nequi; abonó 100.000 + 12.000 de interés.
export const camila = prestamo("camila", "prestamo_otorgado", {
  nombre: "Camila",
  tasaCpb: 100,
  fechaAcordada: "2026-10-15",
});
export const movimientosCamila = [
  transferencia("c-desembolso", "2026-08-14", 600000n, NEQUI, ref(camila)),
  transferencia("c-abono", "2026-10-02", 100000n, ref(camila), NEQUI),
];
export const interesesCamila = [interes("c-interes", "2026-10-02", 12000n, "c-abono")];

// Mamá: te prestó 900.000 a Bancolombia; vas abonando.
export const mama = prestamo("mama", "deuda_contraida", {
  nombre: "Mamá",
  fechaAcordada: "2026-06-30",
});
export const movimientosMama = [
  transferencia("m-desembolso", "2026-03-03", 900000n, ref(mama), BANCOLOMBIA),
  transferencia("m-abono-1", "2026-04-30", 200000n, BANCOLOMBIA, ref(mama)),
  transferencia("m-abono-2", "2026-06-30", 100000n, BANCOLOMBIA, ref(mama)),
  transferencia("m-abono-3", "2026-11-06", 100000n, NEQUI, ref(mama)),
];

// Andrés: le prestaste 80.000 en efectivo; pagó todo.
export const andres = prestamo("andres", "prestamo_otorgado", { nombre: "Andrés" });
export const movimientosAndres = [
  transferencia("a-desembolso", "2026-09-02", 80000n, EFECTIVO, ref(andres)),
  transferencia("a-abono", "2026-09-20", 80000n, ref(andres), NEQUI),
];
