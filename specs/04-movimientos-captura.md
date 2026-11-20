# SPEC 04 — Movimientos y captura rápida

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 03
> **Fecha:** 2026-11-19
> **Objetivo:** Que la API registre, liste por mes, edite y elimine movimientos con saldos calculados e historial, y dé a la captura rápida categorías, reglas, sugerencias, conceptos frecuentes, gasto de hoy y cuenta predeterminada.

## Por qué existe este spec

Es el corazón del criterio de éxito: registrar un gasto en menos de diez segundos. Cierra lo que SPEC 02 y SPEC 03 dejaron pendiente de movimientos:

- El saldo de `cuentas_con_saldo` pasa a ser saldo inicial más movimientos (RN-01, RN-02).
- Una cuenta con movimientos no se elimina: FK `on delete restrict` (SPEC 03).
- La moneda base se bloquea con movimientos (RN-15, SPEC 02).

Fija un patrón nuevo: **toda escritura de movimientos pasa por funciones de Postgres**. Un movimiento con partes son varias filas que deben cambiar juntas, y el historial (RN-13) necesita el estado anterior y el nuevo completos. Las funciones son la única vía de escritura para el usuario, así que la garantía vive en la BD.

Cubre el inventario `specs/necesidades/captura-rapida.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con `categorias`, `reglas_categoria`, `movimientos`, `movimiento_partes`, `movimientos_cambios`, la vista `movimientos_detalle`, la vista `cuentas_con_saldo` ampliada, las funciones de escritura y consulta, la semilla de categorías y reglas, el bloqueo de moneda base y la cuenta predeterminada en `perfiles`. Todo con RLS.
- Tipos de movimiento: `gasto`, `ingreso`, `transferencia`. Todo en COP, con `moneda` y `tasa` guardadas (RN-04).
- Categoría opcional («sin clasificar»), o división en dos o más partes con categoría.
- Nota opcional. Fecha libre, hoy por defecto en la zona del usuario.
- `GET /movimientos?mes=`, `POST /movimientos`, `PUT /movimientos/:id`, `DELETE /movimientos/:id`.
- Historial de ediciones y eliminaciones en `movimientos_cambios`.
- `GET /captura`: cuenta predeterminada, categorías por tipo, gasto de hoy, conceptos frecuentes.
- `GET /sugerencias?tipo=&texto=`: autocompletado de conceptos y categoría propuesta por regla.
- `POST /reglas` y `PATCH /reglas/:id`: crear la regla ofrecida y ajustarla al corregir (RN-11).
- `PATCH /perfil`: elegir la cuenta predeterminada. `GET /perfil` la devuelve.
- `DELETE /cuentas/:id` con movimientos responde `CUENTA_CON_MOVIMIENTOS`.
- Dominio: `validarMovimiento` reescrito, normalización de texto, propuesta de categoría, rango de un mes. Se elimina `domain/saldo/`.
- Prueba de aislamiento ampliada. Pruebas de punta a punta de movimientos, captura y reglas.
- `docs/api/`: `movimientos.md`, `captura.md`, `reglas.md`; actualizar `perfil.md`, `cuentas.md` y `README.md`.

**Fuera de alcance (specs futuros):**

- TRM, avisos, entradas a otros módulos (N-01, N-02, N-03).
- Persona en el movimiento y préstamos (N-44, RN-17).
- Indicador de «sin clasificar» en el resumen (N-60).
- Gestionar categorías (crear, renombrar, archivar). Solo existen las sembradas.
- Listar o borrar reglas. Solo crear y cambiar su categoría.
- Endpoint para consultar `movimientos_cambios`. Ninguna N-xx lo pide.
- Ajuste de saldo (RN-14), recurrentes (RN-10), USD y tasas distintas de 1.
- Saldo «a hoy» excluyendo movimientos con fecha futura.
- Paginación dentro del mes.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_movimientos.sql`. Montos en `numeric(19,0)`, unidades menores.

### Cambios en tablas existentes

- `cuentas`: `unique (usuario_id, id)` (`cuentas_usuario_id_id_key`), destino de las FK compuestas.
- `perfiles`: columna `cuenta_predeterminada_id uuid` nullable, FK `(id, cuenta_predeterminada_id) → cuentas (usuario_id, id) on delete set null (cuenta_predeterminada_id)`.
- Extensión `unaccent` en el esquema `extensions`.

### Tabla `public.categorias`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `nombre` | `text` | not null, `check (char_length(btrim(nombre)) between 1 and 40)` |
| `tipo` | `text` | not null, `check (tipo in ('gasto','ingreso'))` |
| `posicion` | `integer` | not null |
| `creado_en` | `timestamptz` | not null, default `now()` |

- `unique (usuario_id, id, tipo)` (`categorias_usuario_id_tipo_key`) y `unique (usuario_id, id)`, destinos de FK compuestas.
- Índice único `categorias_nombre_unico (usuario_id, tipo, lower(nombre))`. Índice `categorias_usuario_idx (usuario_id)`.
- RLS: solo `categorias_select_propia`. Sin INSERT, UPDATE ni DELETE para usuarios: solo la semilla las crea.

### Tabla `public.reglas_categoria`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `palabra_clave` | `text` | not null, `check (char_length(palabra_clave) between 1 and 60 and palabra_clave = lower(palabra_clave))` |
| `categoria_id` | `uuid` | not null |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- FK `(usuario_id, categoria_id) → categorias (usuario_id, id) on delete cascade`.
- Índice único `reglas_palabra_unica (usuario_id, palabra_clave)`. Índice `reglas_usuario_idx (usuario_id)`.
- `palabra_clave` se guarda normalizada por el dominio (minúsculas, sin tildes, espacios colapsados).
- RLS: `reglas_select_propia`, `reglas_insert_propia`, `reglas_update_propia`. Sin DELETE.
- Trigger `marcar_actualizado`.

