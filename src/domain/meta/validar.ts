/**
 * Validaciones de metas de ahorro (SPEC 13). Cada función devuelve el primer
 * error o `null`. Que la cuenta sea del usuario y la exclusividad del modo
 * `cuenta` (N-56) los garantizan también la FK y `validar_meta` en la base.
 */
import { esFechaValida, esMesValido, ultimoDia } from "../fecha/mes.js";
import type { Moneda } from "../inversion/inversion.js";
import { acumuladosAlCierre } from "./avance.js";
import {
  MOTIVO_MAXIMO,
  NOMBRE_MAXIMO,
  admiteCuenta,
  esModoMeta,
  type AporteEnLinea,
  type ModoMeta,
} from "./meta.js";

export type CodigoErrorMeta =
  | "NOMBRE_INVALIDO"
  | "MONTO_INVALIDO"
  | "MODO_INVALIDO"
  | "CUENTA_INVALIDA"
  | "CUENTA_NO_ADMITIDA"
  | "CUENTA_ARCHIVADA"
  | "FECHA_INVALIDA"
  | "FECHA_META_PASADA"
  | "APORTE_INICIAL_NO_ADMITIDO"
  | "META_ARCHIVADA"
  | "META_CUMPLIDA"
  | "FECHA_ANTERIOR_A_META"
  | "FECHA_FUTURA"
  | "MOTIVO_INVALIDO"
  | "SALDO_LIBRE_INSUFICIENTE"
  | "APARTADO_INSUFICIENTE"
  | "ORIGEN_NO_ADMITIDO"
  | "ORIGEN_REQUERIDO"
  | "ORIGEN_FIJO"
  | "RETIRO_NO_ADMITIDO"
  | "META_DE_INVERSION"
  | "META_CON_APORTES"
  | "META_NO_CUMPLIDA"
  | "APARTADO_NO_CERO"
  | "META_NO_ARCHIVADA";

export type ErrorMeta = { codigo: CodigoErrorMeta; campo?: string };

const error = (codigo: CodigoErrorMeta, campo?: string): ErrorMeta =>
  campo === undefined ? { codigo } : { codigo, campo };

/** Fecha meta guardada: un mes es su último día con `esMes`. */
export type FechaMeta = { fecha: string; esMes: boolean };

/** "YYYY-MM-DD" o "YYYY-MM" válida → fecha guardada; si no, `null`. */
export function parsearFechaMeta(texto: string): FechaMeta | null {
  if (esFechaValida(texto)) return { fecha: texto, esMes: false };
  if (esMesValido(texto)) return { fecha: ultimoDia(texto), esMes: true };
  return null;
}

/** Fecha meta para el contrato: "YYYY-MM" si es mes. */
export function formatearFechaMeta(fecha: string | null, esMes: boolean): string | null {
  if (fecha === null) return null;
  return esMes ? fecha.slice(0, 7) : fecha;
}

export function validarNombre(nombre: string): ErrorMeta | null {
  const largo = nombre.trim().length;
  return largo < 1 || largo > NOMBRE_MAXIMO ? error("NOMBRE_INVALIDO", "nombre") : null;
}

/** Un monto > 0. El formato (`^\d{1,19}$`) lo valida el esquema. */
export function validarMonto(monto: bigint, campo = "monto"): ErrorMeta | null {
  return monto <= 0n ? error("MONTO_INVALIDO", campo) : null;
}

export function validarMotivo(motivo: string | null | undefined): ErrorMeta | null {
  if (motivo === null || motivo === undefined) return null;
  const largo = motivo.trim().length;
  return largo < 1 || largo > MOTIVO_MAXIMO ? error("MOTIVO_INVALIDO", "motivo") : null;
}

