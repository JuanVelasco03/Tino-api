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
  // Resumen del mes (SPEC 06)
  MES_FUTURO: { estado: 400, mensaje: "Ese mes todavía no llega.", campo: "mes" },
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
  // Recurrentes (SPEC 07)
  RECURRENTE_NO_ENCONTRADO: { estado: 404, mensaje: "El recurrente no existe." },
  CONCEPTO_REQUERIDO: { estado: 400, mensaje: "Escribe un concepto.", campo: "concepto" },
  CONCEPTO_LARGO: {
    estado: 400,
    mensaje: "El concepto admite hasta 80 caracteres.",
    campo: "concepto",
  },
  PERIODICIDAD_INVALIDA: {
    estado: 400,
    mensaje: "Elige una periodicidad válida.",
    campo: "periodicidad",
  },
  PRIMER_VENCIMIENTO_PASADO: {
    estado: 400,
    mensaje: "El primer vencimiento no puede ser anterior a hoy.",
    campo: "primerVencimiento",
  },
  ULTIMO_DIA_NO_PERMITIDO: {
    estado: 400,
    mensaje: '"Último día" solo aplica a periodicidades de un mes o más.',
    campo: "ultimoDia",
  },
  OCURRENCIA_INVALIDA: {
    estado: 422,
    mensaje: "Esa fecha no es un vencimiento por confirmar.",
    campo: "vencimiento",
  },
  OCURRENCIA_CERRADA: {
    estado: 409,
    mensaje: "Ese vencimiento ya se confirmó u omitió.",
    campo: "vencimiento",
  },
  OMISION_NO_ENCONTRADA: { estado: 404, mensaje: "No hay una omisión para ese vencimiento." },
  CUENTA_CON_RECURRENTES: {
    estado: 409,
    mensaje: "La cuenta tiene recurrentes. Cámbialos o elimínalos primero.",
  },
  // Deudas y préstamos (SPEC 08)
  PRESTAMO_NO_ENCONTRADO: { estado: 404, mensaje: "El préstamo no existe." },
  PRESTAMO_EXISTENTE: {
    estado: 409,
    mensaje: "Ya tienes un préstamo con esa persona en ese sentido. Súmale un desembolso.",
    campo: "nombre",
  },
  TASA_INVALIDA: {
    estado: 400,
    mensaje: "La tasa es un porcentaje entre 0 y 100, con hasta dos decimales.",
    campo: "tasaMensual",
  },
  FECHA_ACORDADA_ANTERIOR: {
    estado: 400,
    mensaje: "La fecha acordada no puede ser anterior al préstamo.",
    campo: "fechaAcordada",
  },
  ABONO_VACIO: {
    estado: 400,
    mensaje: "El abono tiene que ser mayor que cero.",
    campo: "capital",
  },
  ABONO_EXCEDE_CAPITAL: {
    estado: 422,
    mensaje: "El abono a capital supera lo pendiente.",
    campo: "capital",
  },
  FECHA_ANTERIOR_AL_PRESTAMO: {
    estado: 400,
    mensaje: "La fecha no puede ser anterior al préstamo.",
    campo: "fecha",
  },
  PRESTAMO_SALDADO: { estado: 409, mensaje: "Este préstamo ya está saldado." },
  CONDONACION_NO_PERMITIDA: { estado: 422, mensaje: "Solo se condona lo que te deben." },
  CONDONACION_EXCEDE_CAPITAL: {
    estado: 422,
    mensaje: "No puedes condonar más de lo pendiente.",
    campo: "monto",
  },
  CUENTA_DE_PRESTAMO: {
    estado: 422,
    mensaje: "Esa cuenta es un préstamo. Regístralo desde Deudas.",
  },
  MOVIMIENTO_DE_PRESTAMO: {
    estado: 422,
    mensaje: "Este movimiento es de un préstamo: no cambia de tipo ni de préstamo.",
    campo: "tipo",
  },
  CAPITAL_NEGATIVO: {
    estado: 422,
    mensaje: "El cambio deja el préstamo con capital negativo.",
  },
  // Cuentas de inversión (SPEC 10)
  INVERSION_NO_ENCONTRADA: { estado: 404, mensaje: "La cuenta de inversión no existe." },
  ACTIVO_NO_ENCONTRADO: {
    estado: 404,
    mensaje: "No tienes ese activo en esta cuenta.",
    campo: "simbolo",
  },
  OPERACION_NO_ENCONTRADA: { estado: 404, mensaje: "La operación no existe." },
  MONEDA_INVALIDA: { estado: 400, mensaje: "Elige COP o USD.", campo: "moneda" },
  SIMBOLO_INVALIDO: {
    estado: 400,
    mensaje: "Escribe el símbolo del activo, hasta 12 letras o números.",
    campo: "simbolo",
  },
  CANTIDAD_INVALIDA: {
    estado: 400,
    mensaje: "Escribe una cantidad mayor que cero, con hasta 8 decimales.",
    campo: "cantidad",
  },
  PRECIO_INVALIDO: { estado: 400, mensaje: "Escribe un precio mayor que cero.", campo: "precio" },
  FECHA_FUTURA: { estado: 400, mensaje: "La fecha no puede ser futura.", campo: "fecha" },
  ACTIVO_DUPLICADO: {
    estado: 400,
    mensaje: "Ese activo ya está en la lista.",
    campo: "posiciones",
  },
  EFECTIVO_INSUFICIENTE: {
    estado: 422,
    mensaje: "No hay efectivo suficiente en la cuenta. Registra primero el fondeo.",
  },
  CANTIDAD_INSUFICIENTE: {
    estado: 422,
    mensaje: "No tienes esa cantidad del activo en esa fecha.",
    campo: "cantidad",
  },
  MONTO_DESTINO_REQUERIDO: {
    estado: 400,
    mensaje: "Escribe cuánto llegó a la cuenta de destino.",
    campo: "montoDestino",
  },
  MONTO_DESTINO_NO_PERMITIDO: {
    estado: 400,
    mensaje: "Las dos cuentas usan la misma moneda: basta un monto.",
    campo: "montoDestino",
  },
  CUENTA_DE_INVERSION: {
    estado: 422,
    mensaje:
      "Esa cuenta es de inversión: solo admite transferencias y se maneja desde Inversiones.",
  },
  TIPO_DE_INVERSION_FIJO: {
    estado: 422,
    mensaje: "Una cuenta de inversión no cambia de tipo.",
    campo: "tipo",
  },
  MONEDA_FIJA: { estado: 422, mensaje: "La moneda de una cuenta no cambia.", campo: "moneda" },
  // Precios automáticos (SPEC 11)
  ACTIVO_NO_CUBIERTO: {
    estado: 422,
    mensaje: "El proveedor de precios no cubre este activo. Actualiza su precio a mano.",
    campo: "cotizacion",
  },
  PROVEEDOR_NO_DISPONIBLE: {
    estado: 503,
    mensaje: "El proveedor de precios no responde. Intenta más tarde.",
  },
  PRECIO_AUTOMATICO: {
    estado: 422,
    mensaje: "Este activo tiene precio automático. Pásalo a manual para fijar su precio.",
    campo: "precio",
  },
  // Avisos (SPEC 12)
  AVISO_NO_ENCONTRADO: { estado: 404, mensaje: "El aviso ya no existe." },
  ANTELACION_INVALIDA: {
    estado: 400,
    mensaje: "Elige una de las opciones de este tipo de aviso.",
    campo: "dias",
  },
  // Metas de ahorro (SPEC 13). FECHA_FUTURA y ORIGEN_REQUERIDO se reusan.
  META_NO_ENCONTRADA: { estado: 404, mensaje: "Esa meta no existe." },
  APORTE_NO_ENCONTRADO: { estado: 404, mensaje: "Ese aporte no existe." },
  NOMBRE_INVALIDO: {
    estado: 400,
    mensaje: "Escribe un nombre de 1 a 60 caracteres.",
    campo: "nombre",
  },
  MODO_INVALIDO: { estado: 400, mensaje: "Elige apartado o toda la cuenta.", campo: "modo" },
  MOTIVO_INVALIDO: {
    estado: 400,
    mensaje: "El motivo tiene de 1 a 80 caracteres.",
    campo: "motivo",
  },
  CUENTA_NO_ADMITIDA: {
    estado: 422,
    mensaje: "Esa cuenta no admite este tipo de meta.",
    campo: "cuentaId",
  },
  FECHA_META_PASADA: {
    estado: 422,
    mensaje: "La fecha meta no puede estar en el pasado.",
    campo: "fechaMeta",
  },
  FECHA_ANTERIOR_A_META: {
    estado: 422,
    mensaje: "La fecha no puede ser anterior a la creación de la meta.",
    campo: "fecha",
  },
  APORTE_INICIAL_NO_ADMITIDO: {
    estado: 422,
    mensaje: "Solo una meta por apartado lleva apartado inicial.",
    campo: "aporteInicial",
  },
  SALDO_LIBRE_INSUFICIENTE: {
    estado: 422,
    mensaje: "La cuenta no tiene saldo libre suficiente.",
    campo: "monto",
  },
  APARTADO_INSUFICIENTE: {
    estado: 422,
    mensaje: "Lo apartado no alcanza para ese retiro.",
    campo: "monto",
  },
  ORIGEN_NO_ADMITIDO: {
    estado: 422,
    mensaje: "Un retiro no lleva cuenta de origen.",
    campo: "cuentaOrigenId",
  },
  ORIGEN_FIJO: {
    estado: 422,
    mensaje: "No se puede agregar ni quitar la cuenta de origen.",
    campo: "cuentaOrigenId",
  },
  RETIRO_NO_ADMITIDO: {
    estado: 422,
    mensaje: "Una meta de toda la cuenta no tiene retiros.",
    campo: "tipo",
  },
  META_DE_INVERSION: { estado: 422, mensaje: "El avance de esta meta sigue a la inversión." },
  META_CUMPLIDA: { estado: 409, mensaje: "La meta ya se cumplió." },
  META_ARCHIVADA: { estado: 409, mensaje: "La meta está archivada." },
  META_NO_CUMPLIDA: { estado: 409, mensaje: "Solo se archiva una meta cumplida." },
  META_NO_ARCHIVADA: { estado: 409, mensaje: "La meta no está archivada." },
  APARTADO_NO_CERO: { estado: 409, mensaje: "Retira lo apartado antes de archivar." },
  META_CON_APORTES: {
    estado: 409,
    mensaje: "Una meta con aportes no cambia de modo.",
    campo: "modo",
  },
  CUENTA_CON_META_EXCLUSIVA: {
    estado: 409,
    mensaje: "Esa cuenta ya tiene una meta de toda la cuenta.",
    campo: "cuentaId",
  },
  CUENTA_CON_METAS: {
    estado: 409,
    mensaje: "La cuenta tiene metas: archívalas o elimínalas primero.",
  },
  MOVIMIENTO_DE_META: {
    estado: 422,
    mensaje: "La transferencia de un aporte no cambia de tipo.",
    campo: "tipo",
  },
  // SPEC 14: detalle de cuenta y tarjeta con ciclo.
  TIPO_NO_ADMITIDO: {
    estado: 422,
    mensaje: "Esta operación no está disponible para este tipo de cuenta.",
  },
  RANGO_INVALIDO: {
    estado: 400,
    mensaje: "La fecha final no puede ser anterior a la inicial.",
    campo: "hasta",
  },
  SIN_DIFERENCIA: {
    estado: 422,
    mensaje: "El saldo contado es igual al de TINO: no hay nada que ajustar.",
    campo: "saldoReal",
  },
  MOVIMIENTO_DE_AJUSTE: {
    estado: 422,
    mensaje: "Un ajuste no cambia de tipo, y ningún movimiento se convierte en ajuste.",
    campo: "tipo",
  },
  DIA_INVALIDO: { estado: 400, mensaje: "Elige un día entre 1 y 31." },
  CUENTA_PAGO_INVALIDA: {
    estado: 422,
    mensaje: "Elige una cuenta de efectivo o banco activa.",
    campo: "tarjeta.cuentaPagoId",
  },
  CONDICIONES_REQUERIDAS: {
    estado: 400,
    mensaje: "La tarjeta necesita día de corte y día de pago.",
    campo: "tarjeta",
  },
  CONDICIONES_NO_PERMITIDAS: {
    estado: 400,
    mensaje: "Solo las tarjetas tienen condiciones.",
    campo: "tarjeta",
  },
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
