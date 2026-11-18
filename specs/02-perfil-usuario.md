# SPEC 02 — Perfil de usuario en base de datos

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-14
> **Objetivo:** Que todo usuario nuevo tenga automáticamente una fila en `public.perfiles`, aislada por RLS y verificada por la prueba de aislamiento entre usuarios.

## Por qué existe este spec

Es la primera tabla con datos de usuario. Fija el patrón que seguirán las demás (columna de usuario, RLS desde la primera migración, prueba de aislamiento) y es requisito de RN-15 y del primer uso. También cambia REGLAS §8 para que el agente pueda escribir migraciones.

## Alcance

**Entra:**

- Enmienda de REGLAS §8 y del recordatorio de `CLAUDE.md`: el autor decide el modelo; el agente escribe y aplica la migración; el autor la revisa antes de aplicarla.
- Carpeta `supabase/migrations/` con la primera migración versionada.
- Tabla `public.perfiles` con RLS: SELECT y UPDATE solo del propio perfil.
- Trigger en `auth.users` que crea el perfil con valores por defecto al registrarse.
- Trigger que mantiene `actualizado_en`.
- Aplicación de la migración a `Tino dev` con el MCP de Supabase y revisión de advisors.
- Tipos TS generados con el MCP en `src/repositories/supabase/tipos.ts`.
- `src/repositories/supabase/perfiles.ts` y `src/services/perfil.ts` con `obtenerPerfil()`.
- Prueba automatizada de aislamiento entre dos usuarios (REGLAS §4).

**Fuera de alcance (specs futuros):**

