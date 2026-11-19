# SPEC 03 — Cuentas: lista con saldos, alta, edición, orden y archivo

> **Estado:** Implementado
> **Depende de:** SPEC 02
> **Fecha:** 2026-11-18
> **Objetivo:** Que la API dé las cuentas del usuario (efectivo, banco y tarjeta sin ciclo) agrupadas en activos y pasivos con saldos, totales y patrimonio neto calculados, y permita crearlas, editarlas, reordenarlas, archivarlas, restaurarlas y eliminarlas.

## Por qué existe este spec

Es la primera tabla financiera. Fija tres patrones que heredarán movimientos y el resto:

- El saldo nunca se guarda. Sale de una vista SQL que hoy devuelve el saldo inicial y que el spec de movimientos ampliará (RN-01).
- Un cambio de dato financiero queda registrado por la propia base (RN-13).
- Los errores tienen un formato único con código estable: `{ statusCode, codigo, mensaje, campo? }`.

Cubre el inventario `specs/necesidades/cuentas.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con la tabla `cuentas`, la tabla `cuentas_cambios`, la vista `cuentas_con_saldo`, la función `reordenar_cuentas`, la función `naturaleza_de` y sus triggers. Todo con RLS desde la primera migración.
- Tipos de cuenta: `efectivo`, `banco`, `tarjeta_credito`. Todo en COP.
- `GET /cuentas`: activos y pasivos con sus cuentas en el orden del usuario, total de cada grupo, patrimonio neto y fecha de los saldos en la zona horaria del usuario.
- `GET /cuentas/archivadas`.
- `POST /cuentas`, `PATCH /cuentas/:id`, `DELETE /cuentas/:id`.
- `PUT /cuentas/orden`.
- `POST /cuentas/:id/archivar` y `POST /cuentas/:id/restaurar`.
- Tarjeta: cupo total, cupo disponible (RN-18) y porcentaje usado.
- Registro automático de cambios de `saldo_inicial` en `cuentas_cambios`.
- La regla «el tipo no cambia de naturaleza», en el dominio y en un trigger.
- Validación de la forma con Zod y `StandardSchemaValidationPipe`. Las reglas de negocio, en `domain/cuenta/`.
- Filtro global de errores `src/comun/error-api.filter.ts`.
- La prueba de aislamiento se amplía a `cuentas`, `cuentas_cambios`, `cuentas_con_saldo` y `reordenar_cuentas`.
- Prueba de punta a punta `test/cuentas.e2e-spec.ts`.

**Fuera de alcance (specs futuros):**

- Cuentas en USD, la TRM y su equivalente en COP (N-01, N-08, N-20): llegan con inversiones.
- Tipos `inversion`, `prestamo_otorgado` y `deuda_contraida` (N-20, N-21, N-22).
- Ciclo de la tarjeta: corte, días hasta el corte y pago límite (N-19).
- Avisos, deudas y préstamos, recurrentes, metas y captura rápida (N-02 a N-05).
- Movimientos. El bloqueo de «eliminar una cuenta con movimientos» llega con ellos: la FK de movimientos hacia `cuentas` llevará `on delete restrict`.
- Saldo calculado con movimientos: el spec de movimientos amplía `cuentas_con_saldo`.
- Endpoint para consultar `cuentas_cambios`. Ninguna necesidad lo pide todavía.
- Registrar cambios de otros campos (cupo, nombre, tipo).
- Detalle de una cuenta (`GET /cuentas/:id`). Ninguna pantalla lo pide.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_cuentas.sql`.

### Tabla `public.cuentas`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `nombre` | `text` | not null, `check (char_length(btrim(nombre)) between 1 and 60)` |
| `tipo` | `text` | not null, `check (tipo in ('efectivo','banco','tarjeta_credito'))` |
| `detalle` | `text` | nullable, `check (char_length(detalle) <= 60)` |
| `saldo_inicial` | `numeric(19,0)` | not null, default `0`, `check (saldo_inicial >= 0)` |
| `cupo` | `numeric(19,0)` | nullable, `check (cupo > 0)` |
| `posicion` | `integer` | not null (lo asigna un trigger) |
| `archivada_en` | `timestamptz` | nullable; `null` = no archivada |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `check ((cupo is not null) = (tipo = 'tarjeta_credito'))`.
- Índice `cuentas_usuario_idx (usuario_id)`.
- Índice único parcial `cuentas_nombre_unico (usuario_id, lower(nombre)) where archivada_en is null`.
- RLS activa. Las políticas `to authenticated`, todas con `(select auth.uid()) = usuario_id`, son:
  - `cuentas_select_propia`, con `using`.
  - `cuentas_insert_propia`, con `with check`.
  - `cuentas_update_propia`, con `using` y `with check`.
  - `cuentas_delete_propia`, con `using`.
