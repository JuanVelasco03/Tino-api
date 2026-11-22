import { describe, expect, it } from "vitest";
import {
  HOY,
  NEQUI,
  camila,
  condonacion,
  interes,
  interesesCamila,
  mama,
  movimientosCamila,
  movimientosMama,
  prestamo,
  ref,
  transferencia,
} from "./fixtures.test-utils.js";
import { causadosEn, propuestaAbono } from "./intereses.js";

describe("causadosEn", () => {
  it("Camila: 500.000 × 40 días × 1 % / 30 = 6.667 (ancla en el abono con interés)", () => {
    expect(causadosEn(camila, movimientosCamila, interesesCamila, HOY)).toBe(6667n);
  });

  it("sin interés cobrado, el ancla es el primer movimiento de capital", () => {
    // 600.000 × 20 días × 1 % / 30 = 4.000
    expect(causadosEn(camila, movimientosCamila.slice(0, 1), [], "2026-09-03")).toBe(4000n);
  });

  it("acumula por tramos de capital", () => {
    // 600.000 × 49 días (14 ago → 2 oct) + 500.000 × 40 días (2 oct → 11 nov), sin interés cobrado
    // (29.400.000 + 20.000.000) × 100 / 300.000 = 16.466,67 → 16.467
    expect(causadosEn(camila, movimientosCamila, [], HOY)).toBe(16467n);
  });

  it("tasa 0 → 0", () => {
    expect(causadosEn(mama, movimientosMama, [], HOY)).toBe(0n);
  });

  it("capital 0 → 0 (N-69)", () => {
    const movs = [...movimientosCamila, condonacion("k", "2026-11-01", 500000n, ref(camila))];
    expect(causadosEn(camila, movs, interesesCamila, HOY)).toBe(0n);
  });

  it("una condonación parcial baja el tramo sin mover el ancla (N-70)", () => {
    // 500.000 × 30 días (2 oct → 1 nov) + 300.000 × 10 días (1 nov → 11 nov)
    // (15.000.000 + 3.000.000) × 100 / 300.000 = 6.000
    const movs = [...movimientosCamila, condonacion("k", "2026-11-01", 200000n, ref(camila))];
    expect(causadosEn(camila, movs, interesesCamila, HOY)).toBe(6000n);
  });

  it("un abono solo de capital no mueve el ancla", () => {
    // 500.000 × 30 días + 400.000 × 10 días = 19.000.000 × 100 / 300.000 = 6.333,33 → 6.333
    const movs = [
      ...movimientosCamila,
      transferencia("solo-capital", "2026-11-01", 100000n, ref(camila), NEQUI),
    ];
    expect(causadosEn(camila, movs, interesesCamila, HOY)).toBe(6333n);
  });

  it("redondea x,5 hacia arriba", () => {
    // 4.500 × 1 día × 1 % / 30 = 1,5 → 2
    const p = prestamo("p", "prestamo_otorgado", { tasaCpb: 100 });
    const movs = [transferencia("d", "2026-11-10", 4500n, NEQUI, ref(p))];
    expect(causadosEn(p, movs, [], HOY)).toBe(2n);
    // 4.499 → 1,4997 → 1
    const menos = [transferencia("d", "2026-11-10", 4499n, NEQUI, ref(p))];
    expect(causadosEn(p, menos, [], HOY)).toBe(1n);
  });

  it("ignora movimientos e intereses posteriores a F", () => {
    const intereses = [...interesesCamila, interes("futuro", "2026-12-01", 1n, null)];
    expect(causadosEn(camila, movimientosCamila, intereses, HOY)).toBe(6667n);
  });

  it("en una contraída con tasa también causa", () => {
    const deuda = prestamo("d", "deuda_contraida", { tasaCpb: 150 });
    const movs = [transferencia("d1", "2026-10-12", 300000n, ref(deuda), NEQUI)];
    // 300.000 × 30 días × 150 / 300.000 = 4.500
    expect(causadosEn(deuda, movs, [], HOY)).toBe(4500n);
  });
});

describe("propuestaAbono", () => {
  it("primero los causados, el resto a capital", () => {
    expect(
      propuestaAbono(camila, movimientosCamila.slice(0, 1), [], "2026-09-03", 112000n),
    ).toEqual({
      interes: 4000n,
      capital: 108000n,
      interesesCausados: 4000n,
      capitalPendiente: 600000n,
    });
  });

  it("el interés queda limitado por el monto", () => {
    expect(propuestaAbono(camila, movimientosCamila, interesesCamila, HOY, 5000n)).toMatchObject({
      interes: 5000n,
      capital: 0n,
      interesesCausados: 6667n,
    });
  });

  it("ABONO_EXCEDE_CAPITAL si el capital supera lo pendiente", () => {
    expect(propuestaAbono(camila, movimientosCamila, interesesCamila, HOY, 506668n)).toEqual({
      error: "ABONO_EXCEDE_CAPITAL",
    });
    expect(propuestaAbono(camila, movimientosCamila, interesesCamila, HOY, 506667n)).toMatchObject({
      capital: 500000n,
    });
  });
});
