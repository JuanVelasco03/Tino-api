/**
 * Contrato HTTP de avisos (SPEC 12). Montos como string de entero en unidades
 * menores (todos COP); fechas "YYYY-MM-DD" en la zona del usuario; instantes
 * ISO 8601 UTC. La API manda campos, no frases: el cliente arma el título, el
 * detalle, la acción, el plazo y el grupo.
 */
import type { TipoAviso } from "../domain/aviso/aviso.js";
import type { Ref, TipoMovimiento } from "../domain/movimiento/movimiento.js";

export type AvisoBaseDto = {
  /** "recurrente:<uuid>:2026-11-25" */
  clave: string;
  tipo: TipoAviso;
  /** ISO UTC: disparo a las 08:00 locales, o la creación de la fuente. */
  instante: string;
  leido: boolean;
  /** true → sin acción (N-24). */
  resuelto: boolean;
};

export type AvisoRecurrenteDto = AvisoBaseDto & {
  tipo: "recurrente";
  recurrente: { id: string; concepto: string; tipo: TipoMovimiento; variable: boolean };
  vencimiento: string;
  /** Origen, o destino en un ingreso. */
  cuenta: Ref | null;
  /** Pagada: el del movimiento; si no, el importe mostrado. */
  monto: string;
  /** Variable y no pagada → «≈». */
  estimado: boolean;
  resolucion: { forma: "confirmada" | "omitida"; fecha: string } | null;
};

export type ResolucionPrestamoDto = {
  forma: "abono" | "condonacion";
  fecha: string;
  monto: string;
  cuenta: Ref | null;
};

export type AvisoCobroDto = AvisoBaseDto & {
  tipo: "cobro";
  /** La persona. */
  prestamo: Ref;
  fechaAcordada: string;
  /** = fechaAcordada en el primero. */
  recordatorio: string;
  /** Resuelto: el abono; si no, capital pendiente de hoy. */
  monto: string;
  /** Hoy. */
  capitalPendiente: string;
  proximoRecordatorio: string | null;
  resolucion: ResolucionPrestamoDto | null;
};

export type AvisoDeudaDto = AvisoBaseDto & {
  tipo: "deuda";
  prestamo: Ref;
  fechaAcordada: string;
  /** Resuelto: el abono; si no, capital pendiente de hoy. */
  monto: string;
  /** Hoy («Quedan 500.000»). */
  capitalPendiente: string;
  resolucion: ResolucionPrestamoDto | null;
};

export type AvisoPrecioDto = AvisoBaseDto & {
  tipo: "precio_manual";
  activo: { id: string; simbolo: string; nombre: string };
  inversion: Ref;
  precioFecha: string;
  resolucion: { fecha: string } | null;
};

export type AvisoDto = AvisoRecurrenteDto | AvisoCobroDto | AvisoDeudaDto | AvisoPrecioDto;

export type AvisoConfigDto = { tipo: TipoAviso; activo: boolean; dias: number; opciones: number[] };

export type AvisosDto = {
  fechaHoy: string;
  /** IANA, la del perfil. */
  zonaHoraria: string;
  horaAvisos: "08:00";
  noLeidos: number;
  /** Visibles, en orden. */
  avisos: AvisoDto[];
  /** En el orden de TIPOS_AVISO. */
  config: AvisoConfigDto[];
};

export type ConteoAvisosDto = { noLeidos: number };
