import { describe, expect, it } from "vitest";
import { notaApartados, saldoLibre } from "./apartados.js";

const fondo = { metaId: "fondo", nombre: "Fondo de emergencia", apartado: 1_900_000n };
const viaje = { metaId: "viaje", nombre: "Viaje a Cartagena", apartado: 600_000n };

describe("saldo libre", () => {
  it("saldo menos lo apartado en todas las metas de la cuenta", () => {
    expect(saldoLibre(3_000_000n, [fondo, viaje])).toBe(500_000n);
  });

  it("nota del fondo: Nubank tiene 2.500.000, 1.900.000 aquí y 600.000 para el viaje", () => {
    expect(notaApartados("fondo", 2_500_000n, [fondo, viaje])).toEqual({
      saldoCuenta: 2_500_000n,
      apartadoAqui: 1_900_000n,
      otras: [viaje],
      libre: 0n,
      excedido: false,
    });
  });

  it("un gasto que deja la cuenta por debajo de lo apartado la marca excedida", () => {
    expect(notaApartados("fondo", 2_000_000n, [fondo, viaje])).toMatchObject({
      libre: -500_000n,
      excedido: true,
    });
  });
});
