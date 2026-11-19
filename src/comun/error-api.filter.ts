/**
 * Filtro global: toda respuesta de error sale como `{ statusCode, codigo, mensaje, campo? }`.
 * Nunca filtra el detalle de Postgres ni de excepciones desconocidas.
 */
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { CATALOGO, ErrorApi, type CuerpoErrorApi } from "./error-api.js";

function desdeHttp(excepcion: HttpException): CuerpoErrorApi {
  const estado = excepcion.getStatus();
  if (estado === HttpStatus.UNAUTHORIZED) return new ErrorApi("NO_AUTENTICADO").cuerpo;
  if (estado >= 500) return new ErrorApi("ERROR_INTERNO").cuerpo;
  // Otros 4xx de Nest (ruta inexistente, JSON mal formado…): se conserva el estado.
  return {
    statusCode: estado,
    codigo: "ENTRADA_INVALIDA",
    mensaje: CATALOGO.ENTRADA_INVALIDA.mensaje,
  };
}

@Catch()
export class ErrorApiFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorApiFilter.name);

  constructor(private readonly adaptador: HttpAdapterHost) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const cuerpo =
      excepcion instanceof ErrorApi
        ? excepcion.cuerpo
        : excepcion instanceof HttpException
          ? desdeHttp(excepcion)
          : new ErrorApi("ERROR_INTERNO").cuerpo;

    // El detalle queda en el log del servidor, nunca en la respuesta.
    if (cuerpo.statusCode >= 500) {
      this.logger.error(
        excepcion instanceof Error ? (excepcion.stack ?? excepcion.message) : excepcion,
      );
    }

    const { httpAdapter } = this.adaptador;
    httpAdapter.reply(host.switchToHttp().getResponse(), cuerpo, cuerpo.statusCode);
  }
}
