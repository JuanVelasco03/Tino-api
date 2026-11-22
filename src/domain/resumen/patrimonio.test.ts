import { describe, expect, it } from "vitest";
import {
  cambioDelMes,
  inicio,
  patrimonioEn,
  saldoInicialVigente,
  seriePatrimonio,
  variacionDeSerie,
} from "./patrimonio.js";
import type {
  CambioSaldoInicial,
  CuentaPatrimonio,
  DatosPatrimonio,
  MovimientoResumen,
} from "./resumen.js";

const nequi: CuentaPatrimonio = {
  id: "nequi",
  tipo: "banco",
  moneda: "COP",
  saldoInicial: 1_000_000n,
  creadaEl: "2026-10-01",
};
const tarjeta: CuentaPatrimonio = {
  id: "tarjeta",
  tipo: "tarjeta_credito",
  moneda: "COP",
  saldoInicial: 0n,
  creadaEl: "2026-10-01",
};

let siguiente = 0;
function mov(
  datos: Partial<MovimientoResumen> & Pick<MovimientoResumen, "tipo" | "monto" | "fecha">,
): MovimientoResumen {
  return {
    id: `m${++siguiente}`,
    montoDestino: null,
    cuentaOrigenId: null,
    cuentaDestinoId: null,
    categoriaId: null,
    ...datos,
  };
}

function cambio(
  cuentaId: string,
  valorAnterior: bigint,
  valorNuevo: bigint,
  fecha: string,
): CambioSaldoInicial {
  return {
    cuentaId,
    valorAnterior,
    valorNuevo,
    fecha,
    cambiadoEn: new Date(`${fecha}T15:00:00Z`),
  };
}

/** Escenario de los criterios de aceptación de SPEC 06, con M = 2026-11. */
const movimientosEscenario: MovimientoResumen[] = [
  mov({ tipo: "ingreso", monto: 2_000_000n, fecha: "2026-10-05", cuentaDestinoId: "nequi" }),
  mov({ tipo: "gasto", monto: 300_000n, fecha: "2026-10-06", cuentaOrigenId: "nequi" }),
  mov({ tipo: "gasto", monto: 20_000n, fecha: "2026-10-07", cuentaOrigenId: "nequi" }),
  mov({ tipo: "gasto", monto: 100_000n, fecha: "2026-10-08", cuentaOrigenId: "tarjeta" }),
  mov({
    tipo: "transferencia",
    monto: 50_000n,
    fecha: "2026-10-09",
    cuentaOrigenId: "nequi",
    cuentaDestinoId: "tarjeta",
  }),
  mov({ tipo: "gasto", monto: 200_000n, fecha: "2026-11-01", cuentaOrigenId: "nequi" }),
  mov({ tipo: "gasto", monto: 90_000n, fecha: "2026-11-01", cuentaOrigenId: "tarjeta" }),
  mov({ tipo: "gasto", monto: 10_000n, fecha: "2026-11-01", cuentaOrigenId: "nequi" }),
];

const escenario: DatosPatrimonio = {
  cuentas: [nequi, tarjeta],
  cambios: [],
  movimientos: movimientosEscenario,
};

describe("saldoInicialVigente", () => {
  const cambios = [
    cambio("nequi", 1_000_000n, 1_100_000n, "2026-10-10"),
    cambio("nequi", 1_100_000n, 1_250_000n, "2026-10-20"),
    cambio("otra", 5n, 6n, "2026-10-01"),
  ];

  it("antes de la primera edición vale el anterior de esa edición", () => {
    expect(saldoInicialVigente(nequi, cambios, "2026-10-05")).toBe(1_000_000n);
  });

  it("entre dos ediciones vale el nuevo de la primera", () => {
    expect(saldoInicialVigente(nequi, cambios, "2026-10-10")).toBe(1_100_000n);
    expect(saldoInicialVigente(nequi, cambios, "2026-10-19")).toBe(1_100_000n);
  });

  it("después de la última edición vale su nuevo", () => {
    expect(saldoInicialVigente(nequi, cambios, "2026-11-30")).toBe(1_250_000n);
  });

  it("sin cambios vale el saldo inicial actual", () => {
    expect(saldoInicialVigente(tarjeta, cambios, "2026-11-30")).toBe(0n);
  });

  it("dos ediciones el mismo día: gana la más reciente, sin importar el orden recibido", () => {
    const mismoDia: CambioSaldoInicial[] = [
      { ...cambio("nequi", 2n, 3n, "2026-10-10"), cambiadoEn: new Date("2026-10-10T20:00:00Z") },
      { ...cambio("nequi", 1n, 2n, "2026-10-10"), cambiadoEn: new Date("2026-10-10T10:00:00Z") },
    ];
    expect(saldoInicialVigente(nequi, mismoDia, "2026-10-10")).toBe(3n);
    expect(saldoInicialVigente(nequi, mismoDia, "2026-10-09")).toBe(1n);
  });
});

