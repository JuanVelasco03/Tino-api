import { describe, expect, it } from "vitest";
import { restarDias, sumarDias } from "../fecha/mes.js";
import {
  BANCOLOMBIA,
  NEQUI,
  condonacion,
  interes,
  prestamo,
  ref,
  transferencia,
} from "../prestamo/fixtures.test-utils.js";
import type { MovimientoDePrestamo } from "../prestamo/prestamo.js";
import { HOY, contexto, local } from "./fixtures.test-utils.js";
import { avisosDeCobros, avisosDeDeudas, capitalAl, type InteresConPrestamo } from "./prestamos.js";

const ACORDADA = restarDias(HOY, 38); // 2026-10-04

// Camila: le prestaste 600.000 y abonó 100.000 antes de la fecha acordada.
const camila = prestamo("camila", "prestamo_otorgado", {
  nombre: "Camila",
  fechaAcordada: ACORDADA,
  creadoEn: new Date("2026-08-14T12:00:00Z"),
});
const movimientosCamila: MovimientoDePrestamo[] = [
  transferencia("c-desembolso", "2026-08-14", 600_000n, NEQUI, ref(camila)),
  transferencia("c-abono", "2026-09-02", 100_000n, ref(camila), NEQUI),
];

const conPrestamo = (i: ReturnType<typeof interes>, prestamoId: string): InteresConPrestamo => ({
  ...i,
  prestamoId,
});

describe("avisosDeCobros", () => {
  it("Camila, cada 30 días: avisos en la acordada y en +30, próximo en +60, sin resolver", () => {
    const avisos = avisosDeCobros([camila], movimientosCamila, [], 30, contexto());
    expect(avisos.map((a) => a.recordatorio)).toEqual([ACORDADA, sumarDias(ACORDADA, 30)]);
    for (const a of avisos) {
      expect(a.resuelto).toBe(false);
      expect(a.resolucion).toBeNull();
      expect(a.monto).toBe(500_000n);
      expect(a.fechaAcordada).toBe(ACORDADA);
      expect(a.proximoRecordatorio).toBe(sumarDias(ACORDADA, 60));
    }
    expect(avisos[0]!.clave).toBe(`cobro:camila:${ACORDADA}`);
    expect(avisos[0]!.instante).toEqual(local(ACORDADA));
    expect(capitalAl(camila, movimientosCamila, HOY)).toBe(500_000n);
  });

  it("un abono posterior resuelve los recordatorios anteriores a él, pero no los que vienen después", () => {
    const abono = transferencia("c-abono-2", "2026-10-20", 50_000n, ref(camila), BANCOLOMBIA);
    const avisos = avisosDeCobros([camila], [...movimientosCamila, abono], [], 30, contexto());
    expect(avisos[0]!.resuelto).toBe(true);
    expect(avisos[0]!.resolucion).toEqual({
      forma: "abono",
      fecha: "2026-10-20",
      monto: 50_000n,
      cuenta: BANCOLOMBIA,
    });
    expect(avisos[0]!.monto).toBe(50_000n);
    expect(avisos[1]!.resuelto).toBe(false);
    expect(avisos[1]!.monto).toBe(450_000n);
  });

  it("el interés enlazado suma al abono; un abono de solo interés también resuelve", () => {
    const abono = transferencia("c-abono-2", "2026-10-20", 50_000n, ref(camila), NEQUI);
    const enlazado = conPrestamo(interes("c-int", "2026-10-20", 6_000n, "c-abono-2"), "camila");
    const [primero] = avisosDeCobros(
      [camila],
      [...movimientosCamila, abono],
      [enlazado],
      30,
      contexto(),
    );
    expect(primero!.resolucion?.monto).toBe(56_000n);

    const suelto = conPrestamo(interes("c-int-2", "2026-11-05", 5_000n, null), "camila");
    const avisos = avisosDeCobros([camila], movimientosCamila, [suelto], 30, contexto());
    expect(avisos[1]!.resolucion).toEqual({
      forma: "abono",
      fecha: "2026-11-05",
      monto: 5_000n,
      cuenta: NEQUI,
    });
  });

  it("con dias = 0, un solo aviso y sin próximo recordatorio", () => {
    const avisos = avisosDeCobros([camila], movimientosCamila, [], 0, contexto());
    expect(avisos.map((a) => a.recordatorio)).toEqual([ACORDADA]);
    expect(avisos[0]!.proximoRecordatorio).toBeNull();
  });

  it("con el capital en 0 al día R, no hay aviso en R", () => {
    // Saldado el 2026-10-10; vuelve a prestar el 2026-11-05.
    const movimientos = [
      ...movimientosCamila,
      transferencia("c-saldo", "2026-10-10", 500_000n, ref(camila), NEQUI),
      transferencia("c-otra", "2026-11-05", 70_000n, NEQUI, ref(camila)),
    ];
    const avisos = avisosDeCobros([camila], movimientos, [], 14, contexto());
    // Recordatorios: 10-04 (capital 500.000), 10-18 y 11-01 (capital 0).
    expect(avisos.map((a) => a.recordatorio)).toEqual([ACORDADA]);
    expect(avisos[0]!.resuelto).toBe(true);
    expect(avisos[0]!.proximoRecordatorio).toBe("2026-11-15");
  });

  it("saldado hoy: sin próximo recordatorio", () => {
    const movimientos = [
      ...movimientosCamila,
      transferencia("c-saldo", "2026-11-10", 500_000n, ref(camila), NEQUI),
    ];
    const avisos = avisosDeCobros([camila], movimientos, [], 30, contexto());
    expect(avisos.every((a) => a.proximoRecordatorio === null)).toBe(true);
    expect(avisos.every((a) => a.resuelto)).toBe(true);
  });

  it("una condonación resuelve con cuenta null", () => {
    const perdon = condonacion("c-perdon", "2026-10-10", 100_000n, ref(camila));
    const [primero] = avisosDeCobros([camila], [...movimientosCamila, perdon], [], 30, contexto());
    expect(primero!.resolucion).toEqual({
      forma: "condonacion",
      fecha: "2026-10-10",
      monto: 100_000n,
      cuenta: null,
    });
  });

  it("sin fecha acordada no hay aviso", () => {
    const sinFecha = { ...camila, fechaAcordada: null };
    expect(avisosDeCobros([sinFecha], movimientosCamila, [], 30, contexto())).toEqual([]);
  });

  it("una deuda no da avisos de cobro", () => {
    const deuda = { ...camila, tipo: "deuda_contraida" as const };
    expect(avisosDeCobros([deuda], movimientosCamila, [], 30, contexto())).toEqual([]);
  });

  it("los movimientos de otro préstamo no cuentan", () => {
    const otro = prestamo("otro", "prestamo_otorgado");
    const ajeno = transferencia("o-abono", "2026-10-20", 1_000n, ref(otro), NEQUI);
    const avisos = avisosDeCobros([camila], [...movimientosCamila, ajeno], [], 30, contexto());
    expect(avisos.every((a) => !a.resuelto)).toBe(true);
  });
});