/** Día no anterior a hoy; mes no anterior al actual. */
export function validarFechaMeta(texto: string, hoy: string): ErrorMeta | null {
  const fecha = parsearFechaMeta(texto);
  if (fecha === null) return error("FECHA_INVALIDA", "fechaMeta");
  const pasada = fecha.esMes ? texto < hoy.slice(0, 7) : texto < hoy;
  return pasada ? error("FECHA_META_PASADA", "fechaMeta") : null;
}

/** Cuenta para una meta: del usuario, de un tipo que el modo admite, no archivada. */
export function validarCuenta(
  modo: ModoMeta,
  cuenta: { tipo: string; archivadaEn: Date | null } | null,
): ErrorMeta | null {
  if (cuenta === null) return error("CUENTA_INVALIDA", "cuentaId");
  if (!admiteCuenta(modo, cuenta.tipo)) return error("CUENTA_NO_ADMITIDA", "cuentaId");
  if (cuenta.archivadaEn !== null) return error("CUENTA_ARCHIVADA", "cuentaId");
  return null;
}

/**
 * Cuenta de origen de un aporte: del usuario, en COP, distinta de la de la
 * meta, no préstamo. Una inversión en USD no es COP. Que no esté archivada lo
 * valida `registrar_movimiento`.
 */
export function validarCuentaOrigen(
  origen: { id: string; tipo: string; moneda: Moneda } | null,
  cuentaMetaId: string,
): ErrorMeta | null {
  if (
    origen === null ||
    origen.id === cuentaMetaId ||
    origen.moneda !== "COP" ||
    origen.tipo === "prestamo_otorgado" ||
    origen.tipo === "deuda_contraida"
  ) {
    return error("CUENTA_INVALIDA", "cuentaOrigenId");
  }
  return null;
}

export type AltaEntrada = {
  nombre: string;
  modo: string;
  objetivo: bigint;
  fechaMeta: string | null;
  conAporteInicial: boolean;
};

/** Nombre, objetivo, modo, fecha meta y si admite apartado inicial. La cuenta va aparte. */
export function validarAlta(e: AltaEntrada, hoy: string): ErrorMeta | null {
  const nombre = validarNombre(e.nombre);
  if (nombre) return nombre;
  const objetivo = validarMonto(e.objetivo, "objetivo");
  if (objetivo) return objetivo;
  if (!esModoMeta(e.modo)) return error("MODO_INVALIDO", "modo");
  if (e.fechaMeta !== null) {
    const fecha = validarFechaMeta(e.fechaMeta, hoy);
    if (fecha) return fecha;
  }
  if (e.conAporteInicial && e.modo !== "apartado") {
    return error("APORTE_INICIAL_NO_ADMITIDO", "aporteInicial");
  }
  return null;
}

export type EdicionEntrada = {
  nombre?: string;
  modo?: string;
  objetivo?: bigint;
  fechaMeta?: string | null;
};

/** Mismas reglas que el alta para cada campo enviado. */
export function validarEdicion(e: EdicionEntrada, hoy: string): ErrorMeta | null {
  if (e.nombre !== undefined) {
    const nombre = validarNombre(e.nombre);
    if (nombre) return nombre;
  }
  if (e.objetivo !== undefined) {
    const objetivo = validarMonto(e.objetivo, "objetivo");
    if (objetivo) return objetivo;
  }
  if (e.modo !== undefined && !esModoMeta(e.modo)) return error("MODO_INVALIDO", "modo");
  if (e.fechaMeta !== undefined && e.fechaMeta !== null) {
    const fecha = validarFechaMeta(e.fechaMeta, hoy);
    if (fecha) return fecha;
  }
  return null;
}

/** Una cumplida o archivada no se edita. */
export function validarEditable(estado: {
  archivada: boolean;
  cumplida: boolean;
}): ErrorMeta | null {
  if (estado.archivada) return error("META_ARCHIVADA");
  if (estado.cumplida) return error("META_CUMPLIDA");
  return null;
}