- Montos en unidades menores (COP = pesos). En un pasivo, `saldo_inicial` es la deuda inicial.

### Tabla `public.cuentas_cambios`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `cuenta_id` | `uuid` | not null, FK `cuentas(id) on delete cascade` |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `campo` | `text` | not null, `check (campo in ('saldo_inicial'))` |
| `valor_anterior` | `numeric(19,0)` | not null |
| `valor_nuevo` | `numeric(19,0)` | not null |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índice `cuentas_cambios_usuario_idx (usuario_id)` e índice `cuentas_cambios_cuenta_idx (cuenta_id)`.
- RLS activa. Solo `cuentas_cambios_select_propio` (`to authenticated`, `using ((select auth.uid()) = usuario_id)`). Sin INSERT, UPDATE ni DELETE para usuarios: el historial no se edita.

### Funciones y triggers

- `public.naturaleza_de(tipo text) returns text`: `immutable`, `set search_path = ''`. Devuelve `'activo'` para `efectivo` y `banco`, y `'pasivo'` para `tarjeta_credito`. Es el espejo SQL de `naturalezaDe` en `src/domain/cuenta/naturaleza.ts`.
- `public.asignar_posicion()`, trigger `before insert or update of archivada_en on cuentas`. Se dispara al insertar, o al restaurar (`archivada_en` pasa de no nulo a nulo). Fija `posicion = coalesce(max(posicion) + 1, 0)` entre las cuentas no archivadas del usuario con la misma naturaleza.
- `public.impedir_cambio_naturaleza()`, trigger `before update of tipo on cuentas`. Si `naturaleza_de(old.tipo) <> naturaleza_de(new.tipo)`, lanza `raise exception 'CAMBIO_DE_NATURALEZA'`.
- `public.registrar_cambio_saldo_inicial()`, trigger `after update of saldo_inicial on cuentas`, cuando `old.saldo_inicial is distinct from new.saldo_inicial`. Inserta `(cuenta_id, usuario_id, 'saldo_inicial', old, new)` en `cuentas_cambios`. Es `security definer`, con `set search_path = ''` y `revoke all ... from public, anon, authenticated`, como `crear_perfil` en SPEC 02.
- `public.marcar_actualizado()`: la de SPEC 02, ahora también con un trigger `before update on cuentas`.
- `public.reordenar_cuentas(p_naturaleza text, p_ids uuid[]) returns void`: `security invoker`, `set search_path = ''`, con `grant execute to authenticated`.
  - `p_ids` tiene que ser exactamente el conjunto de cuentas no archivadas del usuario con esa naturaleza, sin repetidos. Si no lo es, lanza `raise exception 'ORDEN_INVALIDO'`.
  - Si lo es, escribe `posicion = ordinal - 1` en una sola sentencia.

### Vista `public.cuentas_con_saldo`

`with (security_invoker = true)`, para que respete la RLS de `cuentas`. Expone `cuentas.*` más `saldo numeric(19,0)`, que hoy es `saldo_inicial` (RN-01). El spec de movimientos le sumará el efecto de los movimientos.

### Tipos de dominio (`src/domain/cuenta/cuenta.ts`)

```ts
type TipoCuentaEnAlcance = "efectivo" | "banco" | "tarjeta_credito"; // subconjunto de TipoCuenta

type Cuenta = {
  id: string;
  nombre: string;
  tipo: TipoCuentaEnAlcance;
  detalle: string | null;
  saldoInicial: bigint;
  saldo: bigint;            // en un pasivo, la deuda vigente (positiva)
  cupo: bigint | null;
  posicion: number;
  archivadaEn: Date | null;
};

type ResumenCuentas = {
  activos: { total: bigint; cuentas: Cuenta[] };
  pasivos: { total: bigint; cuentas: Cuenta[] };
  patrimonioNeto: bigint;   // activos.total − pasivos.total; puede ser negativo
};
```

