import { describe, expect, it } from "vitest";
import {
  BANCOLOMBIA,
  NEQUI,
  OTROS_GASTOS,
  andres,
  camila,
  condonacion,
  interes,
  interesesCamila,
  mama,
  movimientosAndres,
  movimientosCamila,
  movimientosMama,
  ref,
  transferencia,
} from "./fixtures.test-utils.js";
import {
  capitalPendiente,
  cierre,
  clasificar,
  desde,
  historial,
  totales,
  ultimoAbono,
} from "./historial.js";

describe("clasificar", () => {
  it("en un otorgado: destino = préstamo es desembolso; origen = préstamo, abono", () => {
    expect(movimientosCamila.map((m) => clasificar(camila, m))).toEqual(["desembolso", "abono"]);
  });

  it("en una contraída: origen = préstamo es desembolso; destino = préstamo, abono", () => {
    expect(movimientosMama.map((m) => clasificar(mama, m))).toEqual([
      "desembolso",
      "abono",
      "abono",
      "abono",
    ]);
  });

  it("un gasto con origen el préstamo otorgado es condonación", () => {
    expect(clasificar(camila, condonacion("x", "2026-11-11", 1n, ref(camila)))).toBe("condonacion");
  });
});

describe("capital pendiente", () => {
  it("es el saldo de la cuenta del préstamo (RN-01, RN-02)", () => {
    expect(capitalPendiente(camila, movimientosCamila)).toBe(500000n);
    expect(capitalPendiente(mama, movimientosMama)).toBe(500000n);
    expect(capitalPendiente(andres, movimientosAndres)).toBe(0n);
  });

  it("una condonación lo reduce", () => {
    const movs = [...movimientosCamila, condonacion("k", "2026-11-11", 200000n, ref(camila))];
    expect(capitalPendiente(camila, movs)).toBe(300000n);
  });
});

describe("totales", () => {
  it("Camila: prestado, abonado e intereses cobrados", () => {
    expect(totales(camila, movimientosCamila, interesesCamila)).toEqual({
      totalPrestado: 600000n,
      totalAbonado: 100000n,
      totalCondonado: 0n,
      interesesCobrados: 12000n,
    });
  });

  it("Mamá: tres abonos", () => {
    expect(totales(mama, movimientosMama, [])).toEqual({
      totalPrestado: 900000n,
      totalAbonado: 400000n,
      totalCondonado: 0n,
      interesesCobrados: 0n,
    });
  });

  it("totalAbonado incluye las condonaciones", () => {
    const movs = [...movimientosCamila, condonacion("k", "2026-11-11", 200000n, ref(camila))];
    expect(totales(camila, movs, interesesCamila)).toMatchObject({
      totalAbonado: 300000n,
      totalCondonado: 200000n,
    });
  });
});

describe("desde", () => {
  it("es el primer movimiento de capital", () => {
    expect(desde(camila, movimientosCamila)).toBe("2026-08-14");
    expect(desde(mama, movimientosMama)).toBe("2026-03-03");
  });

  it("es null si está saldado", () => {
    expect(desde(andres, movimientosAndres)).toBeNull();
  });

  it("tras reabrir, es el primer movimiento posterior al último saldo cero", () => {
    const movs = [
      ...movimientosAndres,
      transferencia("a-reabre", "2026-10-05", 50000n, NEQUI, ref(andres)),
    ];
    expect(desde(andres, movs)).toBe("2026-10-05");
  });

  it("sin movimientos es null", () => {
    expect(desde(camila, [])).toBeNull();
  });
});

describe("cierre", () => {
  it("por pago", () => {
    expect(cierre(andres, movimientosAndres)).toEqual({ fecha: "2026-09-20", forma: "pago" });
  });

  it("por condonación", () => {
    const movs = [...movimientosCamila, condonacion("k", "2026-11-11", 500000n, ref(camila))];
    expect(cierre(camila, movs)).toEqual({ fecha: "2026-11-11", forma: "condonacion" });
  });

  it("es null con capital pendiente o sin movimientos", () => {
    expect(cierre(camila, movimientosCamila)).toBeNull();
    expect(cierre(camila, [])).toBeNull();
  });
});

describe("último abono", () => {
  it("fecha del último abono", () => {
    expect(ultimoAbono(mama, movimientosMama, [])).toBe("2026-11-06");
    expect(ultimoAbono(camila, movimientosCamila, interesesCamila)).toBe("2026-10-02");
  });

  it("o del último interés si es posterior", () => {
    const intereses = [...interesesCamila, interes("i2", "2026-11-01", 5000n, null)];
    expect(ultimoAbono(camila, movimientosCamila, intereses)).toBe("2026-11-01");
  });

  it("null sin abonos ni intereses", () => {
    expect(ultimoAbono(camila, movimientosCamila.slice(0, 1), [])).toBeNull();
  });
});

describe("historial", () => {
  it("Camila: el interés se une a su capital; saldo corrido", () => {
    expect(historial(camila, movimientosCamila, interesesCamila)).toEqual([
      {
        fecha: "2026-08-14",
        clase: "desembolso",
        cuenta: NEQUI,
        categoria: null,
        capital: 600000n,
        interes: 0n,
        saldoCapital: 600000n,
        movimientoId: "c-desembolso",
        movimientoInteresId: null,
      },
      {
        fecha: "2026-10-02",
        clase: "abono",
        cuenta: NEQUI,
        categoria: null,
        capital: -100000n,
        interes: 12000n,
        saldoCapital: 500000n,
        movimientoId: "c-abono",
        movimientoInteresId: "c-interes",
      },
    ]);
  });

  it("Mamá: desembolso positivo y abonos negativos en una contraída", () => {
    const filas = historial(mama, movimientosMama, []);
    expect(filas.map((f) => [f.capital, f.saldoCapital])).toEqual([
      [900000n, 900000n],
      [-200000n, 700000n],
      [-100000n, 600000n],
      [-100000n, 500000n],
    ]);
    expect(filas.map((f) => f.cuenta)).toEqual([BANCOLOMBIA, BANCOLOMBIA, BANCOLOMBIA, NEQUI]);
  });

  it("una condonación no lleva cuenta y sí categoría", () => {
    const movs = [...movimientosCamila, condonacion("k", "2026-11-11", 200000n, ref(camila))];
    const ultima = historial(camila, movs, interesesCamila).at(-1)!;
    expect(ultima).toMatchObject({
      clase: "condonacion",
      cuenta: null,
      categoria: OTROS_GASTOS,
      capital: -200000n,
      saldoCapital: 300000n,
    });
  });

  it("si el capital se borró, el interés queda como fila propia de clase interes", () => {
    const sinCapital = movimientosCamila.slice(0, 1);
    const huerfano = [{ ...interesesCamila[0]!, movimientoCapitalId: null }];
    expect(historial(camila, sinCapital, huerfano).at(-1)).toEqual({
      fecha: "2026-10-02",
      clase: "interes",
      cuenta: NEQUI,
      categoria: null,
      capital: 0n,
      interes: 12000n,
      saldoCapital: 600000n,
      movimientoId: null,
      movimientoInteresId: "c-interes",
    });
  });

  it("ordena por fecha y luego por creación", () => {
    const tarde = transferencia("tarde", "2026-08-14", 1000n, NEQUI, ref(camila));
    const filas = historial(camila, [tarde, ...movimientosCamila].reverse(), []);
    expect(filas.map((f) => f.movimientoId)).toEqual(["c-desembolso", "tarde", "c-abono"]);
  });
});