describe("avisosDeDeudas", () => {
  const D = "2026-11-10";
  const mama = prestamo("mama", "deuda_contraida", {
    nombre: "Mamá",
    fechaAcordada: D,
    creadoEn: new Date("2026-03-03T12:00:00Z"),
  });
  const movimientosMama: MovimientoDePrestamo[] = [
    transferencia("m-desembolso", "2026-03-03", 600_000n, ref(mama), BANCOLOMBIA),
    transferencia("m-abono", D, 100_000n, NEQUI, ref(mama)),
  ];

  it("mamá, antelación 3, abono de 100.000 en D: aviso en D − 3, resuelto con el abono y su cuenta", () => {
    const [aviso, ...resto] = avisosDeDeudas([mama], movimientosMama, [], 3, contexto());
    expect(resto).toEqual([]);
    expect(aviso).toEqual({
      clave: `deuda:mama:${D}`,
      tipo: "deuda",
      instante: local("2026-11-07"),
      resuelto: true,
      prestamoId: "mama",
      fechaAcordada: D,
      monto: 100_000n,
      resolucion: { forma: "abono", fecha: D, monto: 100_000n, cuenta: NEQUI },
    });
    expect(capitalAl(mama, movimientosMama, HOY)).toBe(500_000n);
  });

  it("sin resolver, el monto es el capital pendiente de hoy", () => {
    const [aviso] = avisosDeDeudas([mama], movimientosMama.slice(0, 1), [], 3, contexto());
    expect(aviso!.resuelto).toBe(false);
    expect(aviso!.monto).toBe(600_000n);
  });

  it("sin capital al día del aviso no hay aviso", () => {
    const saldada = [
      ...movimientosMama.slice(0, 1),
      transferencia("m-todo", "2026-11-01", 600_000n, NEQUI, ref(mama)),
    ];
    expect(avisosDeDeudas([mama], saldada, [], 3, contexto())).toEqual([]);
  });

  it("sin fecha acordada no hay aviso", () => {
    const sinFecha = { ...mama, fechaAcordada: null };
    expect(avisosDeDeudas([sinFecha], movimientosMama, [], 3, contexto())).toEqual([]);
  });

  it("un préstamo otorgado no da avisos de deuda", () => {
    expect(avisosDeDeudas([camila], movimientosCamila, [], 3, contexto())).toEqual([]);
  });
});
