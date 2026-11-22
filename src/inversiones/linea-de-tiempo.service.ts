/**
 * Línea de tiempo de una inversión (SPEC 10, N-65): antes de una escritura que
 * la toca, se lee en fresco lo que mueve la cuenta, se simula la escritura y
 * el dominio comprueba que el efectivo y las cantidades no queden negativos en
 * ningún día. No es un trigger porque la base no puede leer montos cifrados.
 *
 * Lo usan las operaciones, los movimientos (transferencias que tocan la
 * inversión) y `PATCH /cuentas/:id` (saldo inicial).
 */
import { Injectable } from "@nestjs/common";
import type { UsuarioAutenticado } from "../autenticacion/usuario.js";
import { ErrorApi } from "../comun/error-api.js";
import { validarTrasCambio, type CambioLinea } from "../domain/inversion/validar.js";
import { CuentasRepository } from "../repositories/supabase/cuentas.repository.js";
import { InversionesRepository } from "../repositories/supabase/inversiones.repository.js";

@Injectable()
export class LineaDeTiempoService {
  constructor(
    private readonly inversiones: InversionesRepository,
    private readonly cuentas: CuentasRepository,
  ) {}

  /**
   * Lanza EFECTIVO_INSUFICIENTE o CANTIDAD_INSUFICIENTE si `cambio` deja
   * inválida la línea de tiempo de la inversión `cuentaId`. Si la cuenta no es
   * una inversión visible, no hace nada: la escritura la rechazará la base.
   */
  async validar(usuario: UsuarioAutenticado, cuentaId: string, cambio: CambioLinea): Promise<void> {
    const [cuenta, efectos, operaciones] = await Promise.all([
      this.inversiones.obtenerCuenta(usuario, cuentaId),
      this.cuentas.efectos(usuario, cuentaId),
      this.inversiones.operaciones(usuario, [cuentaId]),
    ]);
    if (cuenta === null) return;
    const error = validarTrasCambio(
      cuentaId,
      { saldoInicial: cuenta.saldoInicial, efectos, operaciones },
      cambio,
    );
    if (error) throw new ErrorApi(error.codigo, error.campo);
  }
}
