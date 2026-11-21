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
- Montos cifrados (SPEC 05): en la BD son `text` cifrado. Los repositorios cifran y descifran con `CifradorMontos` (`src/repositories/cifrado/`); saldos y sumas se calculan en `src/domain/`. Requiere `CLAVE_MONTOS_V1`.
- Solo `src/repositories/supabase/cliente.ts` construye clientes de Supabase. Los de datos portan el token del usuario (`paraUsuario`). Nunca `service_role` en peticiones: la API no arranca si la encuentra en el entorno.
- Toda ruta pasa por `AutenticacionGuard` (global). El usuario llega al controller con `@Usuario()`.
- `src/domain/` no importa Nest ni Supabase.
- El modelo de datos lo decide el autor en el spec; el agente escribe y aplica la migración, y el autor la revisa antes de aplicarla (REGLAS §8).

## Specs

- Numeración propia desde 03 (01 y 02 son históricos, compartidos con Tino-web).
- Flujo de una feature con interfaz: diseño en `../Tino-web/referencias/<feature>/` → `/necesidades <ruta>` → `specs/necesidades/<feature>.md` → `/spec` + `/spec-impl` aquí → spec de la web.
- Un spec con interfaz lee antes `specs/necesidades/<feature>.md`. El modelo y el contrato (endpoints, DTOs, errores) se definen aquí, los decide el autor.
- El spec incluye una **tabla de cobertura**: cada `N-xx` del inventario → endpoint y campo que la cubre, o "fuera de alcance" con motivo. En los dos sentidos: ninguna `N-xx` sin cubrir, ningún endpoint sin una `N-xx` que lo pida (salvo los que exija una regla, citándola).
- La tabla completa es criterio de aceptación: el spec no pasa a Aprobado con filas vacías.
- Todo spec que agrega o cambia un endpoint actualiza `docs/api/` en la misma rama. Es la referencia vigente del contrato para los clientes; el spec de la web la lee de ahí.
