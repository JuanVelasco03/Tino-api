/**
 * Validaciones de inversiones (SPEC 10). Cada función devuelve el primer error
 * o `null`. La forma del cuerpo (tipos, montos enteros) la valida Zod; que la
 * cuenta y el activo existan y sean del usuario, la base.
 */
import type { EfectoMovimiento } from "../cuenta/saldo.js";
import { esFechaValida } from "../fecha/mes.js";
import { parsearCantidad } from "./cantidad.js";
import type { TipoMovimientoGuardado } from "../movimiento/movimiento.js";
import type { Cobertura } from "../precio/precio.js";
import {
  TIPO_INVERSION,
  UNIDAD,
  dividirRedondeando,
  esClaseOperacion,
  esMoneda,
  type Moneda,
  type Operacion,
} from "./inversion.js";

export const NOMBRE_INVERSION_MAXIMO = 60;
export const NOMBRE_ACTIVO_MAXIMO = 80;

const FORMATO_SIMBOLO = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

export type CodigoErrorInversion =
  | "ENTRADA_INVALIDA"
  | "NOMBRE_REQUERIDO"
  | "NOMBRE_LARGO"
  | "MONEDA_INVALIDA"
  | "MONTO_REQUERIDO"
  | "MONTO_INVALIDO"
  | "SIMBOLO_INVALIDO"
  | "CANTIDAD_INVALIDA"
  | "FECHA_INVALIDA"
  | "FECHA_FUTURA"
  | "ACTIVO_DUPLICADO"
  | "PRECIO_INVALIDO"
  | "SIN_CAMBIOS"
  | "EFECTIVO_INSUFICIENTE"
  | "CANTIDAD_INSUFICIENTE"
  | "CUENTA_DE_INVERSION"
  | "MONTO_DESTINO_REQUERIDO"
  | "MONTO_DESTINO_NO_PERMITIDO";

export type ErrorInversion = { codigo: CodigoErrorInversion; campo?: string };

const error = (codigo: CodigoErrorInversion, campo?: string): ErrorInversion =>
  campo === undefined ? { codigo } : { codigo, campo };

/** Recorta y pasa a mayúsculas: "  voo " → "VOO". `null` si no es un símbolo válido. */
export function normalizarSimbolo(texto: string): string | null {
  const simbolo = texto.trim().toUpperCase();
  return FORMATO_SIMBOLO.test(simbolo) ? simbolo : null;
}

function validarNombre(nombre: string, maximo: number, campo: string): ErrorInversion | null {
  const recortado = nombre.trim();
  if (recortado === "") return error("NOMBRE_REQUERIDO", campo);
  if (recortado.length > maximo) return error("NOMBRE_LARGO", campo);
  return null;
}

function validarFecha(fecha: string, hoy: string, campo: string): ErrorInversion | null {
  if (!esFechaValida(fecha)) return error("FECHA_INVALIDA", campo);
  if (fecha > hoy) return error("FECHA_FUTURA", campo);
  return null;
}

