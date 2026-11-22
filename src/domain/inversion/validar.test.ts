import { describe, expect, it } from "vitest";
import { UNA, op } from "./fixtures.test-utils.js";
import {
  movimientosDeCaja,
  normalizarSimbolo,
  primerPrecio,
  inversionesTocadas,
  validarAltaInversion,
  validarCambioOperacion,
  validarLineaDeTiempo,
  validarOperacion,
  validarMovimientoConInversion,
  validarPrecio,
  nombreDeActivo,
  validarTrasCambio,
  type OperacionEntrada,
} from "./validar.js";

const HOY = "2026-11-21";

const compra = (cambios: Partial<OperacionEntrada> = {}): OperacionEntrada => ({
  clase: "compra",
  simbolo: "voo",
  nombre: "Vanguard S&P 500 ETF",
  cantidad: "2",
  monto: 100_000n,
  fecha: HOY,
  ...cambios,
});

describe("normalizarSimbolo", () => {
  it("recorta y pasa a mayúsculas", () => {
    expect(normalizarSimbolo("  voo ")).toBe("VOO");
    expect(normalizarSimbolo("brk.b")).toBe("BRK.B");
    expect(normalizarSimbolo("btc-usd")).toBe("BTC-USD");
  });

  it.each(["", "con espacios", ".VOO", "-X", "ABCDEFGHIJKLM", "VOO$"])("%j es inválido", (s) => {
    expect(normalizarSimbolo(s)).toBeNull();
  });
});

describe("validarOperacion", () => {
  it("una compra válida", () => {
    expect(validarOperacion(compra(), HOY)).toBeNull();
    expect(validarOperacion(compra({ nombre: null }), HOY)).toBeNull();
  });

  it.each([
    [{ clase: "dividendo" }, "ENTRADA_INVALIDA", "clase"],
    [{ simbolo: "con espacios" }, "SIMBOLO_INVALIDO", "simbolo"],
    [{ nombre: "  " }, "NOMBRE_REQUERIDO", "nombre"],
    [{ nombre: "x".repeat(81) }, "NOMBRE_LARGO", "nombre"],
    [{ cantidad: "0.000000001" }, "CANTIDAD_INVALIDA", "cantidad"],
    [{ cantidad: "0" }, "CANTIDAD_INVALIDA", "cantidad"],
    [{ monto: 0n }, "MONTO_REQUERIDO", "monto"],
    [{ fecha: "2026-02-30" }, "FECHA_INVALIDA", "fecha"],
    [{ fecha: "2026-11-22" }, "FECHA_FUTURA", "fecha"],
    [{ cantidad: "1000", monto: 1n }, "PRECIO_INVALIDO", "precio"],
  ] as const)("caso %# → %s", (cambios, codigo, campo) => {
    expect(validarOperacion(compra(cambios), HOY)).toEqual({ codigo, campo });
  });

  it("80 caracteres de nombre son válidos", () => {
    expect(validarOperacion(compra({ nombre: "x".repeat(80) }), HOY)).toBeNull();
  });
});

describe("primerPrecio", () => {
  it("monto ÷ cantidad por unidad", () => {
    expect(primerPrecio(100_000n, 2n * UNA)).toBe(50_000n);
    expect(primerPrecio(1n, 1000n * UNA)).toBeNull();
  });
});

describe("validarCambioOperacion", () => {
  it("al menos un campo", () => {
    expect(validarCambioOperacion({}, HOY)).toEqual({ codigo: "SIN_CAMBIOS" });
  });

  it("cada campo con las reglas del alta", () => {
    expect(validarCambioOperacion({ monto: 90_000n }, HOY)).toBeNull();
    expect(validarCambioOperacion({ cantidad: "-1" }, HOY)).toEqual({
      codigo: "CANTIDAD_INVALIDA",
      campo: "cantidad",
    });
    expect(validarCambioOperacion({ monto: 0n }, HOY)).toEqual({
      codigo: "MONTO_REQUERIDO",
      campo: "monto",
    });
    expect(validarCambioOperacion({ fecha: "2027-01-01" }, HOY)).toEqual({
      codigo: "FECHA_FUTURA",
      campo: "fecha",
    });
  });
});