### Tabla `public.movimientos`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `tipo` | `text` | not null, `check (tipo in ('gasto','ingreso','transferencia'))` |
| `monto` | `numeric(19,0)` | not null, `check (monto > 0)` |
| `moneda` | `text` | not null, default `'COP'`, `check (moneda = 'COP')` |
| `tasa` | `numeric(18,6)` | not null, default `1`, `check (tasa > 0)` |
| `fecha` | `date` | not null |
| `descripcion` | `text` | nullable, `check (char_length(btrim(descripcion)) between 1 and 80)` |
| `nota` | `text` | nullable, `check (char_length(nota) <= 500)` |
| `cuenta_origen_id` | `uuid` | nullable |
| `cuenta_destino_id` | `uuid` | nullable |
| `categoria_id` | `uuid` | nullable |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `check` de forma por tipo (`movimientos_cuentas_por_tipo`):
  - `gasto`: origen no nulo, destino nulo.
  - `ingreso`: destino no nulo, origen nulo.
  - `transferencia`: ambos no nulos y distintos, `categoria_id` nulo (RN-03, RN-05).
- FK `(usuario_id, cuenta_origen_id) → cuentas (usuario_id, id) on delete restrict`. Igual para `cuenta_destino_id`.
- FK `(usuario_id, categoria_id, tipo) → categorias (usuario_id, id, tipo) on delete restrict`. Con `categoria_id` nulo no se evalúa (MATCH SIMPLE). Impide la categoría ajena y la de otro tipo.
- Índices: `movimientos_usuario_fecha_idx (usuario_id, fecha desc, creado_en desc)`, `movimientos_origen_idx (cuenta_origen_id)`, `movimientos_destino_idx (cuenta_destino_id)`.
- RLS: solo `movimientos_select_propio`. Sin INSERT, UPDATE ni DELETE: se escribe por funciones.
- Trigger `marcar_actualizado`.

### Tabla `public.movimiento_partes`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `movimiento_id` | `uuid` | not null, FK `movimientos(id) on delete cascade` |
| `usuario_id` | `uuid` | not null |
| `categoria_id` | `uuid` | not null |
| `monto` | `numeric(19,0)` | not null, `check (monto > 0)` |

- FK `(usuario_id, categoria_id) → categorias (usuario_id, id) on delete restrict`.
- `unique (movimiento_id, categoria_id)`. Índices `movimiento_partes_movimiento_idx (movimiento_id)` y `movimiento_partes_usuario_idx (usuario_id)`.
- RLS: solo `movimiento_partes_select_propia`.
- Un movimiento con partes tiene `categoria_id` nulo. Lo garantizan las funciones de escritura.

### Tabla `public.movimientos_cambios`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `movimiento_id` | `uuid` | not null, **sin FK**: sobrevive a la eliminación |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `operacion` | `text` | not null, `check (operacion in ('edicion','eliminacion'))` |
| `antes` | `jsonb` | not null: fila completa más `partes` |
| `despues` | `jsonb` | nullable: igual forma; nulo en `eliminacion` |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `movimientos_cambios_usuario_idx (usuario_id)` y `movimientos_cambios_movimiento_idx (movimiento_id)`.
- RLS: solo `movimientos_cambios_select_propio`. El historial no se edita.

### Funciones de escritura

Todas `security definer`, `set search_path = ''`, `revoke all ... from public, anon` y `grant execute ... to authenticated`. Fuerzan `usuario_id = auth.uid()` y lanzan `NO_AUTENTICADO` si es nulo. Las FK compuestas garantizan que cuentas y categorías sean del usuario.

Los errores se lanzan como `raise exception '<CODIGO>'` o `'<CODIGO>:<campo>'`. El repositorio los separa.

- `registrar_movimiento(p_tipo text, p_monto numeric, p_fecha date, p_descripcion text, p_nota text, p_cuenta_origen_id uuid, p_cuenta_destino_id uuid, p_categoria_id uuid, p_partes jsonb) returns uuid`.
  - `p_fecha` nulo → hoy en `perfiles.zona_horaria`.
  - Rechaza cuentas archivadas (`CUENTA_ARCHIVADA:<campo>`).
  - Valida partes (`p_partes` es `[{categoria_id, monto}]` o nulo): no con transferencia (`DIVISION_NO_PERMITIDA`), no con `p_categoria_id` (`PARTES_CON_CATEGORIA`), al menos dos (`PARTES_INSUFICIENTES`), sin categorías repetidas (`PARTES_REPETIDAS`), cada categoría del tipo del movimiento (`CATEGORIA_INVALIDA:partes`) y suma igual a `p_monto` (`PARTES_NO_SUMAN`).
  - Inserta el movimiento y sus partes.
- `reemplazar_movimiento(p_id uuid, …mismos parámetros…) returns uuid`.
  - `MOVIMIENTO_NO_ENCONTRADO` si no existe para el usuario.
  - `CUENTA_ARCHIVADA` si alguna cuenta anterior o nueva está archivada.
  - Toma `antes` (fila + partes), actualiza la fila, reemplaza las partes, toma `despues` e inserta `('edicion', antes, despues)` en `movimientos_cambios`. Si `antes` y `despues` son iguales (sin contar `actualizado_en`), no registra.
- `eliminar_movimiento(p_id uuid) returns void`.
  - `MOVIMIENTO_NO_ENCONTRADO` y `CUENTA_ARCHIVADA` como arriba.
  - Inserta `('eliminacion', antes, null)` y borra la fila; las partes caen en cascada.

