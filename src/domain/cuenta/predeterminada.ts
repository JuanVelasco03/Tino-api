import type { Cuenta } from "./cuenta.js";
import { naturalezaDe } from "./naturaleza.js";

/**
 * Cuenta predeterminada de la captura. La elegida si existe y no está
 * archivada; si no, la primera no archivada del orden del usuario (activos
 * antes que pasivos, como en la lista de cuentas); `null` sin cuentas.
 * `cuentas` llega en el orden del usuario dentro de cada grupo.
 */
export function resolverCuentaPredeterminada(
  elegida: string | null,
  cuentas: readonly Pick<Cuenta, "id" | "tipo" | "archivadaEn">[],
): string | null {
  const activas = cuentas.filter((c) => c.archivadaEn === null);
  if (elegida !== null && activas.some((c) => c.id === elegida)) return elegida;
  const primera =
    activas.find((c) => naturalezaDe(c.tipo) === "activo") ??
    activas.find((c) => naturalezaDe(c.tipo) === "pasivo");
  return primera?.id ?? null;
}
