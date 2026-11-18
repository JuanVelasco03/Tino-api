# Tino API

API de Tino (NestJS + Supabase). Dueña de las reglas de negocio, el acceso a
datos y las migraciones. La web vive en `../Tino-web`; la app de celular será
otro cliente de esta API.

`REGLAS.md` es **vinculante**. Léelo completo antes de cualquier cambio.
Ante conflicto entre una propuesta y una regla, gana la regla.
`REGLAS.md` es el mismo en ambos repositorios: si cambia, se cambia en los dos.

@REGLAS.md
@AGENTS.md

## Comandos

- `npm run start:dev` — API en modo watch (puerto 4000)
- `npm test` — Vitest: dominio (`src/**/*.test.ts`) y de punta a punta (`test/*.e2e-spec.ts`, incluye la de aislamiento)
- `npm run lint` — oxlint
- `npm run typecheck`

## Recordatorios

- NestJS 12, ESM: las importaciones relativas terminan en `.js`. Consulta la doc de Nest antes de usar APIs nuevas.
- Dinero: `bigint` en unidades menores (COP = pesos, USD = centavos). Nunca `number` con decimales.
- Solo `src/repositories/supabase/cliente.ts` construye clientes de Supabase. Los de datos portan el token del usuario (`paraUsuario`). Nunca `service_role` en peticiones: la API no arranca si la encuentra en el entorno.
- Toda ruta pasa por `AutenticacionGuard` (global). El usuario llega al controller con `@Usuario()`.
- `src/domain/` no importa Nest ni Supabase.
- El modelo de datos lo decide el autor en el spec; el agente escribe y aplica la migración, y el autor la revisa antes de aplicarla (REGLAS §8).