El cuidado con las archivadas mantiene el invariante de SPEC 03: una archivada tiene saldo cero y no se modifica.

### Funciones de consulta

Todas `security invoker`, `set search_path = ''`, `grant execute to authenticated`.

- `gastos_del_dia(p_fecha date) returns numeric`: suma de `monto` de los `gasto` con esa fecha. Sin transferencias ni ingresos (RN-05).
- `conceptos_frecuentes(p_desde date, p_limite integer) returns table (tipo text, descripcion text, usos bigint)`: por tipo, las `p_limite` descripciones más usadas desde `p_desde`. Agrupa por `lower(btrim(descripcion))`, muestra la grafía más reciente y desempata por uso más reciente.
- `conceptos_por_prefijo(p_tipo text, p_prefijo text, p_limite integer) returns table (descripcion text, usos bigint)`: descripciones del tipo cuyo `extensions.unaccent(lower(…))` empieza por el prefijo normalizado. Escapa `%` y `_`. Todo el historial, por frecuencia.

### Triggers

- `sembrar_categorias()`, `after insert on perfiles`, `security definer`. Inserta las categorías y reglas de la semilla para `new.id`. La migración también siembra a los perfiles existentes que no tengan categorías.
- `bloquear_moneda_base()`, `before update of moneda_base on perfiles`. Si cambia y el usuario tiene movimientos, `raise exception 'MONEDA_BASE_BLOQUEADA'` (RN-15).

### Semilla

Categorías, en este orden (`posicion` 0…):

- Gasto: Comida, Transporte, Celular, Mercado, Hogar, Salud, Ocio, Servicios, Otros gastos.
- Ingreso: Salario, Trabajo independiente, Reembolso, Otros ingresos.

Reglas (palabra clave → categoría):

| Categoría | Palabras clave |
|---|---|
| Comida | almuerzo, corrientazo, restaurante, desayuno, cena, tinto, cafe, empanada, arepa, comida |
| Transporte | pasaje, transmilenio, sitp, bus, uber, didi, taxi, parqueadero, gasolina |
| Celular | recarga, datos, celular, minutos |
| Mercado | tienda, d1, ara, exito, mercado, olimpica, carulla |
| Salud | farmacia, drogueria, medico, eps |
| Ocio | netflix, spotify, cine, cerveza, bar |
| Salario | nomina, salario, sueldo |
| Trabajo independiente | freelance, honorarios, proyecto |
| Reembolso | reembolso, devolucion |

### Vistas

- `cuentas_con_saldo` (se reemplaza, mismas columnas). `saldo = saldo_inicial + signo × Σ`, donde Σ suma `+monto` si la cuenta es destino y `−monto` si es origen, y `signo` es `1` en activo y `−1` en pasivo (`naturaleza_de`). Es el espejo SQL de `efectoEnSaldo`. Incluye todos los movimientos, con fecha futura o no.
- `movimientos_detalle`, `with (security_invoker = true)`: `movimientos.*` más `cuenta_origen_nombre`, `cuenta_destino_nombre`, `categoria_nombre` y `partes jsonb` (`[{categoria_id, categoria_nombre, monto}]` o `[]`).

### Tipos de dominio

```ts
// src/domain/movimiento/movimiento.ts
type TipoMovimiento = "gasto" | "ingreso" | "transferencia";
type Parte = { categoriaId: string; monto: bigint };
type MovimientoEntrada = {
  tipo: TipoMovimiento;
  monto: bigint;                 // > 0
  fecha: string | null;          // "YYYY-MM-DD"; null = hoy
  descripcion: string | null;
  nota: string | null;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoriaId: string | null;
  partes: Parte[] | null;
};

// src/domain/categorizacion/proponer.ts
type Regla = { id: string; palabraClave: string; categoriaId: string; creadoEn: Date };
```

### Contrato HTTP

Convenciones de `docs/api/README.md`: montos como string entero, fechas `"YYYY-MM-DD"` en la zona del usuario, `ErrorApi`.

```ts
type Ref = { id: string; nombre: string };
type CategoriaDto = { id: string; nombre: string; tipo: "gasto" | "ingreso" };

type MovimientoDto = {
  id: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  monto: string;                // positivo; el signo lo pone el cliente según tipo
  moneda: "COP";
  tasa: string;                 // decimal, hoy "1"
  fecha: string;                // "YYYY-MM-DD"
  descripcion: string | null;
  nota: string | null;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;        // null y partes vacío = sin clasificar
  partes: { categoria: Ref; monto: string }[];
  creadoEn: string;
  actualizadoEn: string;
};

type MovimientoCuerpo = {       // POST y PUT
  tipo: "gasto" | "ingreso" | "transferencia";
  monto: string;                // ^\d{1,19}$, > 0
  fecha?: string;               // POST: opcional (hoy). PUT: obligatoria.
  descripcion?: string | null;
  nota?: string | null;
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  categoriaId?: string | null;
  partes?: { categoriaId: string; monto: string }[] | null;
};

type CapturaDto = {
  fechaHoy: string;
  cuentaPredeterminadaId: string | null;   // elegida si está activa; si no, la primera activa del orden; null sin cuentas
  categorias: { gasto: CategoriaDto[]; ingreso: CategoriaDto[] };
  gastosHoy: string;
  conceptosFrecuentes: { gasto: string[]; ingreso: string[]; transferencia: string[] };   // hasta 6, últimos 90 días
};

type SugerenciasDto = {
  conceptos: { descripcion: string; categoria: CategoriaDto | null }[];   // hasta 2
  propuesta: { categoria: CategoriaDto; regla: { id: string; palabraClave: string } } | null;
};

type ReglaDto = { id: string; palabraClave: string; categoria: CategoriaDto };
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /movimientos` | `?mes=YYYY-MM` (opcional: mes actual en la zona del usuario) | `200 { mes, movimientos: MovimientoDto[] }`, por `fecha` desc y `creado_en` desc |
| `POST /movimientos` | `MovimientoCuerpo` | `201 MovimientoDto` |
| `PUT /movimientos/:id` | `MovimientoCuerpo` con `fecha` | `200 MovimientoDto` |
| `DELETE /movimientos/:id` | — | `204` |
| `GET /captura` | — | `200 CapturaDto` |
| `GET /sugerencias` | `?tipo=gasto\|ingreso\|transferencia&texto=` | `200 SugerenciasDto` |
| `POST /reglas` | `{ palabraClave, categoriaId }` | `201 ReglaDto` |
| `PATCH /reglas/:id` | `{ categoriaId }` | `200 ReglaDto` |
| `PATCH /perfil` | `{ cuentaPredeterminadaId: string \| null }` | `200 Perfil` (con `cuentaPredeterminadaId`) |

