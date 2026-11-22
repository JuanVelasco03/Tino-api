/**
 * Caché por usuario de la TRM (SPEC 09), con el cliente del usuario: las
 * políticas `trm_select_propia` y `trm_insert_propia` garantizan que solo lee
 * y escribe la suya (RN-12). Sin UPDATE ni DELETE: una TRM publicada no cambia.
 * `valor_cent` no se cifra: es un dato público, no un monto del usuario.
 *
 * `valor_cent` viaja como texto en los dos sentidos (`::text` al leer, string
 * al escribir; Postgres lo convierte a integer): ningún valor de TRM pasa por
 * `number` (REGLAS §6).
 */
import { Injectable } from "@nestjs/common";
import type { Trm } from "../../domain/trm/trm.js";
import { ClienteSupabase } from "./cliente.js";
import { errorInterno } from "./errores.js";
import type { TablesInsert } from "./tipos.js";

/** Los tipos generados dicen `number`; PostgREST acepta el entero como texto. */
type FilaNueva = Omit<TablesInsert<"trm">, "valor_cent"> & { valor_cent: string };

@Injectable()
export class TrmRepository {
  constructor(private readonly supabase: ClienteSupabase) {}

  /** La fila con mayor `vigente_desde ≤ fecha`, o `null`. */
  async ultimaHasta(token: string, fecha: string): Promise<Trm | null> {
    const { data, error } = await this.supabase
      .paraUsuario(token)
      .from("trm")
      .select("valor_cent::text, vigente_desde, vigente_hasta")
      .lte("vigente_desde", fecha)
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw errorInterno(error);
    if (data === null) return null;
    return {
      valorCent: BigInt(data.valor_cent),
      vigenteDesde: data.vigente_desde,
      vigenteHasta: data.vigente_hasta,
    };
  }

  /**
   * Las filas que se cruzan con `[desde, hasta]` y la última anterior a
   * `desde` (la que rige allí, o la última conocida), por `vigente_desde`.
   */
  async enRango(token: string, desde: string, hasta: string): Promise<Trm[]> {
    const [rango, anterior] = await Promise.all([
      this.supabase
        .paraUsuario(token)
        .from("trm")
        .select("valor_cent::text, vigente_desde, vigente_hasta")
        .lte("vigente_desde", hasta)
        .gte("vigente_hasta", desde)
        .order("vigente_desde"),
      this.ultimaHasta(token, desde),
    ]);
    if (rango.error) throw errorInterno(rango.error);
    const filas: Trm[] = rango.data.map((f) => ({
      valorCent: BigInt(f.valor_cent),
      vigenteDesde: f.vigente_desde,
      vigenteHasta: f.vigente_hasta,
    }));
    if (anterior !== null && !filas.some((f) => f.vigenteDesde === anterior.vigenteDesde)) {
      filas.unshift(anterior);
    }
    return filas;
  }

  /** Inserta la vigencia; si ya existe, no hace nada (dos peticiones simultáneas no chocan). */
  guardar(token: string, trm: Trm): Promise<void> {
    return this.guardarVarias(token, [trm]);
  }

  /** Inserta las vigencias en una sentencia, ignorando las que ya existen. */
  async guardarVarias(token: string, trms: readonly Trm[]): Promise<void> {
    if (trms.length === 0) return;
    const filas: FilaNueva[] = trms.map((trm) => ({
      vigente_desde: trm.vigenteDesde,
      vigente_hasta: trm.vigenteHasta,
      valor_cent: trm.valorCent.toString(),
    }));
    const { error } = await this.supabase
      .paraUsuario(token)
      .from("trm")
      .upsert(filas as unknown as TablesInsert<"trm">[], {
        onConflict: "usuario_id,vigente_desde",
        ignoreDuplicates: true,
      });
    if (error) throw errorInterno(error);
  }
}
