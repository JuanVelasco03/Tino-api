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

const UN_DIA_MS = 86_400_000;

/**
 * Desfase de la zona en el instante `t`, en ms: el reloj de pared de la zona
 * leído como si fuera UTC, menos `t`. Sin segundos (las zonas vigentes no los usan).
 */
function desfase(t: number, zonaHoraria: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaHoraria,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(t));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  const pared = Date.UTC(
    parte("year"),
    parte("month") - 1,
    parte("day"),
    parte("hour"),
    parte("minute"),
  );
  const sinSegundos = t - (((t % 60_000) + 60_000) % 60_000);
  return pared - sinSegundos;
}

/**
 * Inversa de `fechaLocal`: el instante UTC en que el reloj de `zonaHoraria`
 * marca `fecha` ("YYYY-MM-DD") a `hora` ("HH:MM"). Sin librerías: se prueba con
 * el desfase de la zona un día antes y un día después.
 *
 * Con cambio de hora:
 * - una hora repetida (se atrasa el reloj) da el primer instante;
 * - una hora inexistente (se adelanta el reloj) se corre lo que dura el salto,
 *   con el desfase de antes del cambio: 02:30 en un salto de 02:00 a 03:00 da
 *   las 03:30. Es el primer instante válido en que el reloj alcanza esa hora
 *   contada con el desfase anterior.
 */
export function instanteLocal(fecha: string, hora: string, zonaHoraria: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  const [horas, minutos] = hora.split(":").map(Number) as [number, number];
  const pared = Date.UTC(anio, mes - 1, dia, horas, minutos);

  const antes = pared - desfase(pared - UN_DIA_MS, zonaHoraria);
  const despues = pared - desfase(pared + UN_DIA_MS, zonaHoraria);
  const marcaLaHora = (t: number) => t + desfase(t, zonaHoraria) === pared;
  const validos = [antes, despues].filter(marcaLaHora);
  if (validos.length > 0) return new Date(Math.min(...validos));
  // Hora inexistente: con el desfase de antes del salto.
  return new Date(antes);
}