- `GET /sugerencias`: `texto` vacío o ausente → listas vacías. En `transferencia` no hay propuesta y los conceptos van sin categoría. La categoría de cada concepto es la que propone la regla para ese concepto.
- Coincidencia de regla (dominio): texto y palabra clave normalizados y divididos en palabras; la palabra clave debe aparecer como palabras completas y contiguas. Solo cuentan reglas cuya categoría es del tipo pedido. Varias → la palabra clave más larga; empate → la más reciente.
- `palabraClave` se normaliza antes de guardar; si queda vacía, `PALABRA_CLAVE_REQUERIDA`.

### Errores nuevos

Se suman al catálogo de `src/comun/error-api.ts`.

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `TIPO_MOVIMIENTO_INVALIDO` | 400 | `tipo` | «Elige gasto, ingreso o transferencia.» |
| `MONTO_REQUERIDO` | 400 | `monto` o `partes.N.monto` | «Escribe un monto mayor que cero.» |
| `FECHA_INVALIDA` | 400 | `fecha` | «Escribe una fecha válida.» |
| `MES_INVALIDO` | 400 | `mes` | «Escribe un mes válido (AAAA-MM).» |
| `DESCRIPCION_LARGA` | 400 | `descripcion` | «La descripción admite hasta 80 caracteres.» |
| `NOTA_LARGA` | 400 | `nota` | «La nota admite hasta 500 caracteres.» |
| `ORIGEN_REQUERIDO` | 400 | `cuentaOrigenId` | «Elige la cuenta de origen.» |
| `DESTINO_REQUERIDO` | 400 | `cuentaDestinoId` | «Elige la cuenta de destino.» |
| `ORIGEN_NO_PERMITIDO` | 400 | `cuentaOrigenId` | «Un ingreso no tiene cuenta de origen.» |
| `DESTINO_NO_PERMITIDO` | 400 | `cuentaDestinoId` | «Un gasto no tiene cuenta de destino.» |
| `CUENTAS_IGUALES` | 400 | `cuentaDestinoId` | «Origen y destino deben ser cuentas distintas.» |
| `CATEGORIA_NO_PERMITIDA` | 400 | `categoriaId` | «Una transferencia no lleva categoría.» |
| `DIVISION_NO_PERMITIDA` | 400 | `partes` | «Una transferencia no se divide.» |
| `PARTES_CON_CATEGORIA` | 400 | `partes` | «Usa una categoría o divide, no ambas.» |
| `PARTES_INSUFICIENTES` | 400 | `partes` | «Divide en al menos dos partes.» |
| `PARTES_REPETIDAS` | 400 | `partes` | «Cada parte debe tener una categoría distinta.» |
| `PARTES_NO_SUMAN` | 422 | `partes` | «Las partes deben sumar el monto total.» |
| `CATEGORIA_INVALIDA` | 422 | `categoriaId` o `partes` | «La categoría no existe o no corresponde al tipo.» |
| `CUENTA_INVALIDA` | 422 | `cuentaOrigenId`, `cuentaDestinoId` o `cuentaPredeterminadaId` | «La cuenta no existe.» |
| `MOVIMIENTO_NO_ENCONTRADO` | 404 | — | «El movimiento no existe.» |
| `CUENTA_CON_MOVIMIENTOS` | 409 | — | «La cuenta tiene movimientos. Archívala en lugar de eliminarla.» |
| `PALABRA_CLAVE_REQUERIDA` | 400 | `palabraClave` | «Escribe una palabra clave.» |
| `PALABRA_CLAVE_LARGA` | 400 | `palabraClave` | «La palabra clave admite hasta 60 caracteres.» |
| `PALABRA_CLAVE_DUPLICADA` | 409 | `palabraClave` | «Ya tienes una regla con esa palabra clave.» |
| `REGLA_NO_ENCONTRADA` | 404 | — | «La regla no existe.» |

