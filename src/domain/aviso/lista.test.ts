import { describe, expect, it } from "vitest";
import { restarDias } from "../fecha/mes.js";
import type { Aviso, AvisoDeuda, AvisoRecurrente, TipoAviso } from "./aviso.js";
import { configEfectiva } from "./config.js";
import { HOY, ZONA, contexto, local } from "./fixtures.test-utils.js";
import { avisosVisibles, contarNoLeidos, disparo, esVisible } from "./lista.js";

function recurrente(clave: string, instante: Date, resuelto = false): AvisoRecurrente {
  return {
    clave,
    tipo: "recurrente",
    instante,
    resuelto,
    recurrenteId: clave,
    vencimiento: HOY,
    monto: 1n,
    estimado: false,
    resolucion: null,
  };
}

function deuda(clave: string, instante: Date, resuelto = false): AvisoDeuda {
  return {
    clave,
    tipo: "deuda",
    instante,
    resuelto,
    prestamoId: clave,
    fechaAcordada: HOY,
    monto: 1n,
    resolucion: null,
  };
}

const TODOS = configEfectiva([]);

describe("disparo", () => {
  it("las 08:00 locales del día", () => {
    expect(disparo(HOY, new Date("2026-01-01T00:00:00Z"), ZONA)).toEqual(local(HOY));
  });

  it("la creación de la fuente si es posterior", () => {
    const creada = local(HOY, "09:15");
    expect(disparo(HOY, creada, ZONA)).toEqual(creada);
  });
});

describe("esVisible", () => {
  it("antes de las 08:00 no sale el aviso de hoy; desde las 08:00, sí", () => {
    const aviso = { instante: local(HOY) };
    expect(esVisible(aviso, contexto("07:59"))).toBe(false);
    expect(esVisible(aviso, contexto("08:00"))).toBe(true);
  });

  it("corte de 60 días: hoy − 60 sale; hoy − 61 no", () => {
    expect(esVisible({ instante: local(restarDias(HOY, 60), "23:00") }, contexto())).toBe(true);
    expect(esVisible({ instante: local(restarDias(HOY, 61), "23:00") }, contexto())).toBe(false);
  });
});

describe("avisosVisibles", () => {
  it("un tipo inactivo no sale", () => {
    const config = configEfectiva([{ tipo: "recurrente", activo: false, dias: 3 }]);
    const avisos = [recurrente("r", local("2026-11-10")), deuda("d", local("2026-11-10"))];
    expect(avisosVisibles(avisos, config, [], contexto()).map((a) => a.tipo)).toEqual(["deuda"]);
  });

  it("leído efectivo: sin marca vale la resolución; la marca gana sobre ella", () => {
    const avisos = [
      recurrente("resuelto", local("2026-11-10"), true),
      recurrente("abierto", local("2026-11-09")),
      recurrente("resuelto-no-leido", local("2026-11-08"), true),
      recurrente("abierto-leido", local("2026-11-07")),
    ];
    const marcas = [
      { clave: "resuelto-no-leido", leido: false },
      { clave: "abierto-leido", leido: true },
    ];
    const lista = avisosVisibles(avisos, TODOS, marcas, contexto());
    expect(lista.map((a) => [a.clave, a.leido])).toEqual([
      ["resuelto", true],
      ["abierto", false],
      ["resuelto-no-leido", false],
      ["abierto-leido", true],
    ]);
    expect(contarNoLeidos(lista)).toBe(2);
  });

  it("orden: instante desc, luego tipo en el orden de TIPOS_AVISO, luego clave", () => {
    const mismo = local("2026-11-10");
    const avisos: Aviso[] = [
      deuda("d-b", mismo),
      recurrente("r-b", mismo),
      deuda("d-a", mismo),
      recurrente("r-a", mismo),
      recurrente("viejo", local("2026-11-01")),
      deuda("nuevo", local("2026-11-11")),
    ];
    const lista = avisosVisibles(avisos, TODOS, [], contexto());
    expect(lista.map((a) => a.clave)).toEqual(["nuevo", "r-a", "r-b", "d-a", "d-b", "viejo"]);
  });

  it("deja fuera los que aún no disparan y los de más de 60 días", () => {
    const avisos = [
      recurrente("futuro", local("2026-11-12")),
      recurrente("viejo", local("2026-09-01")),
      recurrente("hoy", local(HOY)),
    ];
    const lista = avisosVisibles(avisos, TODOS, [], contexto());
    expect(lista.map((a) => a.clave)).toEqual(["hoy"]);
    expect(contarNoLeidos(lista)).toBe(1);
  });

  it("sin avisos, lista vacía y 0 no leídos", () => {
    const lista = avisosVisibles([], TODOS, [], contexto());
    expect(lista).toEqual([]);
    expect(contarNoLeidos(lista)).toBe(0);
  });

  it("precio_manual inactivo por defecto", () => {
    const tipos: TipoAviso[] = TODOS.filter((c) => c.activo).map((c) => c.tipo);
    expect(tipos).not.toContain("precio_manual");
  });
});