describe("validarPrecio", () => {
  it("entero > 0", () => {
    expect(validarPrecio(56_240n)).toBeNull();
    expect(validarPrecio(0n)).toEqual({ codigo: "PRECIO_INVALIDO", campo: "precio" });
  });
});

describe("validarAltaInversion", () => {
  const alta = {
    nombre: "eToro",
    moneda: "USD",
    efectivoInicial: 0n,
    posiciones: [] as {
      simbolo: string;
      nombre: string | null;
      cantidad: string;
      costo: bigint;
      fecha: string;
    }[],
  };
  const posicion = { simbolo: "VOO", nombre: "VOO", cantidad: "1", costo: 1000n, fecha: HOY };

  it("válida con y sin posiciones", () => {
    expect(validarAltaInversion(alta, HOY)).toBeNull();
    expect(validarAltaInversion({ ...alta, posiciones: [posicion] }, HOY)).toBeNull();
  });

  it.each([
    [{ nombre: " " }, { codigo: "NOMBRE_REQUERIDO", campo: "nombre" }],
    [{ nombre: "x".repeat(61) }, { codigo: "NOMBRE_LARGO", campo: "nombre" }],
    [{ moneda: "EUR" }, { codigo: "MONEDA_INVALIDA", campo: "moneda" }],
    [{ efectivoInicial: -1n }, { codigo: "MONTO_INVALIDO", campo: "efectivoInicial" }],
  ])("caso %#", (cambios, esperado) => {
    expect(validarAltaInversion({ ...alta, ...cambios }, HOY)).toEqual(esperado);
  });

  it("posiciones como operaciones iniciales, con su ruta", () => {
    expect(
      validarAltaInversion(
        { ...alta, posiciones: [posicion, { ...posicion, simbolo: "con espacios" }] },
        HOY,
      ),
    ).toEqual({ codigo: "SIMBOLO_INVALIDO", campo: "posiciones.1.simbolo" });
    expect(
      validarAltaInversion({ ...alta, posiciones: [{ ...posicion, costo: 0n }] }, HOY),
    ).toEqual({ codigo: "MONTO_REQUERIDO", campo: "posiciones.0.costo" });
  });

  it("símbolos repetidos tras normalizar → ACTIVO_DUPLICADO", () => {
    expect(
      validarAltaInversion(
        { ...alta, posiciones: [posicion, { ...posicion, simbolo: " voo" }] },
        HOY,
      ),
    ).toEqual({ codigo: "ACTIVO_DUPLICADO", campo: "posiciones" });
  });
});

describe("validarLineaDeTiempo (N-65)", () => {
  it("válida con fondeo antes de comprar", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 0n,
        movimientos: [{ fecha: "2026-01-01", delta: 200_000n }],
        operaciones: [op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-02")],
      }),
    ).toBeNull();
  });

  it("efectivo negativo un día intermedio, aunque luego se reponga", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 0n,
        movimientos: [
          { fecha: "2026-01-01", delta: 100_000n },
          { fecha: "2026-01-05", delta: 100_000n },
        ],
        operaciones: [op("VOO", "compra", UNA, 150_000n, "2026-01-03")],
      }),
    ).toEqual({ codigo: "EFECTIVO_INSUFICIENTE" });
  });

  it("dentro de un mismo día cuenta el cierre, no el orden", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 0n,
        movimientos: [{ fecha: "2026-01-03", delta: 150_000n }],
        operaciones: [op("VOO", "compra", UNA, 150_000n, "2026-01-03")],
      }),
    ).toBeNull();
  });

  it("el saldo inicial rige desde el principio; la inicial no mueve efectivo", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 100_000n,
        movimientos: [],
        operaciones: [
          op("VOO", "inicial", UNA, 999_999n, "2025-12-01"),
          op("VOO", "compra", UNA, 100_000n, "2025-12-02"),
        ],
      }),
    ).toBeNull();
  });

  it("venta antes de la compra → CANTIDAD_INSUFICIENTE", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 1_000_000n,
        movimientos: [],
        operaciones: [
          op("VOO", "venta", UNA, 50_000n, "2026-01-02"),
          op("VOO", "compra", UNA, 50_000n, "2026-01-03"),
        ],
      }),
    ).toEqual({ codigo: "CANTIDAD_INSUFICIENTE", campo: "cantidad" });
  });

  it("borrar una compra con una venta posterior → CANTIDAD_INSUFICIENTE", () => {
    const comprada = op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-02");
    const vendida = op("VOO", "venta", UNA, 56_000n, "2026-01-03");
    const linea = { saldoInicial: 200_000n, movimientos: [], operaciones: [comprada, vendida] };
    expect(validarLineaDeTiempo(linea)).toBeNull();
    expect(validarLineaDeTiempo({ ...linea, operaciones: [vendida] })).toEqual({
      codigo: "CANTIDAD_INSUFICIENTE",
      campo: "cantidad",
    });
  });

  it("las cantidades son por activo", () => {
    expect(
      validarLineaDeTiempo({
        saldoInicial: 1_000_000n,
        movimientos: [],
        operaciones: [
          op("VOO", "compra", UNA, 50_000n, "2026-01-02"),
          op("BTC", "venta", UNA, 50_000n, "2026-01-03"),
        ],
      }),
    ).toEqual({ codigo: "CANTIDAD_INSUFICIENTE", campo: "cantidad" });
  });
});

