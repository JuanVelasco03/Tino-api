/**
 * Avisos de cobros y deudas (SPEC 12, N-37, N-38, N-40). Solo préstamos con
 * fecha acordada. El capital es el saldo de la cuenta del préstamo (RN-01).
 *
 * - cobro (te deben): recordatorios en `fechaAcordada + k × dias` (k = 0, 1…)
 *   hasta hoy; con `dias = 0`, solo la fecha acordada. Hay aviso en un
 *   recordatorio si al final de ese día queda capital.
 * - deuda (debes): `dias` antes de la fecha acordada, si a ese día queda capital.
 *
 * Un aviso queda resuelto con un abono, una condonación o un interés con fecha
 * igual o posterior al día del aviso.
 */
import { fechaLocal } from "../fecha/fecha-local.js";
import { restarDias, sumarDias } from "../fecha/mes.js";
import type { Ref } from "../movimiento/movimiento.js";
import { capitalPendiente, clasificar, efectoEnCapital, porFecha } from "../prestamo/historial.js";
import type { InteresDePrestamo, MovimientoDePrestamo, Prestamo } from "../prestamo/prestamo.js";
import type { AvisoCobro, AvisoDeuda, Contexto, ResolucionPrestamo } from "./aviso.js";
import { armarClave } from "./clave.js";
import { disparo } from "./lista.js";

export type InteresConPrestamo = InteresDePrestamo & { prestamoId: string };

type Fuentes = {
  prestamo: Prestamo;
  movimientos: MovimientoDePrestamo[];
  intereses: InteresConPrestamo[];
};

const tocaA = (prestamoId: string, m: MovimientoDePrestamo) =>
  m.cuentaOrigenId === prestamoId || m.cuentaDestinoId === prestamoId;

function fuentesDe(
  prestamo: Prestamo,
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly InteresConPrestamo[],
): Fuentes {
  return {
    prestamo,
    movimientos: movimientos.filter((m) => tocaA(prestamo.id, m)),
    intereses: intereses.filter((i) => i.prestamoId === prestamo.id),
  };
}

/** Capital corrido al final del día `fecha`: los movimientos con fecha ≤ `fecha`. */
export function capitalAl(
  prestamo: Pick<Prestamo, "id" | "tipo">,
  movimientos: readonly MovimientoDePrestamo[],
  fecha: string,
): bigint {
  return capitalPendiente(
    prestamo,
    movimientos.filter((m) => tocaA(prestamo.id, m) && m.fecha <= fecha),
  );
}

/** La cuenta propia de un movimiento de capital: la que no es el préstamo. */
function cuentaPropia(prestamoId: string, m: MovimientoDePrestamo): Ref | null {
  if (m.cuentaOrigenId !== null && m.cuentaOrigenId !== prestamoId) return m.cuentaOrigen;
  if (m.cuentaDestinoId !== null && m.cuentaDestinoId !== prestamoId) return m.cuentaDestino;
  return null;
}

type Candidata = ResolucionPrestamo & { creadoEn: Date };

/**
 * Abonos, condonaciones e intereses del préstamo, como posibles resoluciones.
 * Un interés enlazado a un abono suma su monto al del abono; uno suelto (un
 * abono de interés) es su propia resolución.
 */
function candidatas({ prestamo, movimientos, intereses }: Fuentes): Candidata[] {
  const idsCapital = new Set(movimientos.map((m) => m.id));
  const interesDe = new Map<string, bigint>();
  const sueltos: Candidata[] = [];
  for (const i of intereses) {
    if (i.movimientoCapitalId !== null && idsCapital.has(i.movimientoCapitalId)) {
      interesDe.set(i.movimientoCapitalId, (interesDe.get(i.movimientoCapitalId) ?? 0n) + i.monto);
    } else {
      sueltos.push({
        forma: "abono",
        fecha: i.fecha,
        creadoEn: i.creadoEn,
        monto: i.monto,
        cuenta: i.cuenta,
      });
    }
  }
  const deCapital = movimientos.flatMap((m): Candidata[] => {
    const clase = clasificar(prestamo, m);
    if (clase === "desembolso") return [];
    const efecto = efectoEnCapital(prestamo, m);
    const capital = efecto < 0n ? -efecto : efecto;
    return [
      {
        forma: clase,
        fecha: m.fecha,
        creadoEn: m.creadoEn,
        monto: capital + (interesDe.get(m.id) ?? 0n),
        cuenta: clase === "condonacion" ? null : cuentaPropia(prestamo.id, m),
      },
    ];
  });
  return [...deCapital, ...sueltos].toSorted(porFecha);
}