describe("patrimonioEn", () => {
  it("al cierre de octubre y de noviembre del escenario", () => {
    expect(patrimonioEn(escenario, "2026-10-31")).toBe(2_580_000n);
    expect(patrimonioEn(escenario, "2026-11-30")).toBe(2_280_000n);
  });

  it("una cuenta creada después de la fecha no cuenta", () => {
    const efectivo: CuentaPatrimonio = {
      id: "efectivo",
      tipo: "efectivo",
      moneda: "COP",
      saldoInicial: 45_000n,
      creadaEl: "2026-11-15",
    };
    const datos = { ...escenario, cuentas: [...escenario.cuentas, efectivo] };
    expect(patrimonioEn(datos, "2026-11-14")).toBe(2_280_000n);
    expect(patrimonioEn(datos, "2026-11-15")).toBe(2_325_000n);
  });

  it("antes de crear cualquier cuenta es cero", () => {
    expect(patrimonioEn(escenario, "2026-09-30")).toBe(0n);
  });

  it("un pasivo resta", () => {
    const datos: DatosPatrimonio = {
      cuentas: [{ ...tarjeta, saldoInicial: 300_000n }],
      cambios: [],
      movimientos: [],
    };
    expect(patrimonioEn(datos, "2026-10-31")).toBe(-300_000n);
  });

  it("una cuenta archivada cuenta en el pasado", () => {
    // El dominio no mira `archivada_en`: una cuenta que existió cuenta en sus fechas.
    const vieja: CuentaPatrimonio = {
      id: "vieja",
      tipo: "efectivo",
      moneda: "COP",
      saldoInicial: 70_000n,
      creadaEl: "2026-08-01",
    };
    const datos: DatosPatrimonio = {
      cuentas: [vieja],
      cambios: [],
      movimientos: [
        mov({ tipo: "gasto", monto: 70_000n, fecha: "2026-10-15", cuentaOrigenId: "vieja" }),
      ],
    };
    expect(patrimonioEn(datos, "2026-09-30")).toBe(70_000n);
    expect(patrimonioEn(datos, "2026-10-31")).toBe(0n);
  });

  it("ignora los movimientos con fecha posterior", () => {
    const datos: DatosPatrimonio = {
      ...escenario,
      movimientos: [
        ...movimientosEscenario,
        mov({ tipo: "gasto", monto: 1_000n, fecha: "2026-12-05", cuentaOrigenId: "nequi" }),
      ],
    };
    expect(patrimonioEn(datos, "2026-11-30")).toBe(2_280_000n);
  });

  it("usa el saldo inicial vigente en la fecha, no el actual", () => {
    const datos: DatosPatrimonio = {
      ...escenario,
      cuentas: [{ ...nequi, saldoInicial: 1_100_000n }, tarjeta],
      cambios: [cambio("nequi", 1_000_000n, 1_100_000n, "2026-11-21")],
    };
    expect(patrimonioEn(datos, "2026-10-31")).toBe(2_580_000n);
    expect(patrimonioEn(datos, "2026-11-30")).toBe(2_380_000n);
  });
});

describe("inicio", () => {
  it("es el día de creación de la cuenta más antigua", () => {
    const vieja = { ...nequi, id: "vieja", creadaEl: "2026-03-14" };
    expect(inicio([nequi, vieja, tarjeta])).toBe("2026-03-14");
  });

  it("sin cuentas es null", () => {
    expect(inicio([])).toBeNull();
  });
});

