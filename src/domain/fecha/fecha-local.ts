/**
 * Fecha calendario ("YYYY-MM-DD") de un instante en una zona horaria IANA.
 * Las fechas se guardan en UTC y se presentan en la zona del usuario (REGLAS §6).
 */
export function fechaLocal(ahora: Date, zonaHoraria: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}
