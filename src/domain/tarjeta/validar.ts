/**
 * Validación de las condiciones de una tarjeta (SPEC 14). La forma (tipos,
 * formato de la cuota) la valida el esquema; aquí, rangos y obligatoriedad.
 * Que la cuenta de pago sea efectivo o banco, propia y activa lo comprueban el
 * servicio y la base (`validar_tarjeta`).
 */
export type CondicionesEntrada = {
  diaCorte?: number;
  diaPago?: number;
  tasaMensual?: number | null;
  cuotaManejo?: bigint | null;
  cuentaPagoId?: string | null;
};

export type CodigoErrorTarjeta = "DIA_INVALIDO" | "TASA_INVALIDA" | "CONDICIONES_REQUERIDAS";

export type ErrorTarjeta = { codigo: CodigoErrorTarjeta; campo: string };

const esDia = (d: number): boolean => Number.isInteger(d) && d >= 1 && d <= 31;

const esTasa = (t: number): boolean => Number.isInteger(t) && t >= 0 && t <= 10_000;

/**
 * `requiereDias`: en el alta de una tarjeta, o al darle condiciones por primera
 * vez, `diaCorte` y `diaPago` son obligatorios.
 */
export function validarCondiciones(
  c: CondicionesEntrada,
  requiereDias: boolean,
): ErrorTarjeta | null {
  if (c.diaCorte !== undefined && !esDia(c.diaCorte)) {
    return { codigo: "DIA_INVALIDO", campo: "tarjeta.diaCorte" };
  }
  if (c.diaPago !== undefined && !esDia(c.diaPago)) {
    return { codigo: "DIA_INVALIDO", campo: "tarjeta.diaPago" };
  }
  if (requiereDias && (c.diaCorte === undefined || c.diaPago === undefined)) {
    return { codigo: "CONDICIONES_REQUERIDAS", campo: "tarjeta" };
  }
  if (c.tasaMensual !== undefined && c.tasaMensual !== null && !esTasa(c.tasaMensual)) {
    return { codigo: "TASA_INVALIDA", campo: "tarjeta.tasaMensual" };
  }
  return null;
}
