/**
 * RF-03: valida el token en cada petición y rechaza los ausentes, mal
 * firmados o vencidos. La autorización real son las políticas RLS (RN-12);
 * este guard solo establece quién llama.
 */
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { AutenticacionRepository } from "../repositories/supabase/autenticacion.repository.js";
import type { PeticionAutenticada } from "./usuario.js";

function extraerToken(peticion: PeticionAutenticada): string | null {
  const cabecera = peticion.headers.authorization;
  if (typeof cabecera !== "string") return null;
  const [esquema, token] = cabecera.split(" ");
  return esquema === "Bearer" && token ? token : null;
}

@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(private readonly autenticacion: AutenticacionRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const peticion = ctx.switchToHttp().getRequest<PeticionAutenticada>();
    const token = extraerToken(peticion);
    if (!token) throw new UnauthorizedException("Falta el token.");

    const id = await this.autenticacion.verificarToken(token);
    if (!id) throw new UnauthorizedException("Token inválido o vencido.");

    peticion.usuario = { id, token };
    return true;
  }
}