Se reutilizan `MONTO_INVALIDO`, `CUENTA_ARCHIVADA` (con `campo`), `SIN_CAMBIOS`, `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

Traducciones en los repositorios:

- `<CODIGO>[:<campo>]` lanzado por las funciones → su código y campo.
- `23503` sobre las FK de cuenta del movimiento → `CUENTA_INVALIDA`; sobre la de categoría → `CATEGORIA_INVALIDA`; sobre la de `perfiles` → `CUENTA_INVALIDA`.
- `23503` al borrar una cuenta (`DELETE /cuentas/:id`) → `CUENTA_CON_MOVIMIENTOS`.
- `23505` sobre `reglas_palabra_unica` → `PALABRA_CLAVE_DUPLICADA`.
- Fila no visible por RLS → `MOVIMIENTO_NO_ENCONTRADO` o `REGLA_NO_ENCONTRADA`.
- `MONEDA_BASE_BLOQUEADA` no tiene endpoint hoy; si llegara, `ERROR_INTERNO`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_movimientos.sql
src/
  app.module.ts                         # + MovimientosModule, CapturaModule, ReglasModule
  comun/error-api.ts                    # + códigos nuevos
  movimientos/
    movimientos.controller.ts
    movimientos.service.ts
    movimientos.module.ts
    esquemas.ts                         # Zod: cuerpo, ?mes, :id
    dto.ts
  captura/
    captura.controller.ts               # GET /captura, GET /sugerencias
    captura.service.ts
    captura.module.ts
    esquemas.ts
    dto.ts
  reglas/
    reglas.controller.ts
    reglas.service.ts
    reglas.module.ts
    esquemas.ts
  perfil/                               # + PATCH /perfil, cuentaPredeterminadaId
  domain/
    movimiento/
      movimiento.ts                     # tipos
      validar.ts (+ validar.test.ts)    # reescrito: categoría opcional, partes
    categorizacion/
      proponer.ts (+ proponer.test.ts)  # proponerCategoria(texto, tipo, reglas)
    texto/
      normalizar.ts (+ normalizar.test.ts)   # normalizarTexto, palabras
    fecha/
      mes.ts (+ mes.test.ts)            # mesLocal, rangoDelMes
    perfil/perfil.ts                    # + cuentaPredeterminadaId
    saldo/                              # se elimina (calcular.ts y su prueba)
  repositories/supabase/
    movimientos.repository.ts
    categorias.repository.ts
    reglas.repository.ts
    captura.repository.ts               # gastos_del_dia, conceptos_*
    perfiles.repository.ts              # + actualizar
    cuentas.repository.ts               # + 23503 → CUENTA_CON_MOVIMIENTOS
    tipos.ts                            # regenerado
test/
  aislamiento.e2e-spec.ts               # ampliado (no se borra ni se desactiva)
  movimientos.e2e-spec.ts
  captura.e2e-spec.ts                   # captura, sugerencias, reglas, perfil
docs/api/
  README.md, movimientos.md, captura.md, reglas.md, perfil.md, cuentas.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase. El dominio valida la forma del movimiento antes de llamar a la BD; las funciones de Postgres son la garantía final.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_movimientos.sql` según el modelo. **El autor la revisa antes del paso 2.**
2. Aplicarla con `apply_migration` sobre Tino dev. `get_advisors` (security y performance) y corregir avisos en una migración nueva. Regenerar `tipos.ts`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con una cuenta y un movimiento:
   - El otro no ve el movimiento en `movimientos`, `movimientos_detalle`, `movimiento_partes` ni `movimientos_cambios`, ni las categorías y reglas ajenas.
   - INSERT, UPDATE y DELETE directos en `movimientos` y `movimiento_partes` fallan o afectan 0 filas.
   - `registrar_movimiento` con la cuenta o la categoría ajena falla.
   - `reemplazar_movimiento` y `eliminar_movimiento` sobre el movimiento ajeno lanzan `MOVIMIENTO_NO_ENCONTRADO`.
   - `gastos_del_dia` y `conceptos_frecuentes` solo cuentan lo propio.
   - El usuario nuevo tiene sus 13 categorías y sus reglas sembradas.

   `npm test` en verde.
4. Dominio con pruebas:
   - `texto/normalizar.ts`: «Almuerzo  Corrientazo» → «almuerzo corrientazo»; «Café» → «cafe».
   - `categorizacion/proponer.ts`: «almuerzo corrientazo» con reglas `almuerzo` y `corrientazo` → `corrientazo` (más larga); «barbería» no coincide con `bar`; regla de ingreso no aplica a gasto; empate → la más reciente.
   - `movimiento/validar.ts` reescrito: cada código de forma de la tabla; gasto sin categoría es válido; partes que no suman → `PARTES_NO_SUMAN`.
   - `fecha/mes.ts`: `rangoDelMes("2026-02")` → `2026-02-01` a `2026-02-28`; `mesLocal(2026-12-01T03:00Z, America/Bogota)` → `2026-11`.
   - Eliminar `src/domain/saldo/`.