/** Primer precio de un activo nuevo: `monto × 10⁸ ÷ cantidad`. `null` si da 0 (PRECIO_INVALIDO). */
export function primerPrecio(monto: bigint, cantidad: bigint): bigint | null {
  if (cantidad <= 0n) return null;
  const precio = dividirRedondeando(monto * UNIDAD, cantidad);
  return precio > 0n ? precio : null;
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export type OperacionEntrada = {
  clase: string;
  simbolo: string;
  /** Obligatorio solo si el activo es nuevo; eso lo decide la base (NOMBRE_REQUERIDO). */
  nombre: string | null;
  cantidad: string;
  monto: bigint;
  /** Ya resuelta: hoy si no vino. */
  fecha: string;
};

/**
 * Clase válida, símbolo, nombre de 1 a 80 si viene, cantidad > 0 con hasta 8
 * decimales, monto > 0, fecha válida y no futura, y un primer precio > 0.
 * `prefijo`: ruta del objeto en el cuerpo, para el `campo` ("posiciones.0.").
 */
export function validarOperacion(
  e: OperacionEntrada,
  hoy: string,
  prefijo = "",
  campoMonto = "monto",
): ErrorInversion | null {
  if (!esClaseOperacion(e.clase)) return error("ENTRADA_INVALIDA", `${prefijo}clase`);
  if (normalizarSimbolo(e.simbolo) === null) return error("SIMBOLO_INVALIDO", `${prefijo}simbolo`);
  if (e.nombre !== null) {
    const nombre = validarNombre(e.nombre, NOMBRE_ACTIVO_MAXIMO, `${prefijo}nombre`);
    if (nombre) return nombre;
  }
  const cantidad = parsearCantidad(e.cantidad);
  if (cantidad === null) return error("CANTIDAD_INVALIDA", `${prefijo}cantidad`);
  if (e.monto <= 0n) return error("MONTO_REQUERIDO", `${prefijo}${campoMonto}`);
  const fecha = validarFecha(e.fecha, hoy, `${prefijo}fecha`);
  if (fecha) return fecha;
  if (primerPrecio(e.monto, cantidad) === null) return error("PRECIO_INVALIDO", "precio");
  return null;
}

export type CambioOperacion = { cantidad?: string; monto?: bigint; fecha?: string };

/** Al menos un campo, con las mismas reglas que al crear. */
export function validarCambioOperacion(c: CambioOperacion, hoy: string): ErrorInversion | null {
  if (c.cantidad === undefined && c.monto === undefined && c.fecha === undefined) {
    return error("SIN_CAMBIOS");
  }
  if (c.cantidad !== undefined && parsearCantidad(c.cantidad) === null) {
    return error("CANTIDAD_INVALIDA", "cantidad");
  }
  if (c.monto !== undefined && c.monto <= 0n) return error("MONTO_REQUERIDO", "monto");
  if (c.fecha !== undefined) return validarFecha(c.fecha, hoy, "fecha");
  return null;
}

/**
 * Nombre de un activo nuevo (SPEC 11): con el del usuario gana el del
 * usuario; sin él, el del proveedor si cubre el símbolo, recortado a 80. Sin
 * ninguno, `null` (NOMBRE_REQUERIDO).
 */
export function nombreDeActivo(nombre: string | null, cobertura: Cobertura): string | null {
  if (nombre !== null && nombre.trim() !== "") return nombre.trim();
  if (!cobertura.cubierto) return null;
  const delProveedor = cobertura.nombre.trim().slice(0, NOMBRE_ACTIVO_MAXIMO).trim();
  return delProveedor === "" ? null : delProveedor;
}

/** Precio manual entero > 0. */
export function validarPrecio(precio: bigint): ErrorInversion | null {
  return precio > 0n ? null : error("PRECIO_INVALIDO", "precio");
}

// ---------------------------------------------------------------------------
// Alta de inversión
// ---------------------------------------------------------------------------

export type PosicionInicialEntrada = {
  simbolo: string;
  /** Opcional si el proveedor cubre el símbolo (SPEC 11): lo decide `nombreDeActivo`. */
  nombre: string | null;
  cantidad: string;
  costo: bigint;
  fecha: string;
};

export type AltaInversionEntrada = {
  nombre: string;
  moneda: string;
  efectivoInicial: bigint;
  posiciones: readonly PosicionInicialEntrada[];
};

/**
 * Nombre de 1 a 60, moneda COP o USD, efectivo inicial ≥ 0 y cada posición
 * como una operación `inicial`, sin símbolos repetidos.
 */
export function validarAltaInversion(e: AltaInversionEntrada, hoy: string): ErrorInversion | null {
  const nombre = validarNombre(e.nombre, NOMBRE_INVERSION_MAXIMO, "nombre");
  if (nombre) return nombre;
  if (!esMoneda(e.moneda)) return error("MONEDA_INVALIDA", "moneda");
  if (e.efectivoInicial < 0n) return error("MONTO_INVALIDO", "efectivoInicial");

  const vistos = new Set<string>();
  for (const [i, p] of e.posiciones.entries()) {
    const invalida = validarOperacion(
      {
        clase: "inicial",
        simbolo: p.simbolo,
        nombre: p.nombre,
        cantidad: p.cantidad,
        monto: p.costo,
        fecha: p.fecha,
      },
      hoy,
      `posiciones.${i}.`,
      "costo",
    );
    if (invalida) return invalida;
    const simbolo = normalizarSimbolo(p.simbolo)!;
    if (vistos.has(simbolo)) return error("ACTIVO_DUPLICADO", "posiciones");
    vistos.add(simbolo);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Línea de tiempo (N-65)
// ---------------------------------------------------------------------------

/** Lo que mueve el efectivo en un día, con signo (entrada +, salida −). */
export type MovimientoDeCaja = { fecha: string; delta: bigint };

export type OperacionEnLinea = Pick<
  Operacion,
  "activoId" | "clase" | "cantidad" | "monto" | "fecha"
>;

export type LineaDeTiempo = {
  saldoInicial: bigint;
  movimientos: readonly MovimientoDeCaja[];
  operaciones: readonly OperacionEnLinea[];
};

/**
 * Efecto en el efectivo de la inversión `cuentaId` de cada transferencia que
 * la toca: entra `montoDestino ?? monto` y sale `monto` (es un activo).
 */
export function movimientosDeCaja(
  cuentaId: string,
  efectos: readonly (EfectoMovimiento & { fecha: string })[],
): MovimientoDeCaja[] {
  const caja: MovimientoDeCaja[] = [];
  for (const m of efectos) {
    if (m.cuentaDestinoId === cuentaId)
      caja.push({ fecha: m.fecha, delta: m.montoDestino ?? m.monto });
    if (m.cuentaOrigenId === cuentaId) caja.push({ fecha: m.fecha, delta: -m.monto });
  }
  return caja;
}

/**
 * Se agrupa por día todo lo que mueve la cuenta. El saldo inicial rige desde
 * el principio (como en el saldo, RN-01). Al cierre de cada día el efectivo
 * corrido es ≥ 0 (EFECTIVO_INSUFICIENTE) y la cantidad de cada activo es ≥ 0
 * (CANTIDAD_INSUFICIENTE).
 */
export function validarLineaDeTiempo(linea: LineaDeTiempo): ErrorInversion | null {
  const dias = new Map<string, { caja: bigint; cantidades: Map<string, bigint> }>();
  const dia = (fecha: string) => {
    let d = dias.get(fecha);
    if (!d) {
      d = { caja: 0n, cantidades: new Map() };
      dias.set(fecha, d);
    }
    return d;
  };
  for (const m of linea.movimientos) dia(m.fecha).caja += m.delta;
  for (const op of linea.operaciones) {
    const d = dia(op.fecha);
    const signo = op.clase === "venta" ? -1n : 1n;
    d.cantidades.set(op.activoId, (d.cantidades.get(op.activoId) ?? 0n) + signo * op.cantidad);
    if (op.clase === "compra") d.caja -= op.monto;
    if (op.clase === "venta") d.caja += op.monto;
  }

  let caja = linea.saldoInicial;
  if (caja < 0n) return error("EFECTIVO_INSUFICIENTE");
  const cantidades = new Map<string, bigint>();
  for (const fecha of [...dias.keys()].toSorted()) {
    const d = dias.get(fecha)!;
    caja += d.caja;
    if (caja < 0n) return error("EFECTIVO_INSUFICIENTE");
    for (const [activo, delta] of d.cantidades) {
      const cantidad = (cantidades.get(activo) ?? 0n) + delta;
      if (cantidad < 0n) return error("CANTIDAD_INSUFICIENTE", "cantidad");
      cantidades.set(activo, cantidad);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Simulación de una escritura sobre la línea de tiempo (N-65)
// ---------------------------------------------------------------------------

export type EfectoEnLinea = EfectoMovimiento & { id: string; fecha: string };

/** Lo que mueve la inversión, leído en fresco antes de escribir. */
export type EstadoLinea = {
  saldoInicial: bigint;
  /** Los movimientos que tocan la cuenta. */
  efectos: readonly EfectoEnLinea[];
  operaciones: readonly (OperacionEnLinea & { id: string })[];
};

/**
 * La escritura a simular: un movimiento creado, editado o borrado (`nuevo`
 * nulo), una operación creada, editada o borrada (`nueva` nula), o un saldo
 * inicial nuevo. Un id que no existe es una alta.
 */
export type CambioLinea = {
  movimiento?: { id: string; nuevo: EfectoEnLinea | null };
  operacion?: { id: string; nueva: (OperacionEnLinea & { id: string }) | null };
  saldoInicial?: bigint;
};

/** Aplica `cambio` al estado leído y valida la línea de tiempo de la inversión `cuentaId`. */
export function validarTrasCambio(
  cuentaId: string,
  estado: EstadoLinea,
  cambio: CambioLinea,
): ErrorInversion | null {
  let efectos = estado.efectos;
  if (cambio.movimiento) {
    const { id, nuevo } = cambio.movimiento;
    efectos = [...efectos.filter((m) => m.id !== id), ...(nuevo === null ? [] : [nuevo])];
  }
  let operaciones = estado.operaciones;
  if (cambio.operacion) {
    const { id, nueva } = cambio.operacion;
    operaciones = [...operaciones.filter((o) => o.id !== id), ...(nueva === null ? [] : [nueva])];
  }
  return validarLineaDeTiempo({
    saldoInicial: cambio.saldoInicial ?? estado.saldoInicial,
    movimientos: movimientosDeCaja(cuentaId, efectos),
    operaciones,
  });
}

// ---------------------------------------------------------------------------
// Movimientos que tocan una inversión
// ---------------------------------------------------------------------------

export type CuentaDeMovimiento = { tipo: string; moneda: Moneda };

export type MovimientoConMonedas = {
  tipo: TipoMovimientoGuardado;
  montoDestino: bigint | null;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
};

/**
 * Una inversión solo admite transferencias (CUENTA_DE_INVERSION). Entre
 * monedas distintas la transferencia exige `montoDestino`; con la misma lo
 * rechaza. Una cuenta que no está en `cuentas` (inexistente o ajena) no se
 * juzga aquí: la rechaza la base. Mismo orden que `moneda_de_movimiento`.
 */
export function validarMovimientoConInversion(
  m: MovimientoConMonedas,
  cuentas: ReadonlyMap<string, CuentaDeMovimiento>,
): ErrorInversion | null {
  const origen = m.cuentaOrigenId === null ? undefined : cuentas.get(m.cuentaOrigenId);
  const destino = m.cuentaDestinoId === null ? undefined : cuentas.get(m.cuentaDestinoId);
  if (m.tipo === "gasto" && origen?.tipo === TIPO_INVERSION) {
    return error("CUENTA_DE_INVERSION", "cuentaOrigenId");
  }
  if (m.tipo === "ingreso" && destino?.tipo === TIPO_INVERSION) {
    return error("CUENTA_DE_INVERSION", "cuentaDestinoId");
  }
  const distintas =
    m.tipo === "transferencia" &&
    origen !== undefined &&
    destino !== undefined &&
    origen.moneda !== destino.moneda;
  if (distintas && m.montoDestino === null) return error("MONTO_DESTINO_REQUERIDO", "montoDestino");
  if (!distintas && m.montoDestino !== null) {
    return error("MONTO_DESTINO_NO_PERMITIDO", "montoDestino");
  }
  return null;
}

/** Ids de las cuentas de inversión que toca el movimiento. */
export function inversionesTocadas(
  ids: readonly (string | null)[],
  cuentas: ReadonlyMap<string, CuentaDeMovimiento>,
): string[] {
  return [
    ...new Set(
      ids.filter((id): id is string => id !== null && cuentas.get(id)?.tipo === TIPO_INVERSION),
    ),
  ];
}
