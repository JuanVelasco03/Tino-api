/** Patrimonio y revaluación con cuentas de inversión (SPEC 10). */
import { describe, expect, it } from "vitest";
import { UNA, activo, op, precio } from "../inversion/fixtures.test-utils.js";
import {
  aportesEn,
  cambioDelMes,
  fechasConTrm,
  fechasDePrecios,
  flujosEntre,
  patrimonioEn,
  revaluacionEntre,
  valorInversionesEn,
} from "./patrimonio.js";
import type { CuentaPatrimonio, DatosPatrimonio, MovimientoResumen } from "./resumen.js";

const H = "2026-11-21";
const TRM = 412_000n;

const bancolombia: CuentaPatrimonio = {
  id: "bancolombia",
  tipo: "banco",
  moneda: "COP",
  saldoInicial: 10_000_000n,
  creadaEl: "2026-10-01",
};
const etoro: CuentaPatrimonio = {
  id: "etoro",
  tipo: "inversion",
  moneda: "USD",
  saldoInicial: 0n,
  creadaEl: H,
};

let siguiente = 0;
function transferencia(
  origen: string,
  destino: string,
  monto: bigint,
  montoDestino: bigint | null,
  fecha = H,
): MovimientoResumen {
  return {
    id: `t${++siguiente}`,
    tipo: "transferencia",
    monto,
    montoDestino,
    fecha,
    cuentaOrigenId: origen,
    cuentaDestinoId: destino,
    categoriaId: null,
  };
}

/** TRM constante en todas las fechas que se piden. */
function trmConstante(datos: Omit<DatosPatrimonio, "trm">, valor: bigint | null) {
  const fechas = fechasConTrm(datos, H, "2026-11");
  return new Map(fechas.map((f) => [f, valor]));
}

/** Criterios de aceptación: fondeo, compra de 2 VOO, precio manual y venta de 1. */
function escenarioEtoro(trm: bigint | null = TRM): DatosPatrimonio {
  const voo = { ...activo("VOO"), cuentaId: "etoro" };
  const base = {
    cuentas: [bancolombia, etoro],
    cambios: [],
    movimientos: [transferencia("bancolombia", "etoro", 8_240_000n, 200_000n)],
    inversiones: new Map([
      [
        "etoro",
        {
          activos: [voo],
          operaciones: [
            op("VOO", "compra", 2n * UNA, 100_000n, H),
            op("VOO", "venta", UNA, 56_000n, H),
          ],
          precios: [
            precio("VOO", 50_000n, H, `${H}T10:00:00Z`),
            precio("VOO", 56_240n, H, `${H}T11:00:00Z`),
          ],
        },
      ],
    ]),
  };
  return { ...base, trm: trmConstante(base, trm) };
}

describe("patrimonioEn con inversiones", () => {
  it("la inversión USD aporta su valor de mercado en COP con la TRM de la fecha", () => {
    // Bancolombia 1.760.000 + eToro 212.240 centavos × 41,20 = 8.744.288.
    expect(patrimonioEn(escenarioEtoro(), "2026-11-30")).toBe(10_504_288n);
    expect(valorInversionesEn(escenarioEtoro(), "2026-11-30")).toBe(8_744_288n);
  });

  it("antes de crearse la inversión no aporta", () => {
    expect(patrimonioEn(escenarioEtoro(), "2026-10-31")).toBe(10_000_000n);
  });

  it("una inversión USD sin TRM aporta 0", () => {
    expect(patrimonioEn(escenarioEtoro(null), "2026-11-30")).toBe(1_760_000n);
  });

  it("usa la TRM de cada fecha", () => {
    const datos = escenarioEtoro();
    const trm = new Map(datos.trm);
    trm.set("2026-11-30", 400_000n);
    // 212.240 × 4.000,00 / 100 = 8.489.600.
    expect(patrimonioEn({ ...datos, trm }, "2026-11-30")).toBe(1_760_000n + 8_489_600n);
  });
});

