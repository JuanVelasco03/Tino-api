import { describe, expect, it } from "vitest";
import { UNA, activo, op } from "./fixtures.test-utils.js";
import {
  costoPromedio,
  efectivo,
  gananciasRealizadas,
  posicionEn,
  posicionesAbiertas,
  precioUnitario,
} from "./posiciones.js";

const voo = activo("VOO");

describe("posicionEn", () => {
  it("una inicial suma cantidad y costo", () => {
    const p = posicionEn(voo, [op("VOO", "inicial", 2n * UNA, 100_000n, "2026-01-05")]);
    expect(p).toMatchObject({
      cantidad: 2n * UNA,
      costo: 100_000n,
      costoPromedio: 50_000n,
      primeraFecha: "2026-01-05",
    });
  });

  it("varias compras acumulan; el costo promedio es ponderado", () => {
    const p = posicionEn(voo, [
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "compra", 1n * UNA, 80_000n, "2026-01-06"),
    ]);
    expect(p.cantidad).toBe(3n * UNA);
    expect(p.costo).toBe(180_000n);
    expect(p.costoPromedio).toBe(60_000n);
  });

  it("venta parcial: el costo baja en proporción y el costo promedio no cambia", () => {
    const ops = [
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 56_000n, "2026-01-07"),
    ];
    const p = posicionEn(voo, ops);
    expect(p.cantidad).toBe(1n * UNA);
    expect(p.costo).toBe(50_000n);
    expect(p.costoPromedio).toBe(50_000n);
    expect(gananciasRealizadas(ops).get(ops[1]!.id)).toBe(6_000n);
  });

  it("la ganancia realizada puede ser negativa", () => {
    const ops = [
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 40_000n, "2026-01-07"),
    ];
    expect(gananciasRealizadas(ops).get(ops[1]!.id)).toBe(-10_000n);
  });

  it("venta total: cierra la posición, costo 0 y costo promedio nulo", () => {
    const ops = [
      op("VOO", "compra", 3n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 3n * UNA, 120_000n, "2026-01-07"),
    ];
    const p = posicionEn(voo, ops);
    expect(p.cantidad).toBe(0n);
    expect(p.costo).toBe(0n);
    expect(p.costoPromedio).toBeNull();
    expect(posicionesAbiertas([voo], ops)).toEqual([]);
    expect(gananciasRealizadas(ops).get(ops[1]!.id)).toBe(20_000n);
  });

  it("ventas sucesivas redondean por operación y el costo restante cuadra", () => {
    const ops = [
      op("VOO", "compra", 3n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 40_000n, "2026-01-06"),
      op("VOO", "venta", 1n * UNA, 40_000n, "2026-01-07"),
    ];
    // 100000/3 = 33333,33 → 33333; luego 66667/2 = 33333,5 → 33334.
    const p = posicionEn(voo, ops);
    expect(p.costo).toBe(33_333n);
    const g = gananciasRealizadas(ops);
    expect(g.get(ops[1]!.id)).toBe(6_667n);
    expect(g.get(ops[2]!.id)).toBe(6_666n);
  });

  it("a una fecha pasada ignora las operaciones posteriores", () => {
    const ops = [
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 56_000n, "2026-02-07"),
    ];
    expect(posicionEn(voo, ops, "2026-01-31").cantidad).toBe(2n * UNA);
    expect(posicionEn(voo, ops, "2026-01-04").cantidad).toBe(0n);
  });

  it("ordena por fecha y luego por creadoEn, no por el orden recibido", () => {
    const venta = op("VOO", "venta", 1n * UNA, 50_000n, "2026-01-05");
    const compra = op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05", {
      creadoEn: new Date("2025-12-31T00:00:00Z"),
    });
    const p = posicionEn(voo, [venta, compra]);
    expect(p.cantidad).toBe(1n * UNA);
    expect(p.costo).toBe(50_000n);
  });

  it("ignora operaciones de otros activos", () => {
    const p = posicionEn(voo, [op("BTC", "compra", UNA, 1n, "2026-01-05")]);
    expect(p.cantidad).toBe(0n);
  });
});

describe("posicionesAbiertas (N-34)", () => {
  it("ordena por primera operación, luego creadoEn del activo, luego símbolo", () => {
    const btc = activo("BTC", "2026-01-02T00:00:00Z");
    const aapl = activo("AAPL", "2026-01-01T00:00:00Z");
    const msft = activo("MSFT", "2026-01-01T00:00:00Z");
    const ops = [
      op("VOO", "compra", UNA, 1n, "2026-01-10"),
      op("BTC", "compra", UNA, 1n, "2026-01-03"),
      op("AAPL", "compra", UNA, 1n, "2026-01-03"),
      op("MSFT", "compra", UNA, 1n, "2026-01-03"),
    ];
    const orden = posicionesAbiertas([voo, btc, msft, aapl], ops).map((p) => p.activo.simbolo);
    expect(orden).toEqual(["AAPL", "MSFT", "BTC", "VOO"]);
  });
});

describe("efectivo", () => {
  it("resta compras y suma ventas; la inicial no lo toca", () => {
    const ops = [
      op("VOO", "inicial", UNA, 999_999n, "2026-01-01"),
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 56_000n, "2026-01-07"),
    ];
    expect(efectivo(200_000n, ops)).toBe(156_000n);
  });

  it("a una fecha solo cuenta las operaciones hasta ese día", () => {
    const ops = [
      op("VOO", "compra", 2n * UNA, 100_000n, "2026-01-05"),
      op("VOO", "venta", 1n * UNA, 56_000n, "2026-01-07"),
    ];
    expect(efectivo(200_000n, ops, "2026-01-06")).toBe(100_000n);
    expect(efectivo(200_000n, ops, "2026-01-04")).toBe(200_000n);
  });
});

describe("costoPromedio y precioUnitario", () => {
  it("por unidad, redondeado", () => {
    expect(costoPromedio(3n * UNA, 100_000n)).toBe(33_333n);
    expect(costoPromedio(0n, 0n)).toBeNull();
    expect(precioUnitario(100_000n, 2n * UNA)).toBe(50_000n);
    expect(precioUnitario(89_250n, 1_250_000n)).toBe(7_140_000n);
    expect(precioUnitario(1n, 0n)).toBe(0n);
  });
});