### Contrato HTTP

Todo monto viaja como **string de entero en unidades menores** (`"1284300"`). El negativo lleva el guion ASCII (`"-500000"`). Las fechas van en ISO 8601.

```ts
type CuentaDto = {
  id: string;
  nombre: string;
  tipo: "efectivo" | "banco" | "tarjeta_credito";
  naturaleza: "activo" | "pasivo";
  detalle: string | null;
  saldo: string;              // pasivo: deuda vigente, positiva; el cliente pone el «−»
  saldoInicial: string;
  tarjeta: { cupo: string; disponible: string; porcentajeUsado: number } | null;
  archivadaEn: string | null;
};

type ListaCuentasDto = {
  fechaSaldos: string;        // "YYYY-MM-DD", hoy en la zona horaria del perfil
  activos: { total: string; cuentas: CuentaDto[] };
  pasivos: { total: string; cuentas: CuentaDto[] };
  patrimonioNeto: string;
};
```

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /cuentas` | — | `200 ListaCuentasDto`. Solo no archivadas, ordenadas por `posicion`. |
| `GET /cuentas/archivadas` | — | `200 { cuentas: CuentaDto[] }`, por `archivada_en` descendente. |
| `POST /cuentas` | `{ nombre, tipo, detalle?, saldoInicial, cupo? }` | `201 CuentaDto` |
| `PATCH /cuentas/:id` | `{ nombre?, tipo?, detalle?, saldoInicial?, cupo? }`, al menos un campo; `detalle: null` lo borra | `200 CuentaDto` |
| `DELETE /cuentas/:id` | — | `204` |
| `PUT /cuentas/orden` | `{ naturaleza: "activo" \| "pasivo", ids: string[] }` | `204` |
| `POST /cuentas/:id/archivar` | — | `200 CuentaDto` |
| `POST /cuentas/:id/restaurar` | `{ nombre? }` | `200 CuentaDto`. Vuelve al final de su grupo. |

- `:id` se valida como UUID con `@Param('id', { schema })`.
- `saldoInicial` y `cupo` se reciben como string `^\d{1,19}$`.
- En `PATCH`, `cupo` solo se admite si la cuenta queda como `tarjeta_credito`.

### Errores

Formato único, garantizado por `src/comun/error-api.filter.ts` (filtro global, `APP_FILTER`):

```ts
type ErrorApi = { statusCode: number; codigo: string; mensaje: string; campo?: string };
```

`StandardSchemaValidationPipe` se registra globalmente con un `exceptionFactory`. Cada esquema de Zod usa como `message` el código del catálogo, y el factory toma el primer issue: `codigo = issue.message`, `campo = issue.path`.

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `ENTRADA_INVALIDA` | 400 | según el issue | «Revisa los datos enviados.» |
| `NOMBRE_REQUERIDO` | 400 | `nombre` | «Escribe un nombre.» |
| `NOMBRE_LARGO` | 400 | `nombre` | «El nombre admite hasta 60 caracteres.» |
| `NOMBRE_DUPLICADO` | 409 | `nombre` | «Ya tienes una cuenta con ese nombre.» |
| `TIPO_INVALIDO` | 400 | `tipo` | «Elige efectivo, banco o tarjeta de crédito.» |
| `DETALLE_LARGO` | 400 | `detalle` | «El detalle admite hasta 60 caracteres.» |
| `MONTO_INVALIDO` | 400 | `saldoInicial` o `cupo` | «Escribe un valor en pesos, sin decimales.» |
| `CUPO_REQUERIDO` | 400 | `cupo` | «La tarjeta necesita un cupo mayor que cero.» |
| `CUPO_NO_PERMITIDO` | 400 | `cupo` | «Solo las tarjetas tienen cupo.» |
| `SIN_CAMBIOS` | 400 | — | «No hay nada que actualizar.» |
| `CAMBIO_DE_NATURALEZA` | 422 | `tipo` | «Una cuenta no puede pasar de activo a pasivo ni al revés.» |
| `ORDEN_INVALIDO` | 422 | `ids` | «El orden debe incluir cada cuenta del grupo una sola vez.» |
| `CUENTA_NO_ENCONTRADA` | 404 | — | «La cuenta no existe.» |
| `CUENTA_ARCHIVADA` | 409 | — | «La cuenta está archivada. Restáurala para modificarla.» |
| `CUENTA_NO_ARCHIVADA` | 409 | — | «La cuenta no está archivada.» |
| `SALDO_NO_CERO` | 409 | — | «Solo puedes archivar una cuenta con saldo cero.» |
| `NO_AUTENTICADO` | 401 | — | «Inicia sesión para continuar.» |
| `ERROR_INTERNO` | 500 | — | «No pudimos completar la operación. Intenta de nuevo.» |

Traducciones en el repositorio:

- La violación de unicidad `23505` sobre `cuentas_nombre_unico` se convierte en `NOMBRE_DUPLICADO`.
- Las excepciones `CAMBIO_DE_NATURALEZA` y `ORDEN_INVALIDO` de Postgres pasan a su código.
- Una fila no visible por RLS se trata como `CUENTA_NO_ENCONTRADA`.
- Cualquier otro error termina en `ERROR_INTERNO`, sin filtrar el detalle de Postgres.

## Estructura de archivos

```
supabase/migrations/<timestamp>_cuentas.sql
src/
  app.module.ts                    # + CuentasModule, APP_FILTER
  main.ts                          # + useGlobalPipes(StandardSchemaValidationPipe con exceptionFactory)
  comun/
    error-api.ts                   # clase ErrorApi(codigo, campo?) + catálogo codigo → { estado, mensaje }
    error-api.filter.ts            # ErrorApi | HttpException | desconocido → { statusCode, codigo, mensaje, campo? }
  cuentas/
    cuentas.controller.ts
    cuentas.service.ts
    cuentas.module.ts
    esquemas.ts                    # Zod: cuerpos de POST, PATCH, orden, restaurar; param id
    dto.ts                         # Cuenta → CuentaDto, ResumenCuentas → ListaCuentasDto
  domain/
    cuenta/
      naturaleza.ts                # existe, sin cambios
      cupo.ts                      # existe, sin cambios
      cuenta.ts                    # tipos Cuenta, ResumenCuentas, TipoCuentaEnAlcance
      resumen.ts (+ resumen.test.ts)   # agruparCuentas: grupos, totales, patrimonio
      validar.ts (+ validar.test.ts)   # validarAlta, validarEdicion, puedeArchivar
    fecha/
      fecha-local.ts (+ fecha-local.test.ts)  # fechaLocal(ahora, zonaHoraria) → "YYYY-MM-DD"
  repositories/supabase/
    cuentas.repository.ts
    tipos.ts                       # regenerado
