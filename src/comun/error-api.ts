/**
 * Formato único de error de la API: `{ statusCode, codigo, mensaje, campo? }`.
 * El `codigo` es estable y lo leen los clientes; el `mensaje` va en español
 * para que web y celular digan lo mismo.
 */
import { StandardSchemaValidationPipe } from "@nestjs/common";

type EntradaCatalogo = { estado: number; mensaje: string; campo?: string };

export const CATALOGO = {
  ENTRADA_INVALIDA: { estado: 400, mensaje: "Revisa los datos enviados." },
  NOMBRE_REQUERIDO: { estado: 400, mensaje: "Escribe un nombre.", campo: "nombre" },
  NOMBRE_LARGO: { estado: 400, mensaje: "El nombre admite hasta 60 caracteres.", campo: "nombre" },
  NOMBRE_DUPLICADO: {
    estado: 409,
    mensaje: "Ya tienes una cuenta con ese nombre.",
    campo: "nombre",
  },
  TIPO_INVALIDO: {
    estado: 400,
    mensaje: "Elige efectivo, banco o tarjeta de crédito.",
    campo: "tipo",
  },
  DETALLE_LARGO: {
    estado: 400,
    mensaje: "El detalle admite hasta 60 caracteres.",
    campo: "detalle",
  },
  MONTO_INVALIDO: { estado: 400, mensaje: "Escribe un valor en pesos, sin decimales." },
  CUPO_REQUERIDO: {
    estado: 400,
    mensaje: "La tarjeta necesita un cupo mayor que cero.",
    campo: "cupo",
  },
  CUPO_NO_PERMITIDO: { estado: 400, mensaje: "Solo las tarjetas tienen cupo.", campo: "cupo" },
  SIN_CAMBIOS: { estado: 400, mensaje: "No hay nada que actualizar." },
  CAMBIO_DE_NATURALEZA: {
    estado: 422,
    mensaje: "Una cuenta no puede pasar de activo a pasivo ni al revés.",
    campo: "tipo",
  },
  ORDEN_INVALIDO: {
    estado: 422,
    mensaje: "El orden debe incluir cada cuenta del grupo una sola vez.",
    campo: "ids",
  },
  CUENTA_NO_ENCONTRADA: { estado: 404, mensaje: "La cuenta no existe." },
  CUENTA_ARCHIVADA: {
    estado: 409,
    mensaje: "La cuenta está archivada. Restáurala para modificarla.",
  },
  CUENTA_NO_ARCHIVADA: { estado: 409, mensaje: "La cuenta no está archivada." },
  SALDO_NO_CERO: { estado: 409, mensaje: "Solo puedes archivar una cuenta con saldo cero." },
  CUENTA_CON_MOVIMIENTOS: {
    estado: 409,
    mensaje: "La cuenta tiene movimientos. Archívala en lugar de eliminarla.",
  },
  // Movimientos (SPEC 04)
  TIPO_MOVIMIENTO_INVALIDO: {
    estado: 400,
    mensaje: "Elige gasto, ingreso o transferencia.",
    campo: "tipo",
  },
  MONTO_REQUERIDO: { estado: 400, mensaje: "Escribe un monto mayor que cero.", campo: "monto" },
  FECHA_INVALIDA: { estado: 400, mensaje: "Escribe una fecha válida.", campo: "fecha" },
  MES_INVALIDO: { estado: 400, mensaje: "Escribe un mes válido (AAAA-MM).", campo: "mes" },
  DESCRIPCION_LARGA: {
    estado: 400,
    mensaje: "La descripción admite hasta 80 caracteres.",
    campo: "descripcion",
  },
  NOTA_LARGA: { estado: 400, mensaje: "La nota admite hasta 500 caracteres.", campo: "nota" },
  ORIGEN_REQUERIDO: {
    estado: 400,
    mensaje: "Elige la cuenta de origen.",
    campo: "cuentaOrigenId",
  },
  DESTINO_REQUERIDO: {
    estado: 400,
    mensaje: "Elige la cuenta de destino.",
    campo: "cuentaDestinoId",
  },
  ORIGEN_NO_PERMITIDO: {
    estado: 400,
    mensaje: "Un ingreso no tiene cuenta de origen.",
    campo: "cuentaOrigenId",
  },
  DESTINO_NO_PERMITIDO: {
    estado: 400,
    mensaje: "Un gasto no tiene cuenta de destino.",
    campo: "cuentaDestinoId",
  },
  CUENTAS_IGUALES: {
    estado: 400,
    mensaje: "Origen y destino deben ser cuentas distintas.",
    campo: "cuentaDestinoId",
  },
  CATEGORIA_NO_PERMITIDA: {
    estado: 400,
    mensaje: "Una transferencia no lleva categoría.",
    campo: "categoriaId",
  },
  DIVISION_NO_PERMITIDA: {
    estado: 400,
    mensaje: "Una transferencia no se divide.",
    campo: "partes",
  },
  PARTES_CON_CATEGORIA: {
    estado: 400,
    mensaje: "Usa una categoría o divide, no ambas.",
    campo: "partes",
  },
  PARTES_INSUFICIENTES: {
    estado: 400,
    mensaje: "Divide en al menos dos partes.",
    campo: "partes",
  },
  PARTES_REPETIDAS: {
    estado: 400,
    mensaje: "Cada parte debe tener una categoría distinta.",
    campo: "partes",
  },
  PARTES_NO_SUMAN: {
    estado: 422,
    mensaje: "Las partes deben sumar el monto total.",
    campo: "partes",
  },
  CATEGORIA_INVALIDA: {
    estado: 422,
    mensaje: "La categoría no existe o no corresponde al tipo.",
    campo: "categoriaId",
  },
  CUENTA_INVALIDA: { estado: 422, mensaje: "La cuenta no existe." },
  MOVIMIENTO_NO_ENCONTRADO: { estado: 404, mensaje: "El movimiento no existe." },
  // Reglas de categorización (SPEC 04)
  PALABRA_CLAVE_REQUERIDA: {
    estado: 400,
    mensaje: "Escribe una palabra clave.",
    campo: "palabraClave",
  },
  PALABRA_CLAVE_LARGA: {
    estado: 400,
    mensaje: "La palabra clave admite hasta 60 caracteres.",
    campo: "palabraClave",
  },
  PALABRA_CLAVE_DUPLICADA: {
    estado: 409,
    mensaje: "Ya tienes una regla con esa palabra clave.",
    campo: "palabraClave",
  },
  REGLA_NO_ENCONTRADA: { estado: 404, mensaje: "La regla no existe." },
  NO_AUTENTICADO: { estado: 401, mensaje: "Inicia sesión para continuar." },
  ERROR_INTERNO: {
    estado: 500,
    mensaje: "No pudimos completar la operación. Intenta de nuevo.",
  },
} as const satisfies Record<string, EntradaCatalogo>;

