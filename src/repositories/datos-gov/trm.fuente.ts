/**
 * ÚNICO archivo del proyecto que conoce datos.gov.co (SPEC 09), como
 * `repositories/supabase/` lo es de Supabase (REGLAS §5).
 *
 * Dataset «Tasa de Cambio Representativa del Mercado - TRM» de la
 * Superintendencia Financiera (`32sa-8pi3`): abierto, sin clave. Una fila por
 * vigencia:
 *
 *   {"valor":"3461.92","unidad":"COP","vigenciadesde":"2026-11-21T00:00:00.000",
 *    "vigenciahasta":"2026-11-23T00:00:00.000"}
 *
 * Cualquier falla (red, timeout, estado, forma, lista vacía, unidad o valor)
 * devuelve `null` y deja un aviso en el log: la falta de TRM nunca es un
 * error HTTP. Sin reintentos. Inyectable: las e2e la reemplazan por una falsa.
 */
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { Trm } from "../../domain/trm/trm.js";
import { parsearValor } from "../../domain/trm/valor.js";

const URL_DATASET = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const TIMEOUT_MS = 3000;

/** Fecha sin zona: se toman los 10 primeros caracteres ("YYYY-MM-DD"). */
const fechaFuente = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/)
  .transform((f) => f.slice(0, 10));

const filaFuente = z.object({
  valor: z.string(),
  unidad: z.literal("COP"),
  vigenciadesde: fechaFuente,
  vigenciahasta: fechaFuente,
});

const respuestaFuente = z.array(z.unknown()).min(1);

/** URL de la fila que cubre `fecha` ("YYYY-MM-DD"). */
export function urlEn(fecha: string): string {
  const f = `${fecha}T00:00:00.000`;
  const donde = `vigenciadesde <= '${f}' AND vigenciahasta >= '${f}'`;
  return `${URL_DATASET}?$where=${encodeURIComponent(donde)}&$limit=1`;
}

/** Respuesta JSON de la fuente → TRM, o `null` si no tiene la forma esperada. Pura. */
export function aTrm(json: unknown): Trm | null {
  const lista = respuestaFuente.safeParse(json);
  if (!lista.success) return null;
  const fila = filaFuente.safeParse(lista.data[0]);
  if (!fila.success) return null;
  const valorCent = parsearValor(fila.data.valor);
  if (valorCent === null) return null;
  const { vigenciadesde, vigenciahasta } = fila.data;
  if (vigenciahasta < vigenciadesde) return null;
  return { valorCent, vigenteDesde: vigenciadesde, vigenteHasta: vigenciahasta };
}

@Injectable()
export class TrmFuente {
  private readonly logger = new Logger(TrmFuente.name);

  /** TRM que cubre `fecha` ("YYYY-MM-DD"), o `null` ante cualquier falla. */
  async obtenerEn(fecha: string): Promise<Trm | null> {
    try {
      const respuesta = await fetch(urlEn(fecha), { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (respuesta.status !== 200) {
        this.logger.warn(`TRM ${fecha}: la fuente respondió ${respuesta.status}`);
        return null;
      }
      const trm = aTrm(await respuesta.json());
      if (trm === null) this.logger.warn(`TRM ${fecha}: respuesta vacía o con otra forma`);
      return trm;
    } catch (error) {
      const motivo = error instanceof Error ? error.name : "desconocido";
      this.logger.warn(`TRM ${fecha}: no se pudo consultar la fuente (${motivo})`);
      return null;
    }
  }
}
