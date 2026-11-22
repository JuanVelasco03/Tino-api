/**
 * Lectura y validación de variables de entorno. Falla ruidosamente si falta alguna.
 *
 * REGLAS §4: la API no recibe la credencial de servicio. `comprobarSinSecretoDeServicio`
 * se llama al arrancar (`main.ts`) y aborta si la encuentra en el entorno.
 */

export type Env = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  puerto: number;
  /** Origen permitido por CORS (la app web). */
  origenWeb: string;
  /** Clave maestra de los montos, versión 1: 32 bytes (SPEC 05, REGLAS §4). */
  claveMontosV1: Buffer;
  /**
   * Clave de Twelve Data (SPEC 11), opcional. Sin ella los precios quedan
   * manuales. Secreta: sin prefijo público y nunca en un log.
   */
  twelveDataApiKey: string | null;
};

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env.local y complétala.`,
    );
  }
  return valor.trim();
}

function opcional(nombre: string): string | null {
  const valor = process.env[nombre]?.trim();
  return valor === undefined || valor === "" ? null : valor;
}

function urlValida(nombre: string, valor: string): string {
  try {
    new URL(valor);
  } catch {
    throw new Error(`La variable de entorno ${nombre} no es una URL válida: "${valor}".`);
  }
  return valor;
}

/**
 * 32 bytes exactos en base64. El error nombra la variable, nunca muestra su valor.
 * `Buffer.from(…, "base64")` ignora caracteres inválidos: por eso se compara la ida y vuelta.
 */
function claveDe32Bytes(nombre: string, valor: string): Buffer {
  const clave = Buffer.from(valor, "base64");
  if (clave.length !== 32 || clave.toString("base64") !== valor) {
    throw new Error(
      `La variable de entorno ${nombre} debe ser una clave de 32 bytes en base64 ` +
        "(genera una con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\").",
    );
  }
  return clave;
}

let cache: Env | null = null;

export function leerEnv(): Env {
  cache ??= {
    supabaseUrl: urlValida("SUPABASE_URL", requerida("SUPABASE_URL")),
    supabasePublishableKey: requerida("SUPABASE_PUBLISHABLE_KEY"),
    puerto: Number(process.env.PUERTO ?? 4000),
    origenWeb: urlValida("ORIGEN_WEB", process.env.ORIGEN_WEB ?? "http://localhost:3000"),
    claveMontosV1: claveDe32Bytes("CLAVE_MONTOS_V1", requerida("CLAVE_MONTOS_V1")),
    twelveDataApiKey: opcional("TWELVE_DATA_API_KEY"),
  };
  return cache;
}

/** La API nunca arranca con la credencial de servicio en su entorno (REGLAS §4). */
export function comprobarSinSecretoDeServicio(): void {
  const filtradas = Object.keys(process.env).filter((nombre) =>
    /SERVICE_ROLE|SUPABASE_SECRET/i.test(nombre),
  );
  if (filtradas.length > 0) {
    throw new Error(
      `Credencial de servicio en el entorno de la API: ${filtradas.join(", ")}. ` +
        "Solo la usan las pruebas (.env.test.local), nunca el servidor (REGLAS §4).",
    );
  }
}
