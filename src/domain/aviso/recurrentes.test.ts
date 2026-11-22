import { describe, expect, it } from "vitest";
import { confirmada, omitida, plantilla } from "../recurrente/fixtures.test-utils.js";
import type { Cierre, Recurrente } from "../recurrente/recurrente.js";
import { contexto, local } from "./fixtures.test-utils.js";
import { avisosDeRecurrentes, type CierreConFecha, type PlantillaConFecha } from "./recurrentes.js";

const CREADA = new Date("2026-09-01T12:00:00Z");

const conFecha = (r: Recurrente, creadoEn = CREADA): PlantillaConFecha => ({ ...r, creadoEn });
const cerrado = (c: Cierre, creadoEn: Date): CierreConFecha => ({ ...c, creadoEn });

/** Mensual con día fijo desde octubre de 2026. */
const mensual = (id: string, dia: string, extra: Partial<Recurrente> = {}) =>
  conFecha(
    plantilla(id, {
      primerVencimiento: `2026-10-${dia}`,
      generarDesde: `2026-10-${dia}`,
      ...extra,
    }),
  );

describe("avisosDeRecurrentes", () => {
  it("Gas Vanti, variable, vence en hoy + 3 con antelación 3: aviso de hoy, sin resolver y estimado", () => {
    const gas = mensual("gas", "14", { concepto: "Gas Vanti", monto: 32_400n, variable: true });
    const avisos = avisosDeRecurrentes([gas], [], 3, contexto());
    const deHoy = avisos.find((a) => a.vencimiento === "2026-11-14")!;
    expect(deHoy).toEqual({
      clave: "recurrente:gas:2026-11-14",
      tipo: "recurrente",
      instante: local("2026-11-11"),
      resuelto: false,
      recurrenteId: "gas",
      vencimiento: "2026-11-14",
      monto: 32_400n,
      estimado: true,
      resolucion: null,
    });
  });

  it("recorre los vencimientos de los últimos 60 días hasta hoy + dias", () => {
    const gas = mensual("gas", "14");
    expect(avisosDeRecurrentes([gas], [], 3, contexto()).map((a) => a.vencimiento)).toEqual([
      "2026-10-14",
      "2026-11-14",
    ]);
    // Con antelación 1, el de noviembre aún no entra.
    expect(avisosDeRecurrentes([gas], [], 1, contexto()).map((a) => a.vencimiento)).toEqual([
      "2026-10-14",
    ]);
  });

  it("Gimnasio pagado: resuelto, confirmada, con la fecha local del cierre y el monto del movimiento", () => {
    const gym = mensual("gym", "08", { monto: 95_000n });
    // 2026-11-09T02:00Z es todavía el 8 en Bogotá.
    const cierre = cerrado(
      confirmada("gym", "2026-11-08", 96_000n),
      new Date("2026-11-09T02:00:00Z"),
    );
    const aviso = avisosDeRecurrentes([gym], [cierre], 3, contexto()).find(
      (a) => a.vencimiento === "2026-11-08",
    )!;
    expect(aviso.resuelto).toBe(true);
    expect(aviso.resolucion).toEqual({ forma: "confirmada", fecha: "2026-11-08" });
    expect(aviso.monto).toBe(96_000n);
    expect(aviso.estimado).toBe(false);
    expect(aviso.instante).toEqual(local("2026-11-05"));
  });

  it("una omitida queda resuelta como omitida", () => {
    const lavanderia = mensual("lavanderia", "05");
    const cierre = cerrado(omitida("lavanderia", "2026-11-05"), local("2026-11-06", "09:00"));
    const aviso = avisosDeRecurrentes([lavanderia], [cierre], 3, contexto()).find(
      (a) => a.vencimiento === "2026-11-05",
    )!;
    expect(aviso.resuelto).toBe(true);
    expect(aviso.resolucion).toEqual({ forma: "omitida", fecha: "2026-11-06" });
  });

  it("una plantilla pausada no da avisos", () => {
    const pausada = mensual("netflix", "14", { pausadaDesde: "2026-11-12" });
    expect(avisosDeRecurrentes([pausada], [], 3, contexto())).toEqual([]);
  });

  it("una plantilla creada hoy que vence mañana: el aviso queda con el instante de la creación", () => {
    const creada = local("2026-11-11", "09:30");
    const nueva = conFecha(
      plantilla("agua", { primerVencimiento: "2026-11-12", generarDesde: "2026-11-12" }),
      creada,
    );
    const [aviso] = avisosDeRecurrentes([nueva], [], 3, contexto());
    expect(aviso!.vencimiento).toBe("2026-11-12");
    expect(aviso!.instante).toEqual(creada);
  });

  it("una ocurrencia vencida sin cerrar sigue sin resolver", () => {
    const internet = mensual("internet", "05");
    const aviso = avisosDeRecurrentes([internet], [], 3, contexto()).find(
      (a) => a.vencimiento === "2026-11-05",
    )!;
    expect(aviso.resuelto).toBe(false);
    expect(aviso.resolucion).toBeNull();
  });

  it("los cierres de otra plantilla no la resuelven", () => {
    const internet = mensual("internet", "05");
    const ajeno = cerrado(omitida("otra", "2026-11-05"), local("2026-11-05"));
    const aviso = avisosDeRecurrentes([internet], [ajeno], 3, contexto()).find(
      (a) => a.vencimiento === "2026-11-05",
    )!;
    expect(aviso.resuelto).toBe(false);
  });
});