5. Agregar los códigos a `error-api.ts`. En `cuentas.repository.ts`, `23503` al eliminar → `CUENTA_CON_MOVIMIENTOS`.
6. `PATCH /perfil` y `cuentaPredeterminadaId` en `GET /perfil`. El servicio rechaza una cuenta archivada (`CUENTA_ARCHIVADA`).
7. `movimientos.repository.ts` (lee de `movimientos_detalle`, escribe por `rpc`, convierte `numeric` ↔ `bigint`, traduce errores) y `GET /movimientos`. El mes por defecto sale de `mesLocal` con la zona del perfil.
8. `POST`, `PUT` y `DELETE /movimientos`. El servicio corre `validarMovimiento` y luego la función. `POST` y `PUT` devuelven la fila leída de `movimientos_detalle`.
9. `categorias.repository.ts`, `reglas.repository.ts` y `src/reglas/` con `POST /reglas` y `PATCH /reglas/:id`.
10. `captura.repository.ts` y `src/captura/` con `GET /captura` (consultas en paralelo) y `GET /sugerencias`.
11. `test/movimientos.e2e-spec.ts` y `test/captura.e2e-spec.ts` con los criterios de aceptación. Se omiten con aviso si falta `SUPABASE_SECRET_KEY`.
12. `docs/api/`: `movimientos.md`, `captura.md`, `reglas.md`; actualizar `perfil.md`, `cuentas.md` (saldo con movimientos, `CUENTA_CON_MOVIMIENTOS`) y la tabla de `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | Fuera de alcance: USD y TRM llegan con inversiones. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | `GET /movimientos` sin `mes` → mes actual (`mesLocal`). |
| N-05 | `GET /movimientos?mes=` + `MES_INVALIDO`. |
| N-06 | Orden `fecha` desc, `creado_en` desc; índice `movimientos_usuario_fecha_idx`. |
| N-07 | `MovimientoDto.fecha` (`date`, día del usuario). |
| N-08 | `MovimientoDto.descripcion`. |
| N-09 | `MovimientoDto.categoria`, `partes`, `tipo`. |
| N-10 | `MovimientoDto.cuentaOrigen`, `cuentaDestino`. |
| N-11 | `MovimientoDto.tipo` + `monto` positivo. |
| N-12 | `MovimientoDto.partes`. |
| N-13 | `movimientos: []`. |
| N-14 | Estados HTTP y `ErrorApi`. La carga es del cliente. |
| N-15 | `MovimientoDto.id`; `:id` en las rutas. |
| N-16 | `PUT /movimientos/:id` → `reemplazar_movimiento`. |
| N-17 | `validarMovimiento` en `PUT` + checks y validación de partes en la función. |
| N-18 | `DELETE /movimientos/:id` → `eliminar_movimiento`. La confirmación es del cliente. |
| N-19 | `movimientos_cambios` (`antes`, `despues`), escrito por las funciones. |
| N-20 | `cuentas_con_saldo` ampliada; `GET /cuentas` (SPEC 03) la lee. |
| N-21 | `MovimientoCuerpo.tipo` + `TIPO_MOVIMIENTO_INVALIDO`. El defecto «gasto» es del cliente. |
| N-22 | `MONTO_REQUERIDO`, `MONTO_INVALIDO`; `check (monto > 0)`. |
| N-23 | `movimientos.moneda`, `tasa`; `MovimientoDto.moneda`, `tasa`. |
| N-24 | `descripcion` opcional. |
| N-25 | `GET /sugerencias` → `conceptos` (`conceptos_por_prefijo`). |
| N-26 | `SugerenciasDto.conceptos[].categoria`. |
| N-27 | `GET /captura` → `categorias.gasto`, `categorias.ingreso`. |
| N-28 | `GET /sugerencias` → `propuesta.categoria`, `propuesta.regla.palabraClave`. |
| N-29 | `MovimientoCuerpo.categoriaId` (nulo la quita). |
| N-30 | `categoria_id` nullable; `validarMovimiento` no la exige. |
| N-31 | FK `(usuario_id, categoria_id, tipo)` + `CATEGORIA_INVALIDA`. |
| N-32 | Ya cubierto por SPEC 03 (`GET /cuentas`). |
| N-33 | `GET /captura` → `cuentaPredeterminadaId`. |
| N-34 | `PATCH /perfil` → `perfiles.cuenta_predeterminada_id`. |
| N-35 | `CuentaDto.saldo` y `naturaleza` (SPEC 03), ya con movimientos. La vista previa es del cliente. |
| N-36 | FK compuestas + `CUENTA_INVALIDA`; `CUENTA_ARCHIVADA` en las funciones. |
| N-37 | `ORIGEN_REQUERIDO`, `DESTINO_REQUERIDO`, `CUENTAS_IGUALES`; check `movimientos_cuentas_por_tipo`. |
| N-38 | `CATEGORIA_NO_PERMITIDA`; check; `gastos_del_dia` solo suma gastos. |
| N-39 | `fecha` opcional en `POST` (hoy en la zona del perfil), sin límite de rango; `FECHA_INVALIDA`. |
| N-40 | `MovimientoCuerpo.nota`, `NOTA_LARGA`. |
| N-41 | `MovimientoCuerpo.partes` → `movimiento_partes`. |
| N-42 | `PARTES_INSUFICIENTES`, `PARTES_REPETIDAS`, `PARTES_NO_SUMAN`, `MONTO_REQUERIDO`, `CATEGORIA_INVALIDA`. |
| N-43 | `DIVISION_NO_PERMITIDA`. |
| N-44 | Fuera de alcance: persona → préstamos (RN-17, REGLAS §7). |
| N-45 | `POST /movimientos` → `201 MovimientoDto`. |
| N-46 | `DELETE /movimientos/:id`; el plazo de 5 s es del cliente. |
| N-47 | `POST /reglas`. El cliente sabe que no hay regla por `propuesta: null`. |
| N-48 | `PATCH /reglas/:id`, con el id de `propuesta.regla`. |
| N-49 | `ErrorApi` con `campo`. |
| N-50 | Trigger `sembrar_categorias` + backfill. |
| N-51 | Reglas de la semilla en `sembrar_categorias`. |
| N-52 | Montos string entero; `numeric(19,0)`; `bigint` en el dominio. |
| N-53 | RLS en las tablas nuevas, vistas `security_invoker`, FK compuestas; `test/aislamiento.e2e-spec.ts`. |
| N-54 | Trigger `bloquear_moneda_base`. |
| N-55 | FK `on delete restrict` + `CUENTA_CON_MOVIMIENTOS`. |
| N-56 | `GET /captura` → `gastosHoy` (`gastos_del_dia`). |
| N-57 | `GET /captura` → `conceptosFrecuentes` (`conceptos_frecuentes`, 90 días, 6 por tipo). |
| N-58 | `GET /sugerencias?texto=<concepto>` → `propuesta`. |
| N-59 | `conceptosFrecuentes` con listas vacías. |
| N-60 | Fuera de alcance: resumen e informes (REGLAS §7). |

Cada endpoint responde a al menos una N-xx: `GET /movimientos` (N-04), `POST` (N-45), `PUT` (N-16), `DELETE` (N-18, N-46), `GET /captura` (N-27, N-33, N-56, N-57), `GET /sugerencias` (N-25, N-28), `POST /reglas` (N-47), `PATCH /reglas/:id` (N-48), `PATCH /perfil` (N-34).

## Criterios de aceptación

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre las tablas, vistas ni funciones nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3 y no deja usuarios de prueba.
- [ ] Un usuario nuevo tiene 9 categorías de gasto y 4 de ingreso en `GET /captura`, en el orden de la semilla.
- [ ] Con «Nequi» (banco, `"20321"`) y «Tarjeta» (`tarjeta_credito`, `"1284300"`, cupo `"4000000"`):
  - un gasto de `"15000"` desde Nequi deja su saldo en `"5321"`;
  - un gasto de `"15000"` con la tarjeta deja su saldo en `"1299300"`;
  - una transferencia de `"5000"` de Nequi a la tarjeta deja Nequi en `"321"` y la tarjeta en `"1294300"`;
  - un ingreso de `"100000"` a Nequi lo deja en `"100321"`.
- [ ] `POST /movimientos` sin `fecha` guarda la fecha de hoy en la zona del perfil.
- [ ] Un gasto sin `categoriaId` ni `partes` responde `201` con `categoria: null` y `partes: []`.
- [ ] Gasto sin origen → `400 ORIGEN_REQUERIDO`; transferencia con origen = destino → `400 CUENTAS_IGUALES`; transferencia con categoría → `400 CATEGORIA_NO_PERMITIDA`.
- [ ] `monto: "0"` → `400 MONTO_REQUERIDO`; `monto: "1.5"` → `400 MONTO_INVALIDO`.
- [ ] Un gasto con una categoría de ingreso → `422 CATEGORIA_INVALIDA`.
- [ ] Un gasto en una cuenta archivada → `409 CUENTA_ARCHIVADA` con `campo: "cuentaOrigenId"`.
- [ ] Un gasto de `"30000"` dividido en Comida `"20000"` y Mercado `"10000"` responde `201` con dos partes. Con `"20000"` y `"5000"` → `422 PARTES_NO_SUMAN`. Con una sola parte → `400 PARTES_INSUFICIENTES`.
- [ ] `GET /movimientos?mes=2026-11` devuelve solo movimientos de noviembre, el más reciente primero; a igual fecha, el último registrado primero.
- [ ] `GET /movimientos` sin `mes` devuelve el mes actual. `?mes=2026-13` → `400 MES_INVALIDO`.
- [ ] Cada movimiento de la lista trae los nombres de cuenta y categoría, también si la cuenta fue archivada después.
- [ ] `PUT` que convierte un gasto con categoría en transferencia sin categoría responde `200`, ajusta los dos saldos y deja en `movimientos_cambios` una fila `edicion` con `antes` y `despues`.
- [ ] `PUT` idéntico al estado actual no deja fila en `movimientos_cambios`.
- [ ] `DELETE /movimientos/:id` responde `204`, el saldo vuelve al anterior y queda una fila `eliminacion` con `antes` (partes incluidas).
- [ ] `PUT` o `DELETE` de un movimiento cuya cuenta está archivada → `409 CUENTA_ARCHIVADA`.
- [ ] INSERT, UPDATE y DELETE directos en `movimientos` con el token del usuario no cambian nada.
- [ ] `DELETE /cuentas/:id` de una cuenta con movimientos → `409 CUENTA_CON_MOVIMIENTOS`.
- [ ] Un UPDATE en SQL de `perfiles.moneda_base` con movimientos falla con `MONEDA_BASE_BLOQUEADA`; sin movimientos, pasa.
- [ ] `GET /captura`: `gastosHoy` suma solo los gastos de hoy (sin ingresos, transferencias ni gastos de ayer).
- [ ] `GET /captura`: `conceptosFrecuentes.gasto` trae como máximo 6 descripciones, la más usada en 90 días primero; un usuario sin movimientos recibe listas vacías.
- [ ] `GET /captura`: sin elegir, `cuentaPredeterminadaId` es la primera activa del orden. Tras `PATCH /perfil` con Efectivo, es Efectivo. Archivada Efectivo, vuelve a la primera activa.
- [ ] `PATCH /perfil` con una cuenta ajena → `422 CUENTA_INVALIDA`; con una archivada → `409 CUENTA_ARCHIVADA`.
- [ ] `GET /sugerencias?tipo=gasto&texto=almu` con «Almuerzo» registrado antes trae el concepto «Almuerzo» con categoría Comida.
- [ ] `GET /sugerencias?tipo=gasto&texto=Corrientazo` trae `propuesta` Comida con `palabraClave: "corrientazo"`.
- [ ] `GET /sugerencias?tipo=gasto&texto=barbería` trae `propuesta: null`.
- [ ] `POST /reglas` con `palabraClave: "Peluquería"` y Hogar guarda `"peluqueria"`; después `texto=peluqueria` propone Hogar. Repetirla → `409 PALABRA_CLAVE_DUPLICADA`.
- [ ] `PATCH /reglas/:id` cambia la categoría y la siguiente sugerencia lo refleja. Una regla ajena → `404 REGLA_NO_ENCONTRADA`.
- [ ] Ninguna ruta devuelve texto de Postgres en `mensaje`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`.
- [ ] Ningún monto pasa por `number` en el dominio ni en los repositorios.
- [ ] `src/domain/saldo/` no existe.

