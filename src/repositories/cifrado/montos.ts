/**
 * Cifrado de montos (SPEC 05, REGLAS §4). La base nunca ve una cifra en claro:
 * los repositorios cifran al escribir y descifran al leer; servicios y dominio
 * siguen con `bigint`.
 *
 * - AES-256-GCM con clave por usuario: HKDF-SHA256(maestra, "tino/montos/v1", usuario_id).
 * - El monto se cifra con 19 dígitos (ceros a la izquierda): el texto cifrado
 *   mide siempre lo mismo y no delata la magnitud.
 * - AAD = `<usuario>|<tabla>|<columna>|<fila>`: un cifrado movido a otra fila,
 *   columna o usuario no descifra.
 * - Formato `v1.<iv>.<cifrado>.<tag>` en base64url. La versión elige la clave
 *   maestra; hoy solo existe v1.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export type ColumnaMonto =
  | { tabla: "movimientos"; columna: "monto" }
  | { tabla: "movimiento_partes"; columna: "monto" }
  | { tabla: "cuentas"; columna: "saldo_inicial" | "cupo" };

/** Dónde vive el valor. `idFila` de una parte: `<movimiento_id>:<categoria_id>`. */
export type ContextoMonto = ColumnaMonto & { usuarioId: string; idFila: string };

/** Contextos de cada columna cifrada: un solo lugar arma la AAD de cada una. */
export const contexto = {
  movimiento: (usuarioId: string, id: string): ContextoMonto => ({
    usuarioId,
    tabla: "movimientos",
    columna: "monto",
    idFila: id,
  }),
  parte: (usuarioId: string, movimientoId: string, categoriaId: string): ContextoMonto => ({
    usuarioId,
    tabla: "movimiento_partes",
    columna: "monto",
    idFila: `${movimientoId}:${categoriaId}`,
  }),
  cuenta: (usuarioId: string, id: string, columna: "saldo_inicial" | "cupo"): ContextoMonto => ({
    usuarioId,
    tabla: "cuentas",
    columna,
    idFila: id,
  }),
};

/** Datos alterados o clave equivocada. El filtro lo convierte en ERROR_INTERNO (500). */
export class MontoIlegible extends Error {
  constructor(motivo: string, ctx: ContextoMonto) {
    super(`Monto ilegible en ${ctx.tabla}.${ctx.columna} (${ctx.idFila}): ${motivo}`);
    this.name = "MontoIlegible";
  }
}

const DIGITOS = 19;
const MAXIMO = 10n ** BigInt(DIGITOS);
const BYTES_IV = 12;
const BYTES_TAG = 16;
const FORMATO = /^v(\d+)\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{26})\.([A-Za-z0-9_-]{22})$/;
/** Tope de claves derivadas en memoria; al llenarse se vacía (derivar es barato). */
const TOPE_CACHE = 10_000;

function aad(ctx: ContextoMonto): Buffer {
  return Buffer.from(`${ctx.usuarioId}|${ctx.tabla}|${ctx.columna}|${ctx.idFila}`, "utf8");
}

export class CifradorMontos {
  private readonly derivadas = new Map<string, Buffer>();

  /** `maestras`: versión → clave de 32 bytes. Cifra siempre con la versión más alta. */
  constructor(private readonly maestras: ReadonlyMap<number, Buffer>) {
    if (maestras.size === 0) throw new Error("CifradorMontos necesita al menos una clave.");
    for (const [version, clave] of maestras) {
      if (clave.length !== 32) throw new Error(`La clave v${version} no mide 32 bytes.`);
    }
  }

  private get versionActual(): number {
    return Math.max(...this.maestras.keys());
  }

  private claveDe(version: number, usuarioId: string): Buffer | null {
    const maestra = this.maestras.get(version);
    if (!maestra) return null;
    const llave = `${version}:${usuarioId}`;
    let clave = this.derivadas.get(llave);
    if (!clave) {
      if (this.derivadas.size >= TOPE_CACHE) this.derivadas.clear();
      clave = Buffer.from(hkdfSync("sha256", maestra, `tino/montos/v${version}`, usuarioId, 32));
      this.derivadas.set(llave, clave);
    }
    return clave;
  }

  cifrar(monto: bigint, ctx: ContextoMonto): string {
    if (monto < 0n || monto >= MAXIMO) {
      throw new Error(`Monto fuera de rango para ${ctx.tabla}.${ctx.columna}: ${monto}`);
    }
    const version = this.versionActual;
    const clave = this.claveDe(version, ctx.usuarioId)!;
    const iv = randomBytes(BYTES_IV);
    const cifrador = createCipheriv("aes-256-gcm", clave, iv, { authTagLength: BYTES_TAG });
    cifrador.setAAD(aad(ctx));
    const claro = Buffer.from(monto.toString().padStart(DIGITOS, "0"), "ascii");
    const cifrado = Buffer.concat([cifrador.update(claro), cifrador.final()]);
    const tag = cifrador.getAuthTag();
    return [`v${version}`, iv, cifrado, tag]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }

  descifrar(valor: unknown, ctx: ContextoMonto): bigint {
    if (typeof valor !== "string") throw new MontoIlegible("no es texto", ctx);
    const partes = FORMATO.exec(valor);
    if (!partes) throw new MontoIlegible("formato inválido", ctx);
    const [, version, iv, cifrado, tag] = partes;
    const clave = this.claveDe(Number(version), ctx.usuarioId);
    if (!clave) throw new MontoIlegible(`versión de clave desconocida v${version}`, ctx);

    let claro: string;
    try {
      const descifrador = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"), {
        authTagLength: BYTES_TAG,
      });
      descifrador.setAAD(aad(ctx));
      descifrador.setAuthTag(Buffer.from(tag, "base64url"));
      claro = Buffer.concat([
        descifrador.update(Buffer.from(cifrado, "base64url")),
        descifrador.final(),
      ]).toString("ascii");
    } catch {
      throw new MontoIlegible("la autenticación no coincide", ctx);
    }
    if (!/^\d{19}$/.test(claro)) throw new MontoIlegible("contenido inválido", ctx);
    return BigInt(claro);
  }

  /**
   * Para editar sin recifrar lo que no cambió: devuelve `guardado` si descifra
   * a `monto`; si no, un cifrado nuevo. Así el historial en SQL no ve cambios falsos.
   * Un `guardado` ilegible lanza MontoIlegible: no se sobrescriben datos alterados en silencio.
   */
  cifrarSiCambia(monto: bigint, guardado: string | null, ctx: ContextoMonto): string {
    if (guardado !== null && this.descifrar(guardado, ctx) === monto) return guardado;
    return this.cifrar(monto, ctx);
  }
}
