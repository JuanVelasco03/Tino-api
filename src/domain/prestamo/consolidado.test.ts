import { describe, expect, it } from "vitest";
import {
  HOY,
  andres,
  camila,
  interesesCamila,
  mama,
  movimientosAndres,
  movimientosCamila,
  movimientosMama,
} from "./fixtures.test-utils.js";
import { consolidar, estadoDe, ordenarPrestamos, resumirPrestamo, vencido } from "./consolidado.js";
import type { ResumenPrestamo } from "./prestamo.js";

const resumenCamila = resumirPrestamo(camila, movimientosCamila, interesesCamila, HOY);
const resumenMama = resumirPrestamo(mama, movimientosMama, [], HOY);
const resumenAndres = resumirPrestamo(andres, movimientosAndres, [], HOY);

function resumen(extra: Partial<ResumenPrestamo>): ResumenPrestamo {
  return {
    id: "x",
    nombre: "X",
    tipo: "prestamo_otorgado",
    tasaCpb: 0,
    estado: "te_debe",
    capitalPendiente: 1n,
    desde: "2026-01-01",
    fechaAcordada: null,
    vencido: false,
    cierre: null,
    interesesCausados: 0n,
    ...extra,
  };
}

describe("estadoDe", () => {
  it("saldado con capital 0; si no, según el tipo", () => {
    expect(estadoDe("prestamo_otorgado", 0n)).toBe("saldado");
    expect(estadoDe("deuda_contraida", 0n)).toBe("saldado");
    expect(estadoDe("prestamo_otorgado", 1n)).toBe("te_debe");
    expect(estadoDe("deuda_contraida", 1n)).toBe("le_debes");
  });
});

describe("vencido", () => {
  it("fecha acordada pasada con capital", () => {
    expect(vencido("2026-10-15", 1n, HOY)).toBe(true);
    expect(vencido(HOY, 1n, HOY)).toBe(false);
    expect(vencido("2026-10-15", 0n, HOY)).toBe(false);
    expect(vencido(null, 1n, HOY)).toBe(false);
  });
});

describe("resumirPrestamo", () => {
  it("Camila, como en el diseño", () => {
    expect(resumenCamila).toEqual({
      id: "camila",
      nombre: "Camila",
      tipo: "prestamo_otorgado",
      tasaCpb: 100,
      estado: "te_debe",
      capitalPendiente: 500000n,
      desde: "2026-08-14",
      fechaAcordada: "2026-10-15",
      vencido: true,
      cierre: null,
      interesesCausados: 6667n,
    });
  });

  it("Andrés, saldado", () => {
    expect(resumenAndres).toMatchObject({
      estado: "saldado",
      capitalPendiente: 0n,
      desde: null,
      vencido: false,
      cierre: { fecha: "2026-09-20", forma: "pago" },
      interesesCausados: 0n,
    });
  });
});

describe("ordenarPrestamos", () => {
  it("grupos te_debe, le_debes, saldado", () => {
    const orden = ordenarPrestamos([resumenAndres, resumenMama, resumenCamila]);
    expect(orden.map((p) => p.id)).toEqual(["camila", "mama", "andres"]);
  });

  it("dentro de un grupo, por capital desc y luego por nombre", () => {
    const orden = ordenarPrestamos([
      resumen({ id: "b", nombre: "Beto", capitalPendiente: 100n }),
      resumen({ id: "c", nombre: "Ana", capitalPendiente: 100n }),
      resumen({ id: "a", nombre: "Zoe", capitalPendiente: 900n }),
    ]);
    expect(orden.map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("saldados por fecha de cierre desc, sin cierre al final", () => {
    const saldado = { estado: "saldado" as const, capitalPendiente: 0n };
    const orden = ordenarPrestamos([
      resumen({ ...saldado, id: "sin", nombre: "A", cierre: null }),
      resumen({
        ...saldado,
        id: "vieja",
        nombre: "B",
        cierre: { fecha: "2026-01-01", forma: "pago" },
      }),
      resumen({
        ...saldado,
        id: "nueva",
        nombre: "C",
        cierre: { fecha: "2026-09-01", forma: "condonacion" },
      }),
    ]);
    expect(orden.map((p) => p.id)).toEqual(["nueva", "vieja", "sin"]);
  });
});

describe("consolidar", () => {
  it("totales, personas, causados y posición neta", () => {
    expect(consolidar([resumenCamila, resumenMama, resumenAndres])).toEqual({
      teDeben: { total: 500000n, personas: 1, interesesCausados: 6667n },
      debes: { total: 500000n, personas: 1, interesesCausados: 0n, conIntereses: false },
      posicionNeta: 0n,
    });
  });

  it("posición neta negativa", () => {
    const deuda = resumen({ tipo: "deuda_contraida", estado: "le_debes", capitalPendiente: 900n });
    expect(consolidar([resumen({ capitalPendiente: 100n }), deuda]).posicionNeta).toBe(-800n);
  });

  it("conIntereses: alguna contraída no saldada con tasa", () => {
    const conTasa = resumen({ tipo: "deuda_contraida", estado: "le_debes", tasaCpb: 150 });
    const saldadaConTasa = resumen({
      tipo: "deuda_contraida",
      estado: "saldado",
      capitalPendiente: 0n,
      tasaCpb: 150,
    });
    const otorgadoConTasa = resumen({ tasaCpb: 100 });
    expect(consolidar([conTasa]).debes.conIntereses).toBe(true);
    expect(consolidar([saldadaConTasa, otorgadoConTasa]).debes.conIntereses).toBe(false);
  });

  it("sin préstamos, todo en cero", () => {
    expect(consolidar([])).toEqual({
      teDeben: { total: 0n, personas: 0, interesesCausados: 0n },
      debes: { total: 0n, personas: 0, interesesCausados: 0n, conIntereses: false },
      posicionNeta: 0n,
    });
  });
});