export type CodigoError = keyof typeof CATALOGO;

export type CuerpoErrorApi = {
  statusCode: number;
  codigo: CodigoError;
  mensaje: string;
  campo?: string;
};

export function esCodigoError(valor: unknown): valor is CodigoError {
  return typeof valor === "string" && Object.hasOwn(CATALOGO, valor);
}

/** Error con código del catálogo. Si no se da `campo`, se usa el del catálogo. */
export class ErrorApi extends Error {
  readonly codigo: CodigoError;
  readonly campo: string | undefined;

  constructor(codigo: CodigoError, campo?: string) {
    super(codigo);
    this.name = "ErrorApi";
    this.codigo = codigo;
    const entrada: EntradaCatalogo = CATALOGO[codigo];
    this.campo = campo ?? entrada.campo;
  }

  get cuerpo(): CuerpoErrorApi {
    const { estado, mensaje } = CATALOGO[this.codigo];
    return {
      statusCode: estado,
      codigo: this.codigo,
      mensaje,
      ...(this.campo === undefined ? {} : { campo: this.campo }),
    };
  }
}

/**
 * Pipe global de validación. Cada esquema de Zod usa como `message` un código
 * del catálogo; se toma el primer issue. Un mensaje que no es código (p. ej.
 * el cuerpo no es un objeto) termina en `ENTRADA_INVALIDA`.
 */
export function crearPipeValidacion(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const [primero] = issues;
      const codigo = esCodigoError(primero?.message) ? primero.message : "ENTRADA_INVALIDA";
      const ruta = (primero?.path ?? [])
        .map((s) => String(typeof s === "object" ? s.key : s))
        .join(".");
      return new ErrorApi(codigo, ruta === "" ? undefined : ruta);
    },
  });
}
