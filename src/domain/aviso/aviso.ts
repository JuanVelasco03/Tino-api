/**
 * Avisos (SPEC 12). No se guardan: se derivan al leer desde las fuentes vivas
 * (plantillas y cierres, préstamos y sus movimientos, activos manuales y sus
 * precios), como las ocurrencias de SPEC 07. Solo se guarda lo que decide el
 * usuario: la marca de leído de cada aviso, por su clave, y la antelación por
 * tipo.
 *
 * Fechas "YYYY-MM-DD" en la zona del perfil. Montos `bigint` en unidades
 * menores; todos los avisos con monto son COP (SPEC 07, SPEC 08).
 */
import type { Ref } from "../movimiento/movimiento.js";

/** Espejo de la lista de tipos de la migración `..._avisos.sql`. */
export const TIPOS_AVISO = ["recurrente", "cobro", "deuda", "precio_manual"] as const;

export type TipoAviso = (typeof TIPOS_AVISO)[number];

/**
 * Opciones de `dias` por tipo. Espejo de `avisos_config_dias_check`.
 * - recurrente: días de antelación al vencimiento;
 * - cobro: cada cuántos días se repite desde la fecha acordada (0 = nunca);
 * - deuda: días de antelación a la fecha acordada;
 * - precio_manual: días sin precio nuevo.
 */
export const OPCIONES_DIAS = {
  recurrente: [1, 3, 5, 7],
  cobro: [0, 14, 30],
  deuda: [1, 3, 7],
  precio_manual: [3, 7, 14],
} as const satisfies Record<TipoAviso, readonly number[]>;

/** Configuración de un tipo sin fila en `avisos_config`. */
export const CONFIG_POR_DEFECTO = {
  recurrente: { activo: true, dias: 3 },
  cobro: { activo: true, dias: 30 },
  deuda: { activo: true, dias: 7 },
  precio_manual: { activo: false, dias: 7 },
} as const satisfies Record<TipoAviso, { activo: boolean; dias: number }>;

/** Hora local desde la que aparece el aviso del día. Fija. */
export const HORA_AVISOS = "08:00";

/** Días de historial: un aviso más viejo no sale en la lista. */
export const HISTORIAL_DIAS = 60;

export function esTipoAviso(valor: string): valor is TipoAviso {
  return (TIPOS_AVISO as readonly string[]).includes(valor);
}

export type ConfigAviso = { tipo: TipoAviso; activo: boolean; dias: number };

export type MarcaLeido = { clave: string; leido: boolean };

/** El momento del cálculo: `hoy = fechaLocal(ahora, zona)`. */
export type Contexto = { ahora: Date; zona: string; hoy: string };

export type AvisoBase = { clave: string; tipo: TipoAviso; instante: Date; resuelto: boolean };

export type AvisoRecurrente = AvisoBase & {
  tipo: "recurrente";
  recurrenteId: string;
  vencimiento: string;
  monto: bigint;
  estimado: boolean;
  resolucion: { forma: "confirmada" | "omitida"; fecha: string } | null;
};

export type ResolucionPrestamo = {
  forma: "abono" | "condonacion";
  fecha: string;
  monto: bigint;
  /** La cuenta propia; null en condonación. */
  cuenta: Ref | null;
};

export type AvisoCobro = AvisoBase & {
  tipo: "cobro";
  prestamoId: string;
  fechaAcordada: string;
  recordatorio: string;
  monto: bigint;
  proximoRecordatorio: string | null;
  resolucion: ResolucionPrestamo | null;
};

export type AvisoDeuda = AvisoBase & {
  tipo: "deuda";
  prestamoId: string;
  fechaAcordada: string;
  monto: bigint;
  resolucion: ResolucionPrestamo | null;
};

export type AvisoPrecio = AvisoBase & {
  tipo: "precio_manual";
  activoId: string;
  cuentaId: string;
  precioFecha: string;
  resolucion: { fecha: string } | null;
};

export type Aviso = AvisoRecurrente | AvisoCobro | AvisoDeuda | AvisoPrecio;

/** Un aviso visible, con su leído efectivo. */
export type AvisoVisible = Aviso & { leido: boolean };
