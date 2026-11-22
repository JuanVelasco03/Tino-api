import { describe, expect, it } from "vitest";
import { fechaLocal, instanteLocal } from "./fecha-local.js";

describe("fechaLocal", () => {
  it("2026-11-19T03:00Z en America/Bogota es 2026-11-18", () => {
    expect(fechaLocal(new Date("2026-11-19T03:00:00Z"), "America/Bogota")).toBe("2026-11-18");
  });

  it("2026-11-19T05:00Z en America/Bogota ya es 2026-11-19", () => {
    expect(fechaLocal(new Date("2026-11-19T05:00:00Z"), "America/Bogota")).toBe("2026-11-19");
  });

  it("rellena mes y día con cero", () => {
    expect(fechaLocal(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe("2026-01-05");
  });
});

describe("instanteLocal", () => {
  it("las 08:00 del 2026-11-22 en Bogotá son las 13:00 UTC", () => {
    expect(instanteLocal("2026-11-22", "08:00", "America/Bogota").toISOString()).toBe(
      "2026-11-22T13:00:00.000Z",
    );
  });

  it("medianoche local en Bogotá cae en el día siguiente en UTC", () => {
    expect(instanteLocal("2026-12-31", "00:00", "America/Bogota").toISOString()).toBe(
      "2026-12-31T05:00:00.000Z",
    );
  });

  it("en UTC el instante es la misma hora", () => {
    expect(instanteLocal("2026-02-28", "08:00", "UTC").toISOString()).toBe(
      "2026-02-28T08:00:00.000Z",
    );
  });

  describe("zona con cambio de hora (America/New_York, 8 de marzo y 1 de noviembre de 2026)", () => {
    const zona = "America/New_York";

    it("antes del adelanto: 08:00 EST = 13:00 UTC", () => {
      expect(instanteLocal("2026-03-07", "08:00", zona).toISOString()).toBe(
        "2026-03-07T13:00:00.000Z",
      );
    });

    it("el día del adelanto, después del cambio: 08:00 EDT = 12:00 UTC", () => {
      expect(instanteLocal("2026-03-08", "08:00", zona).toISOString()).toBe(
        "2026-03-08T12:00:00.000Z",
      );
    });

    it("el día del adelanto, antes del cambio: 01:30 EST = 06:30 UTC", () => {
      expect(instanteLocal("2026-03-08", "01:30", zona).toISOString()).toBe(
        "2026-03-08T06:30:00.000Z",
      );
    });

    it("una hora inexistente (02:30) se corre lo que dura el salto: 03:30 EDT", () => {
      expect(instanteLocal("2026-03-08", "02:30", zona).toISOString()).toBe(
        "2026-03-08T07:30:00.000Z",
      );
    });

    it("una hora repetida (01:30 del atraso) da el primer instante, en EDT", () => {
      expect(instanteLocal("2026-11-01", "01:30", zona).toISOString()).toBe(
        "2026-11-01T05:30:00.000Z",
      );
    });

    it("el día del atraso, después del cambio: 08:00 EST = 13:00 UTC", () => {
      expect(instanteLocal("2026-11-01", "08:00", zona).toISOString()).toBe(
        "2026-11-01T13:00:00.000Z",
      );
    });

    it("antes del atraso: 08:00 EDT = 12:00 UTC", () => {
      expect(instanteLocal("2026-10-31", "08:00", zona).toISOString()).toBe(
        "2026-10-31T12:00:00.000Z",
      );
    });
  });

  it("ida y vuelta con fechaLocal en varias zonas y fechas", () => {
    const zonas = ["America/Bogota", "America/New_York", "Europe/Madrid", "Asia/Tokyo", "UTC"];
    const fechas = [
      "2026-01-01",
      "2026-03-08",
      "2026-03-29",
      "2026-10-25",
      "2026-11-01",
      "2026-12-31",
    ];
    for (const zona of zonas) {
      for (const fecha of fechas) {
        for (const hora of ["00:00", "08:00", "23:59"]) {
          expect(fechaLocal(instanteLocal(fecha, hora, zona), zona)).toBe(fecha);
        }
      }
    }
  });
});
