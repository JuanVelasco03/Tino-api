/**
 * Comprometido e ingresos esperados del mes actual (SPEC 07).
 *
 * Comprometido: salidas (gasto y transferencia) con vencimiento en el mes. La
 * transferencia es salida comprometida, no gasto: el resumen no cambia (RN-05).
 * Lo pagado cuenta con el monto de su movimiento; lo pendiente y programado,
 * con el fijo o el estimado (N-38). Las omitidas no cuentan.
 */
import { rangoDelMes } from "../fecha/mes.js";
import { esAbierta, ocurrenciasEntre } from "./ocurrencias.js";
import { esSalida, type Cierre, type Ocurrencia, type Recurrente } from "./recurrente.js";

export type Grupo = { monto: bigint; cantidad: number };

export type Comprometido = {
  total: bigint;
  pagado: Grupo;
  porConfirmar: Grupo;
  programado: Grupo;
};

const vacio = (): Grupo => ({ monto: 0n, cantidad: 0 });

function sumar(grupo: Grupo, o: Ocurrencia): void {
  grupo.monto += o.monto;
  grupo.cantidad += 1;
}

export function comprometidoDelMes(
  recurrentes: readonly Recurrente[],
  cierres: readonly Cierre[],
  hoy: string,
  mes: string,
): Comprometido {
  const { desde, hasta } = rangoDelMes(mes);
  const pagado = vacio();
  const porConfirmar = vacio();
  const programado = vacio();

  for (const r of recurrentes) {
    if (!esSalida(r.tipo)) continue;
    for (const o of ocurrenciasEntre(r, cierres, hoy, desde, hasta)) {
      if (o.estado === "pagada") sumar(pagado, o);
      else if (o.estado === "vencida" || o.estado === "por_confirmar") sumar(porConfirmar, o);
      else if (o.estado === "programada") sumar(programado, o);
    }
  }

  return {
    total: pagado.monto + porConfirmar.monto + programado.monto,
    pagado,
    porConfirmar,
    programado,
  };
}

/** Ocurrencias de ingreso del mes aún abiertas, una por línea, por vencimiento y concepto. */
export function ingresosEsperados(
  recurrentes: readonly Recurrente[],
  cierres: readonly Cierre[],
  hoy: string,
  mes: string,
): Ocurrencia[] {
  const { desde, hasta } = rangoDelMes(mes);
  const conceptos = new Map(recurrentes.map((r) => [r.id, r.concepto]));
  return recurrentes
    .filter((r) => r.tipo === "ingreso")
    .flatMap((r) => ocurrenciasEntre(r, cierres, hoy, desde, hasta))
    .filter(esAbierta)
    .sort(
      (a, b) =>
        a.vencimiento.localeCompare(b.vencimiento) ||
        (conceptos.get(a.recurrenteId) ?? "").localeCompare(
          conceptos.get(b.recurrenteId) ?? "",
          "es",
        ),
    );
}