test/
  aislamiento.e2e-spec.ts          # ampliado (no se borra ni se desactiva)
  cuentas.e2e-spec.ts
docs/api/
  README.md                        # convenciones comunes: auth, montos, ErrorApi (añadido al implementar)
  perfil.md                        # contrato vigente de /perfil (añadido al implementar)
  cuentas.md                       # contrato vigente de /cuentas, para el spec de la web (añadido al implementar)
package.json                       # + zod
```

Dirección: `cuentas.controller → cuentas.service → domain/cuenta`, con `cuentas.repository` y `perfiles.repository` (zona horaria) detrás del servicio. `domain/` no importa Nest, Zod ni Supabase. `ErrorApi` vive en `comun/`. El dominio devuelve códigos y el servicio los envuelve en `ErrorApi`.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_cuentas.sql` según el modelo. **El autor la revisa antes del paso 2.**
2. Aplicarla con `apply_migration` del MCP sobre Tino dev. Ejecutar `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `src/repositories/supabase/tipos.ts` con `generate_typescript_types`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Cada usuario crea una cuenta, y se comprueba lo siguiente:
   - El otro usuario no la ve en `cuentas` ni en `cuentas_con_saldo`.
   - UPDATE y DELETE sobre la cuenta ajena afectan 0 filas.
   - INSERT con `usuario_id` ajeno falla.
   - Tras cambiar el saldo inicial propio, `cuentas_cambios` tiene 1 fila propia y 0 visibles para el otro.
   - INSERT directo en `cuentas_cambios` falla.
   - `reordenar_cuentas` con ids ajenos lanza `ORDEN_INVALIDO`.

   `npm test` en verde.
4. Agregar `zod`. Crear `src/domain/cuenta/cuenta.ts` y `validar.ts`, con sus pruebas:
   - En alta: tarjeta sin cupo da `CUPO_REQUERIDO`, y banco con cupo da `CUPO_NO_PERMITIDO`.
   - En edición: banco → tarjeta da `CAMBIO_DE_NATURALEZA`, y efectivo → banco es válido.
   - `puedeArchivar(0n)` es verdadero y `puedeArchivar(1n)`, falso.
5. `src/domain/cuenta/resumen.ts` con pruebas. Separa los grupos con `naturalezaDe` y respeta `posicion`. Suma los totales en `bigint` y calcula `patrimonioNeto = activos − pasivos`, que puede ser negativo. Con la lista vacía, los grupos salen vacíos y los totales en `0n`. Crear también `src/domain/fecha/fecha-local.ts`, con una prueba en la que `2026-11-19T03:00Z` en `America/Bogota` da `2026-11-18`.
6. `src/comun/error-api.ts` y `error-api.filter.ts`, registrado como `APP_FILTER`. En `main.ts`, `StandardSchemaValidationPipe` global con `exceptionFactory`. El 401 del guard se convierte en `NO_AUTENTICADO`. `test/perfil.e2e-spec.ts` tiene que seguir en verde: se ajusta solo si comprueba el cuerpo del error.
7. `src/repositories/supabase/cuentas.repository.ts` con `listar`, `listarArchivadas`, `obtener`, `crear`, `actualizar`, `eliminar`, `archivar`, `restaurar` y `reordenar`. Lee de `cuentas_con_saldo`, escribe en `cuentas` y llama a `rpc('reordenar_cuentas')`. Convierte `numeric` ↔ `bigint` y traduce los errores según la tabla.
8. `src/cuentas/` con módulo, servicio y controller, y `GET /cuentas` más `GET /cuentas/archivadas`. El servicio lee la zona horaria con `PerfilesRepository` (si no hay perfil, usa `America/Bogota`). Los datos de `tarjeta` se calculan con `cupoDisponible` y `porcentajeUsado` de `cupo.ts`. Se registra en `AppModule`.
9. `POST /cuentas`, `PATCH /cuentas/:id` y `DELETE /cuentas/:id`, con `esquemas.ts`. `PATCH` sobre una archivada responde `CUENTA_ARCHIVADA`.
10. `PUT /cuentas/orden`, `POST /cuentas/:id/archivar` (`SALDO_NO_CERO` si el saldo no es cero; `CUENTA_ARCHIVADA` si ya lo estaba) y `POST /cuentas/:id/restaurar` (`CUENTA_NO_ARCHIVADA`; `nombre` opcional, que se aplica antes de restaurar).
11. `test/cuentas.e2e-spec.ts`, que cubre los criterios de aceptación de los endpoints con usuarios reales. Se omite con aviso si falta `SUPABASE_SECRET_KEY`, igual que `perfil.e2e-spec.ts`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | Fuera de alcance: USD y TRM llegan con inversiones. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: deudas, recurrentes, inversiones y avisos (REGLAS §7). |
| N-04 | Fuera de alcance: metas no figura en REGLAS. |
| N-05 | Fuera de alcance: captura rápida, que tiene su propio inventario. |
| N-06 | `GET /cuentas` → `fechaSaldos`. |
| N-07 | Ya cubierto por SPEC 02 (`perfiles.zona_horaria`), que se usa para `fechaSaldos`. |
| N-08 | Fuera de alcance: USD y TRM. |
| N-09 | `GET /cuentas` → `activos`, `pasivos`; `CuentaDto.naturaleza`. |
| N-10 | `GET /cuentas` → `activos.total`, `pasivos.total`. |
| N-11 | `CuentaDto.nombre`. |
| N-12 | `CuentaDto.tipo`. |
| N-13 | `CuentaDto.detalle`, texto libre ≤ 60. |
| N-14 | `CuentaDto.saldo`, de la vista `cuentas_con_saldo`. |
| N-15 | `CuentaDto.naturaleza` + `saldo` (deuda positiva). El signo «−» y la leyenda los pone el cliente. |
| N-16 | `CuentaDto.tarjeta.cupo`. |
| N-17 | `CuentaDto.tarjeta.porcentajeUsado`. |
| N-18 | `CuentaDto.tarjeta.disponible` (RN-18, `cupoDisponible`). |
| N-19 | Fuera de alcance: tarjeta con ciclo (REGLAS §7). |
| N-20 | Fuera de alcance: inversiones y USD (REGLAS §7). |
| N-21 | Fuera de alcance: préstamos (REGLAS §7). |
| N-22 | Fuera de alcance: deudas (REGLAS §7). |
| N-23 | `GET /cuentas` → `activos.total`, `pasivos.total`. |
| N-24 | `GET /cuentas` → `patrimonioNeto`. |
| N-25 | Orden de `activos.cuentas` y `pasivos.cuentas` por `posicion`. |
| N-26 | `PUT /cuentas/orden` → `reordenar_cuentas`. |
| N-27 | `PUT /cuentas/orden` → `naturaleza` + `ORDEN_INVALIDO`. |
| N-28 | Trigger `asignar_posicion` en `POST /cuentas`: la cuenta va al final de su grupo. |
| N-29 | `CuentaDto.id`; `:id` en las rutas. |
| N-30 | `POST /cuentas`. |
| N-31 | `NOMBRE_REQUERIDO`. |
| N-32 | Índice `cuentas_nombre_unico` → `NOMBRE_DUPLICADO` (POST, PATCH, restaurar). |
| N-33 | Check de `tipo` + `TIPO_INVALIDO`. |
| N-34 | `POST /cuentas` → `saldoInicial`. |
| N-35 | `CUPO_REQUERIDO`; check `cupo ⇔ tarjeta_credito`. |
| N-36 | `MONTO_INVALIDO`; strings `^\d{1,19}$`; `numeric(19,0)`. |
| N-37 | `POST /cuentas` → `detalle` opcional. |
| N-38 | `PATCH /cuentas/:id`. |
| N-39 | `CAMBIO_DE_NATURALEZA` (dominio + trigger `impedir_cambio_naturaleza`). |
| N-40 | Trigger `registrar_cambio_saldo_inicial` → `cuentas_cambios`. |
| N-41 | `DELETE /cuentas/:id`. La confirmación es del cliente. |
| N-42 | `POST /cuentas/:id/archivar`. El bloqueo del borrado con movimientos llega con la FK `on delete restrict` del spec de movimientos. |
| N-43 | `SALDO_NO_CERO`. |
| N-44 | `GET /cuentas` excluye `archivada_en is not null`. |
| N-45 | `GET /cuentas/archivadas`. |
| N-46 | `POST /cuentas/:id/restaurar` → `nombre?`; `NOMBRE_DUPLICADO`. |
| N-47 | `GET /cuentas` con `activos.cuentas` y `pasivos.cuentas` vacíos. |
| N-48 | Grupo con `cuentas: []` y `total: "0"`. |
| N-49 | Estados HTTP y `ErrorApi`. La carga es del cliente. |
| N-50 | `ErrorApi.codigo`, `mensaje`, `campo`. |
| N-51 | Montos como string entero en unidades menores; `numeric(19,0)`; `bigint` en el dominio. |
| N-52 | RLS en `cuentas`, `cuentas_cambios`, la vista `security_invoker` y `reordenar_cuentas` `security invoker`; `test/aislamiento.e2e-spec.ts`. |

Cada endpoint responde a al menos una N-xx. El filtro de errores cubre N-49 y N-50. `cuentas_cambios` cubre N-40.

## Criterios de aceptación

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración de cuentas y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre `cuentas`, `cuentas_cambios`, `cuentas_con_saldo` ni las funciones nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones nuevas del paso 3 y no deja usuarios de prueba.
- [ ] `GET /cuentas` de un usuario sin cuentas responde `200` con los dos grupos vacíos, los totales en `"0"` y `patrimonioNeto` en `"0"`.
- [ ] Un usuario crea «Nequi» (banco, `"20321"`) y una «Tarjeta» (`tarjeta_credito`, saldo `"1284300"`, cupo `"4000000"`). Entonces `GET /cuentas` da:
  - `activos.total` = `"20321"`;
  - `pasivos.total` = `"1284300"`;
  - `patrimonioNeto` = `"-1263979"`;
  - en la tarjeta, `disponible` = `"2715700"` y `porcentajeUsado` = `32`.
- [ ] `fechaSaldos` es la fecha de hoy en la zona horaria del perfil.
- [ ] Crear una segunda «nequi» (con minúsculas) responde `409 NOMBRE_DUPLICADO` con `campo: "nombre"`.
- [ ] Crear una tarjeta sin cupo responde `400 CUPO_REQUERIDO`. Crear un banco con cupo responde `400 CUPO_NO_PERMITIDO`.
- [ ] `saldoInicial: "12.5"` y `saldoInicial: "-1"` responden `400 MONTO_INVALIDO`.
- [ ] `tipo: "inversion"` responde `400 TIPO_INVALIDO`.
- [ ] Cambiar una cuenta de efectivo a banco con `PATCH` responde `200`. Cambiar un banco a tarjeta responde `422 CAMBIO_DE_NATURALEZA`.
- [ ] Un UPDATE directo en SQL de `tipo` de `banco` a `tarjeta_credito` falla con `CAMBIO_DE_NATURALEZA`.
- [ ] Cambiar `saldoInicial` con `PATCH` deja en `cuentas_cambios` una fila con el valor anterior y el nuevo. Un `PATCH` sin cambio de saldo inicial no deja ninguna.
- [ ] Una cuenta nueva aparece al final de su grupo.
- [ ] `PUT /cuentas/orden` con los ids del grupo invertidos los devuelve invertidos en `GET /cuentas`.
- [ ] Un id de pasivo en el orden de activos, un id que falte o uno repetido responden `422 ORDEN_INVALIDO` y no cambian el orden.
- [ ] Archivar una cuenta con saldo distinto de cero responde `409 SALDO_NO_CERO`.
- [ ] Archivar una cuenta con saldo cero la saca de `GET /cuentas` y la muestra en `GET /cuentas/archivadas`.
- [ ] Con una archivada «Nequi», se puede crear otra «Nequi».
- [ ] Restaurarla sin `nombre` responde `409 NOMBRE_DUPLICADO`.
- [ ] Restaurarla con `nombre: "Nequi vieja"` responde `200` y la cuenta vuelve al final de su grupo.
- [ ] `PATCH` sobre una cuenta archivada responde `409 CUENTA_ARCHIVADA`.
- [ ] `DELETE /cuentas/:id` responde `204` y la cuenta desaparece. Sus filas de `cuentas_cambios` se borran en cascada.
- [ ] Cualquier ruta con el id de una cuenta ajena responde `404 CUENTA_NO_ENCONTRADA`.
- [ ] `:id` que no es UUID responde `400` con el formato `ErrorApi`.
- [ ] Sin token, `/cuentas` responde `401` con `codigo: "NO_AUTENTICADO"`.
- [ ] Ningún error devuelve texto de Postgres en `mensaje`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`.
- [ ] Ningún monto pasa por `number` en el dominio ni en el repositorio (salvo `porcentajeUsado`, que es un porcentaje).