/** La primera candidata con fecha ≥ `desde`, sin `creadoEn`. */
function resolucionDesde(
  ordenadas: readonly Candidata[],
  desde: string,
): ResolucionPrestamo | null {
  const primera = ordenadas.find((c) => c.fecha >= desde);
  if (!primera) return null;
  return {
    forma: primera.forma,
    fecha: primera.fecha,
    monto: primera.monto,
    cuenta: primera.cuenta,
  };
}

export function avisosDeCobros(
  prestamos: readonly Prestamo[],
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly InteresConPrestamo[],
  dias: number,
  ctx: Contexto,
): AvisoCobro[] {
  return prestamos.flatMap((prestamo) => {
    const fechaAcordada = prestamo.fechaAcordada;
    if (prestamo.tipo !== "prestamo_otorgado" || fechaAcordada === null) return [];
    const fuentes = fuentesDe(prestamo, movimientos, intereses);
    const ordenadas = candidatas(fuentes);
    const capitalHoy = capitalAl(prestamo, fuentes.movimientos, ctx.hoy);

    const recordatorios: string[] = [];
    let siguiente: string | null = null;
    for (let k = 0; ; k++) {
      const r = sumarDias(fechaAcordada, k * dias);
      if (r > ctx.hoy) {
        siguiente = r;
        break;
      }
      recordatorios.push(r);
      if (dias === 0) break;
    }
    const proximoRecordatorio = dias > 0 && capitalHoy > 0n ? siguiente : null;

    return recordatorios
      .filter((r) => capitalAl(prestamo, fuentes.movimientos, r) > 0n)
      .map((r): AvisoCobro => {
        const instante = disparo(r, prestamo.creadoEn, ctx.zona);
        const resolucion = resolucionDesde(ordenadas, fechaLocal(instante, ctx.zona));
        return {
          clave: armarClave("cobro", prestamo.id, r),
          tipo: "cobro",
          instante,
          resuelto: resolucion !== null,
          prestamoId: prestamo.id,
          fechaAcordada,
          recordatorio: r,
          monto: resolucion?.monto ?? capitalHoy,
          proximoRecordatorio,
          resolucion,
        };
      });
  });
}

export function avisosDeDeudas(
  prestamos: readonly Prestamo[],
  movimientos: readonly MovimientoDePrestamo[],
  intereses: readonly InteresConPrestamo[],
  dias: number,
  ctx: Contexto,
): AvisoDeuda[] {
  return prestamos.flatMap((prestamo): AvisoDeuda[] => {
    const fechaAcordada = prestamo.fechaAcordada;
    if (prestamo.tipo !== "deuda_contraida" || fechaAcordada === null) return [];
    const fuentes = fuentesDe(prestamo, movimientos, intereses);
    const dia = restarDias(fechaAcordada, dias);
    if (capitalAl(prestamo, fuentes.movimientos, dia) <= 0n) return [];
    const instante = disparo(dia, prestamo.creadoEn, ctx.zona);
    const resolucion = resolucionDesde(candidatas(fuentes), fechaLocal(instante, ctx.zona));
    return [
      {
        clave: armarClave("deuda", prestamo.id, fechaAcordada),
        tipo: "deuda",
        instante,
        resuelto: resolucion !== null,
        prestamoId: prestamo.id,
        fechaAcordada,
        monto: resolucion?.monto ?? capitalAl(prestamo, fuentes.movimientos, ctx.hoy),
        resolucion,
      },
    ];
  });
}
