/**
 * Tarjeta del diseño (SPEC 14): cupo 4.000.000, corte 15, pago 30, saldo al
 * 15 oct 1.217.980, pago de 620.000 el 28 oct, 11 consumos y 2 cargos.
 */
import type { Movimiento, Ref } from "../movimiento/movimiento.js";

export const TARJETA: Ref = { id: "tarjeta", nombre: "Tarjeta de crédito" };
export const BANCO: Ref = { id: "banco", nombre: "Bancolombia" };
export const EFECTIVO: Ref = { id: "efectivo", nombre: "Efectivo" };
export const INTERESES: Ref = { id: "cat-intereses", nombre: "Intereses" };
export const CUOTA: Ref = { id: "cat-cuota", nombre: "Cuota de manejo" };

let n = 0;

export function movimiento(
  datos: Partial<Movimiento> & Pick<Movimiento, "tipo" | "monto" | "fecha">,
): Movimiento {
  n++;
  return {
    id: `t${String(n).padStart(3, "0")}`,
    moneda: "COP",
    montoDestino: null,
    tasa: "1",
    descripcion: null,
    nota: null,
    cuentaOrigen: null,
    cuentaDestino: null,
    categoria: null,
    partes: [],
    creadoEn: new Date(`${datos.fecha}T12:00:00Z`),
    actualizadoEn: new Date(`${datos.fecha}T12:00:00Z`),
    ...datos,
  };
}

/** Gasto con la tarjeta. */
export const consumo = (fecha: string, descripcion: string, monto: number, categoria?: Ref) =>
  movimiento({
    tipo: "gasto",
    monto: BigInt(monto),
    fecha,
    descripcion,
    cuentaOrigen: TARJETA,
    categoria: categoria ?? null,
  });

/**
 * Saldo inicial 0 y consumos hasta el 15 oct por 1.217.980, para llegar al
 * saldo al corte anterior del diseño.
 */
export function tarjetaDelDisenio(): Movimiento[] {
  n = 0;
  return [
    consumo("2026-09-20", "Compras anteriores", 1_217_980),
    movimiento({
      tipo: "transferencia",
      monto: 620_000n,
      fecha: "2026-10-28",
      descripcion: "Pago desde Bancolombia",
      cuentaOrigen: BANCO,
      cuentaDestino: TARJETA,
    }),
    consumo("2026-10-17", "Rappi · restaurante", 46_900),
    consumo("2026-10-19", "Mercado D1", 87_400),
    consumo("2026-10-23", "Cine Procinal", 38_000),
    consumo("2026-10-25", "Mensualidad Apple", 3_900),
    consumo("2026-10-26", "Falabella", 189_900),
    consumo("2026-10-30", "Netflix", 26_900),
    consumo("2026-11-01", "Spotify", 16_900),
    consumo("2026-11-02", "Droguería Cruz Verde", 23_450),
    consumo("2026-11-04", "Mercado D1", 87_400),
    consumo("2026-11-07", "Uber", 18_700),
    consumo("2026-11-09", "Restaurante Wok", 112_000),
    consumo("2026-10-16", "Cuota de manejo", 26_990, CUOTA),
    consumo("2026-10-16", "Intereses corrientes · 1,98 % M.V.", 7_880, INTERESES),
  ];
}

export const CLASES = new Map([
  [INTERESES.id, "intereses" as const],
  [CUOTA.id, "cuota_manejo" as const],
]);