## Decisiones

- **Sí:** tipos `efectivo`, `banco` y `tarjeta_credito`, con un check de 3 valores que se amplía por migración. **No:** check con los 6 tipos del dominio, porque la regla quedaría solo en el código.
- **Sí:** solo COP, sin columna `moneda`. **No:** agregarla ya, porque no aporta nada hasta que llegue el USD con inversiones.
- **Sí:** `numeric(19,0)` en unidades menores, igual al `bigint` de TS (REGLAS §6).
- **Sí:** `saldo_inicial ≥ 0`. En un pasivo es la deuda. **No:** negativos; un sobregiro se expresa después con movimientos.
- **Sí:** `posicion` densa, que se reescribe por grupo en `reordenar_cuentas` (una sentencia, atómica). **No:** posiciones con huecos ni una tabla de preferencias.
- **Sí:** el trigger `asignar_posicion` pone las cuentas nuevas y las restauradas al final del grupo. Las archivadas conservan su `posicion`, sin efecto: el siguiente reordenamiento la reescribe.
- **Sí:** `cuentas_cambios` con un trigger `security definer`, garantizado en la BD y de solo lectura para el usuario (RN-13). **No:** auditoría genérica ni escritura desde el servicio, que se puede saltar.
- **Sí:** solo se registra `saldo_inicial`, que es lo que pidió el inventario. El check de `campo` admite ampliar.
- **Sí:** la vista `cuentas_con_saldo` (`security_invoker`) es la única fuente del saldo, y los totales y el patrimonio se calculan en `domain/` (REGLAS §5). **No:** `calcularSaldo` con filas en memoria, ni todo en SQL.
- **Sí:** respuesta agrupada con totales calculados en la API. **No:** lista plana que el cliente agrupe, porque sacaría el cálculo de la API.
- **Sí:** montos como string de entero. **No:** `number`.
- **Sí:** el saldo de un pasivo viaja positivo (deuda vigente, RN-02). **No:** mandarlo negativo, porque eso es presentación.
- **Sí:** Zod con `StandardSchemaValidationPipe` global y `exceptionFactory`, y las reglas de negocio en `domain/`. **No:** class-validator.
- **Sí:** errores `{ statusCode, codigo, mensaje, campo? }` desde un filtro global en `src/comun/`, con el mensaje en español en la API. **No:** solo código, porque web y celular dirían cosas distintas.
- **Sí:** archivar y restaurar ya. Eliminar borra siempre hasta que movimientos traiga la FK `on delete restrict`, que bloquea el borrado en la BD. **No:** dejar todo lo de archivar para movimientos.
- **Sí:** solo se archiva con saldo cero, comprobado en el dominio. **No:** trigger en la BD ahora, porque el saldo con movimientos aún no existe. El spec de movimientos puede llevarlo a la BD.
- **Sí:** nombre único sin distinguir mayúsculas, solo entre no archivadas. Restaurar acepta `nombre` opcional. **No:** que una archivada se pueda editar.
- **Sí:** el cambio de naturaleza se impide en el dominio (error con código) y con un trigger (garantía en la BD, REGLAS §3).
- **Sí:** `naturaleza_de` en SQL como espejo de `naturalezaDe`. Se acepta la duplicación porque la necesitan los triggers y `reordenar_cuentas`.
- **Sí:** `fechaSaldos` la calcula la API con la zona horaria del perfil, y usa `America/Bogota` si no hay perfil.
- **No:** endpoint para leer `cuentas_cambios` ni `GET /cuentas/:id`. Ninguna N-xx los pide.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El filtro global cambia el cuerpo de los errores de `/perfil` | Paso 6: `perfil.e2e-spec.ts` debe seguir en verde. Hoy ningún cliente lee ese cuerpo. |
| `naturaleza_de` y `naturalezaDe` se desincronizan al agregar tipos | Una prueba de aislamiento o e2e crea un tipo de cada naturaleza y comprueba el grupo. Al ampliar el check se tocan las dos. |
| La carrera al crear dos cuentas a la vez da la misma `posicion` | Sin unicidad en `posicion`, el empate es inofensivo y el orden se resuelve por `creado_en`. El siguiente reordenamiento normaliza. |
| `numeric` llega como string o number según el cliente de Supabase | El repositorio convierte siempre a `bigint` desde string. Si llega number, falla en las pruebas: no se usa. |
| El trigger `security definer` es una vía de escalada | `set search_path = ''`, `revoke all` y solo inserta filas de la cuenta actualizada. Lo verifica `get_advisors`. |

## Lo que **no** entra en este spec

- USD, TRM, inversiones, préstamos y deudas.
- Ciclo de la tarjeta (corte, pago límite).
- Movimientos y su efecto en el saldo. El bloqueo de borrado con movimientos llega con ellos.
- Consulta del historial de cambios.
- Detalle de una cuenta.

Cada uno, si llega, va en su propio spec.
