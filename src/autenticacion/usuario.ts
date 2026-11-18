import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/** Usuario autenticado de la petición. El token viaja a los repositorios para que RLS lo evalúe. */
export type UsuarioAutenticado = {
  id: string;
  token: string;
};

export type PeticionAutenticada = {
  headers: Record<string, string | string[] | undefined>;
  usuario?: UsuarioAutenticado;
};

/** Inyecta el usuario que dejó `AutenticacionGuard` en la petición. */
export const Usuario = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const usuario = ctx.switchToHttp().getRequest<PeticionAutenticada>().usuario;
    if (!usuario) throw new Error("@Usuario() usado en una ruta sin AutenticacionGuard.");
    return usuario;
  },
);
