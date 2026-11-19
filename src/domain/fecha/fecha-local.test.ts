import { describe, expect, it } from "vitest";
import { fechaLocal } from "./fecha-local.js";

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