- Pantallas de primer uso (pasos `moneda` y `cuentas`) y redirección según `primer_uso_completado`.
- Editar el perfil desde la interfaz.
- Bloqueo de `moneda_base` cuando hay movimientos (RN-15): requiere la tabla de movimientos.
- Perfil para usuarios creados antes de esta migración (no hay backfill; se borran a mano en dev).
- Mostrar datos del perfil en `/`.
- Monedas distintas de COP y USD.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_perfiles.sql`:

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, FK `auth.users(id) on delete cascade` |
| `nombre` | `text` | nullable |
| `moneda_base` | `text` | not null, default `'COP'`, `check (moneda_base in ('COP','USD'))` |
| `zona_horaria` | `text` | not null, default `'America/Bogota'` |
| `primer_uso_completado` | `boolean` | not null, default `false` |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `id` es la columna de usuario; como PK ya tiene índice (REGLAS §4).
- RLS activa. Políticas `to authenticated`:
  - `perfiles_select_propio`: `using ((select auth.uid()) = id)`.
  - `perfiles_update_propio`: `using` y `with check` `((select auth.uid()) = id)`.
  - Sin políticas de INSERT ni DELETE.
- Función `public.crear_perfil()` `security definer`, `set search_path = ''`, trigger `after insert on auth.users`: inserta `(id)` con los defectos.
- Función `public.marcar_actualizado()` + trigger `before update on public.perfiles`: `actualizado_en = now()`.

Tipo de dominio/servicio:

```ts
type Perfil = {
  id: string;
  nombre: string | null;
  monedaBase: "COP" | "USD";
  zonaHoraria: string;
  primerUsoCompletado: boolean;
};
```

Variables de entorno de prueba (`.env.test.local`, sin prefijo público; documentadas en `.env.example`): `SUPABASE_SECRET_KEY`.

## Estructura de archivos

```
REGLAS.md                                   # §8 enmendada
CLAUDE.md                                   # recordatorio de migraciones actualizado
supabase/migrations/<timestamp>_perfiles.sql
src/repositories/supabase/tipos.ts          # generado con MCP
src/repositories/supabase/perfiles.ts       # usa crearClienteServidor()
src/services/perfil.ts                      # obtenerPerfil(): Perfil | null
tests/aislamiento.test.ts                   # prueba REGLAS §4
vitest.config.ts                            # include + tests/**/*.test.ts, carga .env.test.local
.env.example                                # + SUPABASE_SECRET_KEY (solo pruebas)
```

## Plan de implementación

1. Enmendar REGLAS §8: «El modelo de datos (tablas, columnas, nombres, tipos) lo decide el autor en el spec. El agente puede escribir y aplicar la migración que lo implementa; el autor la revisa antes de aplicarla.» Actualizar el recordatorio equivalente en `CLAUDE.md`.
2. Escribir `supabase/migrations/<timestamp>_perfiles.sql` según el modelo. El autor la revisa antes del paso 3.
3. Aplicar con `apply_migration` del MCP sobre `dswheekdmnoqnqmoozzp`. Ejecutar `get_advisors` (security y performance) y corregir avisos en una migración nueva si los hay.
4. Generar tipos con `generate_typescript_types` en `src/repositories/supabase/tipos.ts`.
5. `src/repositories/supabase/perfiles.ts`: `leerPerfilPropio()` con `crearClienteServidor()`; devuelve la fila o `null`, mapeada a `Perfil`.
6. `src/services/perfil.ts`: `obtenerPerfil()` que delega en el repositorio.
7. `vitest.config.ts`: incluir `tests/**/*.test.ts` y cargar `.env.test.local`. `.env.example` documenta `SUPABASE_SECRET_KEY` como solo-pruebas.
8. `tests/aislamiento.test.ts`: en `beforeAll` crea dos usuarios confirmados con la Admin API (`SUPABASE_SECRET_KEY`); cada uno entra con un cliente con clave publicable. Verifica: cada uno ve exactamente su perfil; SELECT del perfil ajeno devuelve 0 filas; UPDATE del perfil ajeno afecta 0 filas; INSERT y DELETE directos fallan. `afterAll` borra ambos usuarios. Si falta la clave, `describe.skip` con aviso explícito.

## Criterios de aceptación

- [ ] `npm test`, `npm run lint` y `npx tsc --noEmit` pasan.
- [ ] `list_migrations` en `Tino dev` muestra la migración de perfiles; el archivo existe en `supabase/migrations/`.
- [ ] `list_tables` muestra `public.perfiles` con RLS activa y las columnas del modelo.
- [ ] Registrar un usuario nuevo en `/registro` crea su fila con `COP`, `America/Bogota`, `nombre` null y `primer_uso_completado` false.
- [ ] Borrar el usuario en `auth.users` borra su perfil.
- [ ] Un UPDATE propio cambia `actualizado_en`.
- [ ] `moneda_base = 'EUR'` es rechazado por la base.
- [ ] `tests/aislamiento.test.ts` pasa con `SUPABASE_SECRET_KEY` presente y no deja usuarios de prueba.
- [ ] `get_advisors` (security) no reporta avisos sobre `perfiles` ni sus funciones.
- [ ] Ningún archivo de `src/` lee `SUPABASE_SECRET_KEY`.
- [ ] Ningún archivo en `src/components/` ni `src/app/` importa `@supabase/*` ni `repositories/` (salvo `proxy.ts`).
- [ ] REGLAS §8 contiene el texto nuevo.

## Decisiones

- **Sí:** el agente escribe el SQL; REGLAS §8 se cambia primero (la regla gana hasta enmendarla). **No:** escribirlo sin tocar REGLAS.
- **Sí:** el modelo lo decide el autor en el spec. **No:** delegar el diseño; contradice el objetivo de aprendizaje.
- **Sí:** `perfiles`, PK = `auth.users.id`. **No:** id propio + `usuario_id`; relación 1:1 sin necesidad de clave extra.
- **Sí:** `moneda_base text` + CHECK. **No:** enum Postgres; alterar enums es incómodo.
- **Sí:** trigger `after insert on auth.users`. **No:** crear al terminar primer uso ni perezosamente; el perfil existe siempre, sin `service_role` y atómico con el alta.
- **Sí:** SELECT y UPDATE propios. **No:** políticas de INSERT/DELETE; lo hacen el trigger y la cascada.
- **Sí:** `creado_en` y `actualizado_en`. RN-13 pedirá auditoría completa en movimientos; aquí basta con marcas.
- **No:** backfill de usuarios existentes; en dev se borran a mano.
- **Sí:** `service_role` (`SUPABASE_SECRET_KEY`) solo en la prueba, para crear y borrar usuarios; las aserciones usan tokens de usuario. Fuera del ciclo de petición, conforme a REGLAS §4. **No:** usuarios fijos manuales ni SQL por MCP; no automatizables.
- **Sí:** la prueba vive en `tests/`, fuera de `src/`; construye sus propios clientes. `servidor.ts` sigue siendo el único cliente con credenciales de usuario dentro de la app.
- **Sí:** repositorio + servicio de lectura. **No:** interfaz; va con primer uso.
- **No:** RN-15 ahora; sin movimientos no hay qué comprobar.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Trigger con error bloquea todo registro («Database error saving new user») | Función mínima con `search_path = ''`; criterio de aceptación registra un usuario real. |
| Usuarios de SPEC 01 sin perfil | Aceptado; `obtenerPerfil()` devuelve `null`; se borran en dev. |
| Prueba de aislamiento deja usuarios si falla a mitad | `afterAll` borra por id aunque fallen aserciones; correos con prefijo `aislamiento+` para limpieza manual. |
| `SUPABASE_SECRET_KEY` filtrada | Sin prefijo público (`env.ts` ya lo detecta); solo en `.env.test.local`, ignorado por git. |
| Prueba depende de red y de `Tino dev` | Se omite con aviso si falta la clave; nunca apunta a datos reales (REGLAS §4). |

## Lo que **no** entra en este spec

- Pantallas de primer uso.
- Edición del perfil en la interfaz.
- RN-15 (bloqueo de moneda base).
- Backfill de usuarios existentes.

Cada uno, si llega, va en su propio spec.
