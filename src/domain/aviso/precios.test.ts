import { describe, expect, it } from "vitest";
import { UNA, activo, op, precio } from "../inversion/fixtures.test-utils.js";
import { contexto, local } from "./fixtures.test-utils.js";
import { avisosDePrecios, serieManual, type CuentaDeAvisos } from "./precios.js";

const CUENTAS: CuentaDeAvisos[] = [{ id: "cuenta", archivadaEn: null }];
const finca = activo("FINCA");
const operaciones = [op("FINCA", "inicial", UNA, 1_000_000n, "2026-10-01")];

describe("avisosDePrecios", () => {
  it("activo manual con último precio hace 8 días y plazo 7: un aviso sin resolver", () => {
    const precios = [precio("FINCA", 100n, "2026-10-01"), precio("FINCA", 110n, "2026-11-03")];
    const avisos = avisosDePrecios(CUENTAS, [finca], operaciones, precios, 7, contexto());
    const abiertos = avisos.filter((a) => !a.resuelto);
    expect(abiertos).toEqual([
      {
        clave: "precio_manual:activo-FINCA:2026-11-03",
        tipo: "precio_manual",
        instante: local("2026-11-10"),
        resuelto: false,
        activoId: "activo-FINCA",
        cuentaId: "cuenta",
        precioFecha: "2026-11-03",
        resolucion: null,
      },
    ]);
    // El hueco de octubre (más de 7 días) dejó un aviso ya resuelto.
    expect(avisos.filter((a) => a.resuelto).map((a) => a.resolucion)).toEqual([
      { fecha: "2026-11-03" },
    ]);
  });

  it("un precio nuevo lo resuelve y abre un nuevo plazo", () => {
    const precios = [
      precio("FINCA", 110n, "2026-11-03"),
      precio("FINCA", 120n, "2026-11-11", "2026-11-11T15:00:00Z"),
    ];
    const avisos = avisosDePrecios(CUENTAS, [finca], operaciones, precios, 7, contexto());
    expect(avisos.find((a) => a.precioFecha === "2026-11-03")?.resolucion).toEqual({
      fecha: "2026-11-11",
    });
    const nuevo = avisos.find((a) => a.precioFecha === "2026-11-11")!;
    expect(nuevo.resuelto).toBe(false);
    expect(nuevo.instante).toEqual(local("2026-11-18"));
  });

  it("huecos menores al plazo no dan aviso", () => {
    const precios = [
      precio("FINCA", 100n, "2026-10-01"),
      precio("FINCA", 101n, "2026-10-05"),
      precio("FINCA", 102n, "2026-10-10"),
    ];
    const avisos = avisosDePrecios(CUENTAS, [finca], operaciones, precios, 7, contexto());
    expect(avisos.map((a) => a.precioFecha)).toEqual(["2026-10-10"]);
  });

  it("un activo automático no da avisos", () => {
    const voo = activo("VOO", undefined, {
      cotizacion: "automatica",
      clase: "etf",
      simboloFuente: "VOO",
    });
    const ops = [op("VOO", "inicial", UNA, 1_000n, "2026-10-01")];
    const precios = [precio("VOO", 100n, "2026-10-01")];
    expect(avisosDePrecios(CUENTAS, [voo], ops, precios, 7, contexto())).toEqual([]);
  });

  it("un activo sin posición no da avisos", () => {
    const vendido = [...operaciones, op("FINCA", "venta", UNA, 1_100_000n, "2026-10-15")];
    const precios = [precio("FINCA", 100n, "2026-10-01")];
    expect(avisosDePrecios(CUENTAS, [finca], vendido, precios, 7, contexto())).toEqual([]);
  });

  it("un activo de una cuenta archivada (o que no llegó) no da avisos", () => {
    const precios = [precio("FINCA", 100n, "2026-10-01")];
    const archivada: CuentaDeAvisos[] = [{ id: "cuenta", archivadaEn: new Date() }];
    expect(avisosDePrecios(archivada, [finca], operaciones, precios, 7, contexto())).toEqual([]);
    expect(avisosDePrecios([], [finca], operaciones, precios, 7, contexto())).toEqual([]);
  });
});

describe("serieManual", () => {
  it("toma los manuales, uno por fecha (el último cotizado)", () => {
    const serie = serieManual(
      "activo-FINCA",
      [
        precio("FINCA", 100n, "2026-10-01", "2026-10-01T10:00:00Z"),
        precio("FINCA", 105n, "2026-10-01", "2026-10-01T18:00:00Z"),
        precio("OTRO", 1n, "2026-10-02"),
      ],
      "2026-11-11",
    );
    expect(serie.map((p) => p.precio)).toEqual([105n]);
  });

  it("suma el vigente si no es manual (un activo que fue automático)", () => {
    const serie = serieManual(
      "activo-FINCA",
      [
        precio("FINCA", 100n, "2026-09-01"),
        precio("FINCA", 90n, "2026-10-01", undefined, "cierre"),
        precio("FINCA", 95n, "2026-10-02", undefined, "cierre"),
      ],
      "2026-11-11",
    );
    expect(serie.map((p) => p.fecha)).toEqual(["2026-09-01", "2026-10-02"]);
  });
});
