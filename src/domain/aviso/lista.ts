/**
 * Lista de avisos (SPEC 12): disparo, visibles, leído efectivo, orden y
 * conteo de no leídos.
 */
import { fechaLocal, instanteLocal } from "../fecha/fecha-local.js";
import { restarDias } from "../fecha/mes.js";
import {
  HISTORIAL_DIAS,
  HORA_AVISOS,
  TIPOS_AVISO,
  type Aviso,
  type AvisoVisible,
  type ConfigAviso,
  type Contexto,
  type MarcaLeido,
} from "./aviso.js";

/**
 * Instante del aviso del día `dia`: las 08:00 locales, o la creación de la
 * fuente si es posterior. Un aviso nunca es anterior a su fuente.
 */
export function disparo(dia: string, creacion: Date, zona: string): Date {
  const instante = instanteLocal(dia, HORA_AVISOS, zona);
  return instante.getTime() >= creacion.getTime() ? instante : creacion;
}

/** Ya disparó y no tiene más de `HISTORIAL_DIAS` días. */
export function esVisible(aviso: Pick<Aviso, "instante">, ctx: Contexto): boolean {
  return (
    aviso.instante.getTime() <= ctx.ahora.getTime() &&
    fechaLocal(aviso.instante, ctx.zona) >= restarDias(ctx.hoy, HISTORIAL_DIAS)
  );
}

/** Con marca, vale la marca; sin marca, la resolución de la fuente (N-26). */
export function leidoEfectivo(
  aviso: Pick<Aviso, "clave" | "resuelto">,
  marcas: ReadonlyMap<string, boolean>,
): boolean {
  return marcas.get(aviso.clave) ?? aviso.resuelto;
}

/** Por `instante` desc, luego por tipo en el orden de `TIPOS_AVISO`, luego por clave. */
export function compararAvisos(a: Aviso, b: Aviso): number {
  const tiempo = b.instante.getTime() - a.instante.getTime();
  if (tiempo !== 0) return tiempo;
  const tipo = TIPOS_AVISO.indexOf(a.tipo) - TIPOS_AVISO.indexOf(b.tipo);
  if (tipo !== 0) return tipo;
  if (a.clave === b.clave) return 0;
  return a.clave < b.clave ? -1 : 1;
}

/** Los avisos visibles de los tipos activos, con su leído efectivo, en orden. */
export function avisosVisibles(
  avisos: readonly Aviso[],
  config: readonly ConfigAviso[],
  marcas: readonly MarcaLeido[],
  ctx: Contexto,
): AvisoVisible[] {
  const activos = new Set(config.filter((c) => c.activo).map((c) => c.tipo));
  const porClave = new Map(marcas.map((m) => [m.clave, m.leido]));
  return avisos
    .filter((a) => activos.has(a.tipo) && esVisible(a, ctx))
    .toSorted(compararAvisos)
    .map((a) => ({ ...a, leido: leidoEfectivo(a, porClave) }));
}

export function contarNoLeidos(avisos: readonly Pick<AvisoVisible, "leido">[]): number {
  return avisos.filter((a) => !a.leido).length;
}
