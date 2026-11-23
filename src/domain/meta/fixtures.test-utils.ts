/** Datos de prueba del dominio de metas (SPEC 13), con los ejemplos del diseño. */
import type { Aporte, TipoAporte } from "./meta.js";

let secuencia = 0;

/** Aporte o retiro sin origen. `creadoEn` creciente por defecto, para desempatar. */
export function aporte(
  monto: bigint,
  fecha: string,
  extra: Partial<Aporte> & { tipo?: TipoAporte } = {},
): Aporte {
  secuencia++;
  return {
    id: `aporte-${secuencia}`,
    metaId: "meta",
    tipo: "aporte",
    monto,
    fecha,
    motivo: null,
    inicial: false,
    movimientoId: null,
    cuentaOrigen: null,
    creadoEn: new Date(Date.UTC(2026, 0, 1, 0, 0, secuencia)),
    ...extra,
  };
}

export function retiro(monto: bigint, fecha: string, motivo: string | null = null): Aporte {
  return aporte(monto, fecha, { tipo: "retiro", motivo });
}

/** Fondo de emergencia: 7.500.000, sin fecha, creado el 15 jun 2026, hoy 11 nov 2026. */
export const FONDO = {
  objetivo: 7_500_000n,
  creadaEl: "2026-06-15",
  hoy: "2026-11-11",
  aportes: () => [
    aporte(400_000n, "2026-06-15"),
    aporte(350_000n, "2026-07-15"),
    aporte(300_000n, "2026-08-15"),
    aporte(350_000n, "2026-09-15"),
    aporte(250_000n, "2026-10-15"),
    retiro(100_000n, "2026-10-31", "arreglo de la nevera"),
    aporte(350_000n, "2026-11-10"),
  ],
};

/** Viaje a Cartagena: 1.800.000 para el 15 dic 2026, creado el 20 sep 2026. */
export const VIAJE = {
  objetivo: 1_800_000n,
  fechaMeta: "2026-12-15",
  creadaEl: "2026-09-20",
  hoy: "2026-11-11",
  aportes: () => [
    aporte(300_000n, "2026-09-20", { inicial: true }),
    aporte(150_000n, "2026-10-15", {
      movimientoId: "mov-1",
      cuentaOrigen: { id: "bancolombia", nombre: "Bancolombia" },
    }),
    aporte(150_000n, "2026-11-10", {
      movimientoId: "mov-2",
      cuentaOrigen: { id: "bancolombia", nombre: "Bancolombia" },
    }),
  ],
};

/** Arreglo de la moto: 850.000, cumplida el 12 sep y usada el 14 sep en el taller. */
export const MOTO = {
  objetivo: 850_000n,
  creadaEl: "2026-07-02",
  aportes: () => [
    aporte(250_000n, "2026-07-02", { inicial: true }),
    aporte(200_000n, "2026-07-15"),
    aporte(200_000n, "2026-08-15"),
    aporte(200_000n, "2026-09-12"),
    retiro(850_000n, "2026-09-14", "en el taller"),
  ],
};