## Decisiones

- **Sí:** un solo spec para toda la captura. **No:** partir en movimientos y reglas; decisión del autor.
- **Sí:** `cuenta_origen_id` / `cuenta_destino_id` con un check por tipo, como el stub del dominio. **No:** `cuenta_id` + destino, ni partida doble.
- **Sí:** FK compuestas `(usuario_id, …)` hacia cuentas y categorías. Garantizan en la BD que todo es del mismo usuario y que la categoría es del tipo. **No:** comprobarlo solo en el servicio.
- **Sí:** categoría en el movimiento y `movimiento_partes` solo al dividir. El caso común es una fila. **No:** categoría siempre en partes.
- **Sí:** toda escritura de movimientos por funciones `security definer` que fuerzan `auth.uid()`; la tabla no tiene políticas de escritura. Es la única forma de que partes e historial cambien atómicamente sin vía alternativa. **No:** triggers de historial como en `cuentas_cambios`: un trigger no ve las partes nuevas al actualizar la fila.
- **Sí:** historial con `antes` y `despues` en `jsonb`, sin FK al movimiento. **No:** por campo (tipos heterogéneos) ni borrado lógico.
- **Sí:** eliminar es borrado físico más foto en el historial. Deshacer es eliminar.
- **Sí:** `PUT` completo para editar, con cambio de tipo. **No:** `PATCH` parcial.
- **Sí:** movimientos de cuentas archivadas no se crean, editan ni eliminan. Conserva el saldo cero de la archivada (SPEC 03).
- **Sí:** `fecha date` como día contable más `creado_en timestamptz`. REGLAS §6 se lee así: los instantes van en UTC; un día calendario no tiene zona. **No:** `timestamptz`, porque cambiar de zona movería movimientos de día.
- **Sí:** cualquier fecha, también futura, y todas cuentan en el saldo (RN-01 literal). **No:** saldo «a hoy».
- **Sí:** `moneda` (check `COP`) y `tasa` (1) desde el primer movimiento (RN-04). **No:** esperar al USD.
- **Sí:** categorías sembradas por trigger y backfill; lista del móvil. **No:** CRUD de categorías ahora.
- **Sí:** reglas palabra clave → categoría, guardadas normalizadas; coincidencia por palabras completas; gana la más larga y, en empate, la más reciente. Evaluación en `domain/` de la API vía `GET /sugerencias`. **No:** evaluar en el cliente ni coincidencia por subcadena.
- **Sí:** crear la regla es un `POST /reglas` aparte, que el cliente ofrece (RN-11). **No:** crearla de forma implícita al registrar.
- **Sí:** autocompletado y frecuentes en SQL (REGLAS §5), con `unaccent` para el prefijo. Frecuentes: 6 por tipo, 90 días. Autocompletado: 2, todo el historial. La categoría de cada concepto sale de la regla.
- **Sí:** `GET /captura` en una llamada al abrir. **No:** endpoints separados.
- **Sí:** `perfiles.cuenta_predeterminada_id` con FK compuesta y `on delete set null`, resuelta al leer: si falta o está archivada, la primera activa del orden. **No:** flag en `cuentas`, ni limpiarla con un trigger al archivar.
- **Sí:** `MovimientoDto` con `{ id, nombre }` de cuenta y categoría embebidos (vista `movimientos_detalle`). **No:** solo ids.
- **Sí:** monto siempre positivo en el DTO; el signo por tipo lo pone el cliente. Igual que el saldo de un pasivo en SPEC 03.
- **Sí:** el agente reescribe `validarMovimiento` (categoría opcional, partes) y elimina `calcularSaldo`: el saldo sale de la vista, como decidió SPEC 03.
- **Sí:** `bloquear_moneda_base` como trigger: `perfiles` admite UPDATE directo del usuario.
- **No:** endpoint para leer `movimientos_cambios`, listar o borrar reglas, ni gestionar categorías. Ninguna N-xx los pide.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las funciones `security definer` saltan la RLS | Fuerzan `usuario_id = auth.uid()`; las FK compuestas rechazan cuentas y categorías ajenas; `set search_path = ''`; revocadas a `anon`. La prueba de aislamiento las ataca con ids ajenos. `get_advisors` las revisa. |
| La vista de saldo se vuelve lenta con muchos movimientos | Índices por cuenta de origen y destino. A escala personal sobra; si no, se materializa en otro spec. |
| `numeric` llega como number desde PostgREST | Los repositorios convierten desde string y fallan en pruebas si llega number, como en SPEC 03. |
| Reglas de la semilla chocan («recarga tarjeta SITP» → Celular, no Transporte) | Es solo una propuesta (RN-11). Al corregir, el cliente ofrece ajustar la regla. |
| La lógica de normalización difiere entre `unaccent` (SQL) y `normalizarTexto` (TS) | Solo el prefijo del autocompletado usa SQL; las reglas usan solo TS. Una e2e cubre «almu» → «Almuerzo» y «cafe» → «Café». |
| `on delete set null (columna)` requiere Postgres 15+ | Verificar la versión de Tino dev en el paso 2; si fuera menor, trigger equivalente. |

## Lo que **no** entra en este spec

- TRM, avisos, préstamos, persona en el movimiento.
- Indicador de «sin clasificar» en el resumen.
- Gestión de categorías; listar o borrar reglas.
- Consulta del historial de cambios.
- Ajuste de saldo, recurrentes, USD.
- Saldo «a hoy» y paginación dentro del mes.

Cada uno, si llega, va en su propio spec.