describe("movimientosDeCaja", () => {
  it("entra montoDestino ?? monto y sale monto", () => {
    expect(
      movimientosDeCaja("i", [
        {
          fecha: "2026-01-01",
          monto: 8_240_000n,
          montoDestino: 200_000n,
          cuentaOrigenId: "b",
          cuentaDestinoId: "i",
        },
        {
          fecha: "2026-01-02",
          monto: 100_000n,
          montoDestino: 412_000n,
          cuentaOrigenId: "i",
          cuentaDestinoId: "b",
        },
        {
          fecha: "2026-01-03",
          monto: 5n,
          montoDestino: null,
          cuentaOrigenId: "j",
          cuentaDestinoId: "i",
        },
        {
          fecha: "2026-01-04",
          monto: 9n,
          montoDestino: null,
          cuentaOrigenId: "b",
          cuentaDestinoId: "x",
        },
      ]),
    ).toEqual([
      { fecha: "2026-01-01", delta: 200_000n },
      { fecha: "2026-01-02", delta: -100_000n },
      { fecha: "2026-01-03", delta: 5n },
    ]);
  });
});

describe("validarTrasCambio", () => {
  const fondeo = {
    id: "f",
    fecha: "2026-01-01",
    monto: 8_240_000n,
    montoDestino: 200_000n,
    cuentaOrigenId: "b",
    cuentaDestinoId: "i",
  };
  const compra = { ...op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-02"), id: "c" };
  const estado = { saldoInicial: 0n, efectos: [fondeo], operaciones: [compra] };

  it("sin cambios, válida", () => {
    expect(validarTrasCambio("i", estado, {})).toBeNull();
  });

  it("borrar el fondeo deja el efectivo negativo", () => {
    expect(validarTrasCambio("i", estado, { movimiento: { id: "f", nuevo: null } })).toEqual({
      codigo: "EFECTIVO_INSUFICIENTE",
    });
  });

  it("un retiro mayor al efectivo se rechaza; uno menor pasa", () => {
    const retiro = (monto: bigint) => ({
      id: "nuevo",
      fecha: "2026-01-03",
      monto,
      montoDestino: monto * 41n,
      cuentaOrigenId: "i",
      cuentaDestinoId: "b",
    });
    expect(
      validarTrasCambio("i", estado, { movimiento: { id: "nuevo", nuevo: retiro(200_000n) } }),
    ).toEqual({ codigo: "EFECTIVO_INSUFICIENTE" });
    expect(
      validarTrasCambio("i", estado, { movimiento: { id: "nuevo", nuevo: retiro(100_000n) } }),
    ).toBeNull();
  });

  it("editar una operación la reemplaza; borrarla la quita", () => {
    expect(
      validarTrasCambio("i", estado, {
        operacion: { id: "c", nueva: { ...compra, monto: 300_000n } },
      }),
    ).toEqual({ codigo: "EFECTIVO_INSUFICIENTE" });
    expect(validarTrasCambio("i", estado, { operacion: { id: "c", nueva: null } })).toBeNull();
  });

  it("bajar el saldo inicial cuenta desde el principio", () => {
    const sinFondeo = { ...estado, efectos: [], saldoInicial: 100_000n };
    expect(validarTrasCambio("i", sinFondeo, {})).toBeNull();
    expect(validarTrasCambio("i", sinFondeo, { saldoInicial: 99_999n })).toEqual({
      codigo: "EFECTIVO_INSUFICIENTE",
    });
  });
});

describe("validarMovimientoConInversion", () => {
  const cuentas = new Map([
    ["b", { tipo: "banco", moneda: "COP" as const }],
    ["n", { tipo: "efectivo", moneda: "COP" as const }],
    ["i", { tipo: "inversion", moneda: "USD" as const }],
    ["k", { tipo: "inversion", moneda: "COP" as const }],
  ]);
  const mov = (
    tipo: "gasto" | "ingreso" | "transferencia",
    origen: string | null,
    destino: string | null,
    montoDestino: bigint | null = null,
  ) => ({ tipo, cuentaOrigenId: origen, cuentaDestinoId: destino, montoDestino });

  it("gasto o ingreso con una inversión → CUENTA_DE_INVERSION con su campo", () => {
    expect(validarMovimientoConInversion(mov("gasto", "i", null), cuentas)).toEqual({
      codigo: "CUENTA_DE_INVERSION",
      campo: "cuentaOrigenId",
    });
    expect(validarMovimientoConInversion(mov("ingreso", null, "k"), cuentas)).toEqual({
      codigo: "CUENTA_DE_INVERSION",
      campo: "cuentaDestinoId",
    });
  });

  it("entre monedas exige montoDestino; con la misma lo rechaza", () => {
    expect(validarMovimientoConInversion(mov("transferencia", "b", "i"), cuentas)).toEqual({
      codigo: "MONTO_DESTINO_REQUERIDO",
      campo: "montoDestino",
    });
    expect(validarMovimientoConInversion(mov("transferencia", "b", "i", 1n), cuentas)).toBeNull();
    expect(validarMovimientoConInversion(mov("transferencia", "b", "n", 1n), cuentas)).toEqual({
      codigo: "MONTO_DESTINO_NO_PERMITIDO",
      campo: "montoDestino",
    });
    expect(validarMovimientoConInversion(mov("transferencia", "b", "k"), cuentas)).toBeNull();
  });

  it("inversionesTocadas", () => {
    expect(inversionesTocadas(["b", "i", null, "i", "x"], cuentas)).toEqual(["i"]);
  });
});

describe("nombreDeActivo (SPEC 11)", () => {
  const cubre = {
    cubierto: true as const,
    clase: "etf" as const,
    simboloFuente: "VOO",
    nombre: "Vanguard S&P 500 ETF",
  };

  it("con nombre del usuario, gana el del usuario", () => {
    expect(nombreDeActivo("  Mi VOO ", cubre)).toBe("Mi VOO");
    expect(nombreDeActivo("Renovables", { cubierto: false })).toBe("Renovables");
  });

  it("sin nombre y cubierto, el del proveedor recortado a 80", () => {
    expect(nombreDeActivo(null, cubre)).toBe("Vanguard S&P 500 ETF");
    expect(nombreDeActivo(null, { ...cubre, nombre: "x".repeat(90) })).toHaveLength(80);
  });

  it("sin nombre y sin cobertura, null (NOMBRE_REQUERIDO)", () => {
    expect(nombreDeActivo(null, { cubierto: false })).toBeNull();
    expect(nombreDeActivo("  ", { cubierto: false })).toBeNull();
  });

  it("validarAltaInversion admite una posición sin nombre", () => {
    expect(
      validarAltaInversion(
        {
          nombre: "eToro",
          moneda: "USD",
          efectivoInicial: 0n,
          posiciones: [{ simbolo: "VOO", nombre: null, cantidad: "1", costo: 1000n, fecha: HOY }],
        },
        HOY,
      ),
    ).toBeNull();
  });
});