/** Estado de la meta que recibe un aporte o retiro. */
export type MetaParaAporte = {
  modo: ModoMeta;
  tipoCuenta: string;
  archivada: boolean;
  cumplida: boolean;
  creadaEl: string;
};

export type AporteEntrada = {
  tipo: string;
  monto: bigint;
  fecha: string;
  motivo: string | null;
  cuentaOrigenId: string | null;
};

/**
 * Reglas de un aporte o retiro que no dependen de otras filas: meta no
 * archivada; en modo `cuenta`, sin retiros, con origen y nunca en una
 * inversión; monto, fecha entre la creación y hoy, motivo; un retiro sin
 * origen; un aporte no entra en una cumplida.
 */
export function validarAporte(
  e: AporteEntrada,
  meta: MetaParaAporte,
  hoy: string,
): ErrorMeta | null {
  if (meta.archivada) return error("META_ARCHIVADA");
  if (meta.modo === "cuenta") {
    if (e.tipo === "retiro") return error("RETIRO_NO_ADMITIDO", "tipo");
    if (meta.tipoCuenta === "inversion") return error("META_DE_INVERSION");
  }
  const monto = validarMonto(e.monto);
  if (monto) return monto;
  if (!esFechaValida(e.fecha)) return error("FECHA_INVALIDA", "fecha");
  if (e.fecha < meta.creadaEl) return error("FECHA_ANTERIOR_A_META", "fecha");
  if (e.fecha > hoy) return error("FECHA_FUTURA", "fecha");
  const motivo = validarMotivo(e.motivo);
  if (motivo) return motivo;
  if (e.tipo === "retiro" && e.cuentaOrigenId !== null) {
    return error("ORIGEN_NO_ADMITIDO", "cuentaOrigenId");
  }
  if (meta.modo === "cuenta" && e.cuentaOrigenId === null) {
    return error("ORIGEN_REQUERIDO", "cuentaOrigenId");
  }
  if (e.tipo === "aporte" && meta.cumplida) return error("META_CUMPLIDA");
  return null;
}

/** Al editar, la cuenta de origen no se agrega ni se quita. */
export function validarOrigenFijo(
  tieneOrigen: boolean,
  cuentaOrigenId: string | null,
): ErrorMeta | null {
  return tieneOrigen !== (cuentaOrigenId !== null) ? error("ORIGEN_FIJO", "cuentaOrigenId") : null;
}

/** Un aporte sin origen no supera el saldo libre (N-36). */
export function validarSaldoLibre(monto: bigint, libre: bigint): ErrorMeta | null {
  return monto > libre ? error("SALDO_LIBRE_INSUFICIENTE", "monto") : null;
}

/** Ningún día el acumulado al cierre queda negativo (N-39). */
export function validarAcumulado(aportes: readonly AporteEnLinea[]): ErrorMeta | null {
  return acumuladosAlCierre(aportes).some((d) => d.acumulado < 0n)
    ? error("APARTADO_INSUFICIENTE", "monto")
    : null;
}

/** Una meta con aportes no cambia de modo. */
export function validarCambioDeModo(
  actual: ModoMeta,
  nuevo: ModoMeta,
  cantidadAportes: number,
): ErrorMeta | null {
  return actual !== nuevo && cantidadAportes > 0 ? error("META_CON_APORTES", "modo") : null;
}

/** Solo se archiva una cumplida, y en `apartado` con apartado vigente 0. */
export function validarArchivar(estado: {
  archivada: boolean;
  cumplida: boolean;
  modo: ModoMeta;
  apartado: bigint;
}): ErrorMeta | null {
  if (estado.archivada) return error("META_ARCHIVADA");
  if (!estado.cumplida) return error("META_NO_CUMPLIDA");
  if (estado.modo === "apartado" && estado.apartado !== 0n) return error("APARTADO_NO_CERO");
  return null;
}

export function validarRestaurar(archivada: boolean): ErrorMeta | null {
  return archivada ? null : error("META_NO_ARCHIVADA");
}