describe("revaluación", () => {
  it("criterio de SPEC 10: (60,00 realizados + 62,40 no realizados) × 4.120 = 504.288", () => {
    const datos = escenarioEtoro();
    expect(flujosEntre(datos, "2026-10-31", "2026-11-30")).toBe(8_240_000n);
    expect(aportesEn(datos, "2026-11-30")).toBe(0n);
    expect(revaluacionEntre(datos, "2026-10-31", "2026-11-30")).toBe(504_288n);
  });

  it("el puente cuadra y otrosCambios excluye la revaluación", () => {
    const puente = cambioDelMes(escenarioEtoro(), "2026-11", 0n);
    expect(puente).toMatchObject({
      patrimonioAnterior: 10_000_000n,
      resultado: 0n,
      revaluacion: 504_288n,
      otrosCambios: 0n,
      patrimonioCierre: 10_504_288n,
    });
    expect(
      puente.patrimonioAnterior + puente.resultado + puente.revaluacion + puente.otrosCambios,
    ).toBe(puente.patrimonioCierre);
  });

  it("un retiro hacia COP es un flujo negativo por el lado COP y no cambia la revaluación", () => {
    const datos = escenarioEtoro();
    const conRetiro = {
      ...datos,
      movimientos: [
        ...datos.movimientos,
        transferencia("etoro", "bancolombia", 100_000n, 4_120_000n),
      ],
    };
    expect(flujosEntre(conRetiro, "2026-10-31", "2026-11-30")).toBe(8_240_000n - 4_120_000n);
    expect(revaluacionEntre(conRetiro, "2026-10-31", "2026-11-30")).toBe(504_288n);
  });

  it("las transferencias entre dos inversiones son internas", () => {
    const otra: CuentaPatrimonio = { ...etoro, id: "ibkr" };
    const datos = escenarioEtoro();
    const conInterna = {
      ...datos,
      cuentas: [...datos.cuentas, otra],
      movimientos: [...datos.movimientos, transferencia("etoro", "ibkr", 1_000n, null)],
    };
    expect(flujosEntre(conInterna, "2026-10-31", "2026-11-30")).toBe(8_240_000n);
    expect(revaluacionEntre(conInterna, "2026-10-31", "2026-11-30")).toBe(504_288n);
  });

  it("lo que ya se tenía (saldo inicial e iniciales) son aportes, no revaluación", () => {
    const ecopetrol = { ...activo("ECOPETROL"), cuentaId: "acciones" };
    const acciones: CuentaPatrimonio = {
      id: "acciones",
      tipo: "inversion",
      moneda: "COP",
      saldoInicial: 1_000_000n,
      creadaEl: H,
    };
    const datos: DatosPatrimonio = {
      cuentas: [acciones],
      cambios: [],
      movimientos: [],
      inversiones: new Map([
        [
          "acciones",
          {
            activos: [ecopetrol],
            operaciones: [op("ECOPETROL", "inicial", 100n * UNA, 250_000n, H)],
            precios: [precio("ECOPETROL", 2_500n, H)],
          },
        ],
      ]),
    };
    expect(aportesEn(datos, "2026-11-30")).toBe(1_250_000n);
    expect(cambioDelMes(datos, "2026-11", 0n)).toMatchObject({
      revaluacion: 0n,
      otrosCambios: 1_250_000n,
      patrimonioCierre: 1_250_000n,
    });
  });

  it("una subida de precio en el mes es revaluación", () => {
    const ecopetrol = { ...activo("ECOPETROL"), cuentaId: "acciones" };
    const acciones: CuentaPatrimonio = {
      id: "acciones",
      tipo: "inversion",
      moneda: "COP",
      saldoInicial: 0n,
      creadaEl: "2026-10-01",
    };
    const datos: DatosPatrimonio = {
      cuentas: [acciones],
      cambios: [],
      movimientos: [],
      inversiones: new Map([
        [
          "acciones",
          {
            activos: [ecopetrol],
            operaciones: [op("ECOPETROL", "inicial", 100n * UNA, 250_000n, "2026-10-01")],
            precios: [precio("ECOPETROL", 2_500n, "2026-10-01"), precio("ECOPETROL", 2_600n, H)],
          },
        ],
      ]),
    };
    expect(cambioDelMes(datos, "2026-11", 0n)).toMatchObject({
      patrimonioAnterior: 250_000n,
      revaluacion: 10_000n,
      otrosCambios: 0n,
      patrimonioCierre: 260_000n,
    });
  });
});

describe("fechasConTrm", () => {
  it("vacío sin inversiones USD", () => {
    expect(
      fechasConTrm({ cuentas: [bancolombia], cambios: [], movimientos: [] }, H, "2026-11"),
    ).toEqual([]);
  });

  it("serie, cierres del puente, creación e iniciales, ordenadas y sin repetir", () => {
    const inicial = op("VOO", "inicial", UNA, 1n, "2026-03-15");
    const fechas = fechasConTrm(
      {
        cuentas: [etoro],
        cambios: [],
        movimientos: [],
        inversiones: new Map([["etoro", { activos: [], operaciones: [inicial], precios: [] }]]),
      },
      H,
      "2026-09",
    );
    expect(fechas).toContain("2026-03-15");
    expect(fechas).toContain(H);
    expect(fechas).toContain("2026-08-31");
    expect(fechas).toContain("2026-09-30");
    expect(fechas).toContain("2025-12-31");
    expect(fechas).toEqual([...new Set(fechas)].toSorted());
  });
});

describe("fechasDePrecios (SPEC 11)", () => {
  it("cierres de la serie y del puente, y hoy, sin fechas futuras", () => {
    const fechas = fechasDePrecios("2026-11-22", "2026-11");
    expect(fechas).toHaveLength(12);
    expect(fechas[0]).toBe("2025-12-31");
    expect(fechas.at(-2)).toBe("2026-10-31");
    expect(fechas.at(-1)).toBe("2026-11-22");
    expect(fechas).not.toContain("2026-11-30");
  });

  it("un mes pasado suma su cierre y el del mes anterior", () => {
    const fechas = fechasDePrecios("2026-11-22", "2025-06");
    expect(fechas).toContain("2025-05-31");
    expect(fechas).toContain("2025-06-30");
  });
});
