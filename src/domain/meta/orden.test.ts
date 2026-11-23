import { describe, expect, it } from "vitest";
import { ordenarActivas, ordenarArchivadas, ordenarCumplidas } from "./orden.js";

const meta = (
  id: string,
  fechaMeta: string | null,
  creado: string,
  extra: { cumplidaEl?: string; archivadaEn?: string } = {},
) => ({
  id,
  fechaMeta,
  creadoEn: new Date(creado),
  cumplidaEl: extra.cumplidaEl ?? null,
  archivadaEn: extra.archivadaEn === undefined ? null : new Date(extra.archivadaEn),
});

describe("orden", () => {
  it("activas: fecha más cercana, sin fecha al final, empate por creación", () => {
    const metas = [
      meta("sin-fecha", null, "2026-01-01"),
      meta("cuota", "2027-12-31", "2026-07-31"),
      meta("viaje", "2026-12-15", "2026-09-20"),
      meta("sin-fecha-vieja", null, "2025-01-01"),
      meta("viaje-2", "2026-12-15", "2026-09-01"),
    ];
    expect(ordenarActivas(metas).map((m) => m.id)).toEqual([
      "viaje-2",
      "viaje",
      "cuota",
      "sin-fecha-vieja",
      "sin-fecha",
    ]);
  });

  it("cumplidas: la más reciente primero", () => {
    const metas = [
      meta("moto", null, "2026-07-02", { cumplidaEl: "2026-09-12" }),
      meta("nevera", null, "2026-01-01", { cumplidaEl: "2026-10-01" }),
    ];
    expect(ordenarCumplidas(metas).map((m) => m.id)).toEqual(["nevera", "moto"]);
  });

  it("archivadas: la archivada más recientemente primero", () => {
    const metas = [
      meta("a", null, "2026-01-01", { archivadaEn: "2026-10-01T00:00:00Z" }),
      meta("b", null, "2026-01-01", { archivadaEn: "2026-11-01T00:00:00Z" }),
    ];
    expect(ordenarArchivadas(metas).map((m) => m.id)).toEqual(["b", "a"]);
  });
});
