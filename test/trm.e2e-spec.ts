/**
 * /trm de punta a punta (SPEC 09): obtención bajo demanda, caché por usuario,
 * respaldo con la última conocida y falla de la fuente.
 *
 * La fuente real (`TrmFuente`) se reemplaza por una falsa que cuenta
 * llamadas: las e2e no dependen de la red. La forma real queda fijada en las
 * pruebas de `aTrm` (`src/repositories/datos-gov/trm.fuente.test.ts`).
 *
 * `SUPABASE_SECRET_KEY` se usa SOLO para crear y borrar usuarios de prueba y
 * para comprobar filas en la base. La API nunca lo usa (REGLAS §4). Apunta
 * solo a Tino dev, nunca a datos reales.
 */
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fechaLocal } from "../src/domain/fecha/fecha-local.js";
import { restarDias, sumarDias } from "../src/domain/fecha/mes.js";
import type { Trm } from "../src/domain/trm/trm.js";
import { parsearValor } from "../src/domain/trm/valor.js";
import { TrmFuente } from "../src/repositories/datos-gov/trm.fuente.js";
import type { TrmVigenteDto } from "../src/trm/dto.js";
import {
  api,
  conUsuarios,
  crearApp,
  crearFabricaUsuarios,
  esperarError,
  type UsuarioPrueba,
} from "./utilidades.js";

if (!conUsuarios) {
  console.warn(
    "[trm] Parte con usuarios OMITIDA: falta SUPABASE_SECRET_KEY (o SUPABASE_URL / " +
      "SUPABASE_PUBLISHABLE_KEY). Defínela en .env.test.local.",
  );
}

/** Zona por defecto del perfil (SPEC 02): la de los usuarios de prueba. */
const ZONA = "America/Bogota";
const FUENTE = "Superintendencia Financiera de Colombia";

const fuente = { obtenerEn: vi.fn<(fecha: string) => Promise<Trm | null>>() };

/** Lo que devolvería la fuente para `valor` con vigencia desde..hasta. */
function trm(valor: string, vigenteDesde: string, vigenteHasta: string): Trm {
  return { valorCent: parsearValor(valor)!, vigenteDesde, vigenteHasta };
}

describe("/trm", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp([{ proveedor: TrmFuente, valor: fuente }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token responde 401 NO_AUTENTICADO", async () => {
    esperarError(await request(app.getHttpServer()).get("/trm"), "NO_AUTENTICADO");
  });

  describe.skipIf(!conUsuarios)("con usuarios reales", () => {
    let fabrica: ReturnType<typeof crearFabricaUsuarios>;
    let admin: SupabaseClient;

    const H = fechaLocal(new Date(), ZONA);

    beforeAll(() => {
      fabrica = crearFabricaUsuarios("Trm");
      admin = fabrica.admin;
    });

    afterAll(async () => {
      await fabrica.borrarTodos();
    });

    beforeEach(() => {
      fuente.obtenerEn.mockReset();
      fuente.obtenerEn.mockResolvedValue(trm("3461.92", H, sumarDias(H, 2)));
    });

    async function vigente(u: UsuarioPrueba): Promise<TrmVigenteDto> {
      const respuesta = await api(app, u).get("/trm");
      expect(respuesta.status).toBe(200);
      return respuesta.body as TrmVigenteDto;
    }

    async function filas(u: UsuarioPrueba) {
      const { data, error } = await admin
        .from("trm")
        .select("vigente_desde, vigente_hasta, valor_cent")
        .eq("usuario_id", u.id);
      expect(error).toBeNull();
      return data;
    }

    const esperada = {
      fechaHoy: H,
      trm: { valor: "3461.92", vigenteDesde: H, vigenteHasta: sumarDias(H, 2), fuente: FUENTE },
      desactualizada: false,
    };

    it("sin caché trae la TRM de la fuente y la guarda; la segunda vez no llama a la fuente", async () => {
      const u = await fabrica.crear();

      expect(await vigente(u)).toEqual(esperada);
      expect(fuente.obtenerEn).toHaveBeenCalledTimes(1);
      expect(fuente.obtenerEn).toHaveBeenCalledWith(H);
      expect(await filas(u)).toEqual([
        { vigente_desde: H, vigente_hasta: sumarDias(H, 2), valor_cent: 346192 },
      ]);

      expect(await vigente(u)).toEqual(esperada);
      expect(fuente.obtenerEn).toHaveBeenCalledTimes(1);
    });

    it("con una fila vieja y la fuente fallando responde la última conocida, desactualizada", async () => {
      const u = await fabrica.crear();
      const H3 = restarDias(H, 3);
      const { error } = await u.cliente
        .from("trm")
        .insert({ vigente_desde: H3, vigente_hasta: H3, valor_cent: 341510 });
      expect(error).toBeNull();
      fuente.obtenerEn.mockResolvedValue(null);

      expect(await vigente(u)).toEqual({
        fechaHoy: H,
        trm: { valor: "3415.10", vigenteDesde: H3, vigenteHasta: H3, fuente: FUENTE },
        desactualizada: true,
      });
      expect(fuente.obtenerEn).toHaveBeenCalledTimes(1);
    });

    it("sin caché y con la fuente fallando responde trm null, no desactualizada", async () => {
      const u = await fabrica.crear();
      fuente.obtenerEn.mockResolvedValue(null);

      expect(await vigente(u)).toEqual({ fechaHoy: H, trm: null, desactualizada: false });
      expect(await filas(u)).toEqual([]);
    });

    it("un valor sin ceros finales sale con dos decimales", async () => {
      const u = await fabrica.crear();
      fuente.obtenerEn.mockResolvedValue(trm("3415.1", H, H));

      const respuesta = await vigente(u);
      expect(respuesta.trm?.valor).toBe("3415.10");
      expect(await filas(u)).toEqual([{ vigente_desde: H, vigente_hasta: H, valor_cent: 341510 }]);
    });

    it("dos peticiones simultáneas sin caché responden 200 y dejan una sola fila", async () => {
      const u = await fabrica.crear();
      // Las dos consultan la fuente antes de que cualquiera guarde.
      fuente.obtenerEn.mockImplementation(async () => {
        await new Promise((listo) => setTimeout(listo, 200));
        return trm("3461.92", H, sumarDias(H, 2));
      });

      const [primera, segunda] = await Promise.all([api(app, u).get("/trm"), api(app, u).get("/trm")]);
      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect(primera.body).toEqual(esperada);
      expect(segunda.body).toEqual(esperada);
      expect(await filas(u)).toHaveLength(1);
    });

    it("la caché es por usuario: otro usuario no ve la TRM ajena y la pide a la fuente", async () => {
      const a = await fabrica.crear();
      const b = await fabrica.crear();

      await vigente(a);
      await vigente(b);
      expect(fuente.obtenerEn).toHaveBeenCalledTimes(2);
      expect(await filas(a)).toHaveLength(1);
      expect(await filas(b)).toHaveLength(1);
    });
  });
});