describe("seriePatrimonio", () => {
  it("omite los puntos anteriores al inicio y termina en hoy", () => {
    expect(seriePatrimonio(escenario, "2026-11-21")).toEqual([
      { fecha: "2026-10-31", patrimonio: 2_580_000n },
      { fecha: "2026-11-21", patrimonio: 2_280_000n },
    ]);
  });

  it("con historial largo da 12 puntos ascendentes: 11 cierres y hoy", () => {
    const datos: DatosPatrimonio = {
      cuentas: [{ ...nequi, creadaEl: "2024-01-01" }],
      cambios: [],
      movimientos: [],
    };
    const serie = seriePatrimonio(datos, "2026-11-21");
    expect(serie).toHaveLength(12);
    expect(serie[0]?.fecha).toBe("2025-12-31");
    expect(serie[10]?.fecha).toBe("2026-10-31");
    expect(serie[11]?.fecha).toBe("2026-11-21");
  });

  it("una cuenta creada hoy da un solo punto", () => {
    const datos: DatosPatrimonio = {
      cuentas: [{ ...nequi, saldoInicial: 975_372n, creadaEl: "2026-11-21" }],
      cambios: [],
      movimientos: [],
    };
    expect(seriePatrimonio(datos, "2026-11-21")).toEqual([
      { fecha: "2026-11-21", patrimonio: 975_372n },
    ]);
  });

  it("sin cuentas es vacía", () => {
    expect(seriePatrimonio({ cuentas: [], cambios: [], movimientos: [] }, "2026-11-21")).toEqual(
      [],
    );
  });
});

describe("cambioDelMes", () => {
  it("el puente cuadra: anterior + resultado + otros = cierre", () => {
    const puente = cambioDelMes(escenario, "2026-11", -300_000n);
    expect(puente).toEqual({
      fechaAnterior: "2026-10-31",
      fechaCierre: "2026-11-30",
      patrimonioAnterior: 2_580_000n,
      resultado: -300_000n,
      revaluacion: 0n,
      otrosCambios: 0n,
      patrimonioCierre: 2_280_000n,
    });
    expect(puente.patrimonioAnterior + puente.resultado + puente.otrosCambios).toBe(
      puente.patrimonioCierre,
    );
  });

  it("con cuentas creadas en el mes, su saldo inicial queda en otrosCambios", () => {
    const puente = cambioDelMes(escenario, "2026-10", 1_580_000n);
    expect(puente).toMatchObject({
      fechaAnterior: "2026-09-30",
      patrimonioAnterior: 0n,
      otrosCambios: 1_000_000n,
      patrimonioCierre: 2_580_000n,
    });
  });

  it("una edición del saldo inicial en el mes queda en otrosCambios", () => {
    const datos: DatosPatrimonio = {
      ...escenario,
      cuentas: [{ ...nequi, saldoInicial: 1_100_000n }, tarjeta],
      cambios: [cambio("nequi", 1_000_000n, 1_100_000n, "2026-11-21")],
    };
    expect(cambioDelMes(datos, "2026-11", -300_000n)).toMatchObject({
      patrimonioAnterior: 2_580_000n,
      otrosCambios: 100_000n,
      patrimonioCierre: 2_380_000n,
    });
  });

  it("un movimiento fechado antes de crear su cuenta también cuadra", () => {
    const datos: DatosPatrimonio = {
      cuentas: [{ ...nequi, saldoInicial: 0n, creadaEl: "2026-11-10" }],
      cambios: [],
      movimientos: [
        mov({ tipo: "ingreso", monto: 500n, fecha: "2026-10-20", cuentaDestinoId: "nequi" }),
      ],
    };
    const puente = cambioDelMes(datos, "2026-11", 0n);
    expect(puente.patrimonioAnterior).toBe(0n);
    expect(puente.patrimonioCierre).toBe(500n);
    expect(puente.otrosCambios).toBe(500n);
  });
});

describe("variacionDeSerie", () => {
  it("es último − primero", () => {
    expect(
      variacionDeSerie([
        { fecha: "2026-10-31", patrimonio: 2_580_000n },
        { fecha: "2026-11-15", patrimonio: 9n },
        { fecha: "2026-11-21", patrimonio: 2_280_000n },
      ]),
    ).toBe(-300_000n);
  });

  it("con menos de dos puntos es cero", () => {
    expect(variacionDeSerie([])).toBe(0n);
    expect(variacionDeSerie([{ fecha: "2026-11-21", patrimonio: 975_372n }])).toBe(0n);
  });
});
