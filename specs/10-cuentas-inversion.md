# SPEC 10 — Cuentas de inversión

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 07, SPEC 08, SPEC 09
> **Fecha:** 2026-11-21
> **Objetivo:** Que la API lleve cuentas de inversión en COP o USD, con efectivo, fondeo entre monedas, posiciones derivadas de operaciones de compra y venta, y precio manual, valoradas a mercado en Inversiones, Cuentas, el patrimonio y el puente del resumen.

## Por qué existe este spec

Es el segundo de los tres specs del inventario `specs/necesidades/inversiones.md`. SPEC 09 trajo la TRM y SPEC 11 traerá los precios automáticos. REGLAS §7 ya se enmendó en SPEC 09.

Fija cinco patrones:

- **Una inversión es una cuenta.** Es una fila de `cuentas` con tipo `inversion` (activo) y la columna nueva `moneda` (`COP` o `USD`, fija). Nombre, detalle, archivo y orden reutilizan `/cuentas` (SPEC 03). El efectivo es el saldo de esa cuenta (RN-01): saldo inicial más transferencias, menos compras y más ventas.
- **Las posiciones se derivan, no se guardan.** Se guardan activos, operaciones (`inicial`, `compra`, `venta`) y precios. Cantidad, costo, costo promedio y ganancia realizada se calculan en `src/domain/inversion/` (RN-01, RN-13). Una operación `inicial` registra lo que ya se tenía: suma a la posición y no mueve efectivo.
- **Comprar y vender no son movimientos.** Mueven valor dentro de la cuenta, de efectivo a posición y al revés. Nunca son ingreso ni gasto (RN-06). Lo único que entra y sale de la cuenta son transferencias.
- **El fondeo entre monedas es una transferencia con dos montos.** `movimientos` gana `monto_destino`. Si las monedas de origen y destino difieren, el movimiento guarda el monto que salió y el que llegó, y la tasa implícita queda congelada (RN-04).
- **El valor de mercado es el saldo en Cuentas y en el patrimonio.** Una inversión aporta su valor de mercado en COP, con la TRM de cada fecha. El puente del resumen separa la revaluación de las inversiones del resto de `otrosCambios`.

Cubre el inventario `specs/necesidades/inversiones.md` junto con SPEC 09 y SPEC 11 (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con:
  - el tipo de cuenta `inversion` y la columna `cuentas.moneda`;
  - `movimientos.moneda` con `USD` y la columna `movimientos.monto_destino`;
  - las tablas `inversion_activos`, `inversion_operaciones`, `inversion_operaciones_cambios` e `inversion_precios`;
  - las funciones `crear_inversion` y `registrar_operacion`;
  - los ajustes de `registrar_movimiento`, `reemplazar_movimiento`, `movimientos_detalle`, políticas y triggers de `cuentas`.
  - Todo con RLS.
- `GET /inversiones`, `POST /inversiones` y `GET /inversiones/:id`.
- `GET` y `POST /inversiones/:id/operaciones`, y `PUT`/`DELETE /inversiones/:id/operaciones/:operacionId`.
- `POST /inversiones/:id/activos/:activoId/precios`.
- `TrmService.enFechas` (varias fechas en una lectura y a lo sumo una consulta a la fuente).
- Cambios en módulos existentes:
  - `POST`/`PUT /movimientos` aceptan `montoDestino`, y `MovimientoDto` trae `moneda` y `montoDestino`;
  - `GET /cuentas` incluye las inversiones en `activos` a valor de mercado en COP y trae la TRM;
  - `GET /resumen` valora las inversiones a mercado y agrega `cambioDelMes.revaluacion`;
  - guardas `CUENTA_DE_INVERSION` en movimientos, recurrentes, préstamos y perfil;
  - `EFECTIVO_INSUFICIENTE` en las escrituras que tocan una inversión.
- Dominio puro en `src/domain/inversion/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/inversiones.e2e-spec.ts`, con la fuente de TRM falsa.
- `docs/api/inversiones.md`. Se actualizan `cuentas.md`, `movimientos.md`, `resumen.md`, `recurrentes.md`, `prestamos.md`, `perfil.md`, `captura.md` y `README.md`.

**Fuera de alcance (specs futuros):**

- Precios automáticos, cobertura del proveedor por símbolo, precio de cierre o intradía y clase de activo (SPEC 11; N-23 en parte, N-33, N-48, N-50).
- Dividendos (N-76).
- Gastos e ingresos en USD, y cuentas USD que no sean de inversión (N-77).
- Comisión como campo aparte (N-78): va dentro del monto de la operación.
- Recurrentes sobre cuentas de inversión.
- Editar el símbolo o el nombre de un activo, y eliminar un activo.
- Cambiar la clase o el activo de una operación: se borra y se crea otra.
- Precios de activos con fracciones de centavo.
- Endpoint para consultar `inversion_operaciones_cambios`. Ninguna N-xx lo pide.
- Monedas distintas de COP y USD.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_inversiones.sql`. Los montos y las cantidades son `text` cifrado (SPEC 05).

### Unidades

| Dato | En memoria | En la BD | En el contrato |
|---|---|---|---|
| Monto (efectivo, operación, valor, costo) | `bigint` en unidades menores de la moneda de la cuenta (COP = pesos, USD = centavos) | `text` cifrado | string entero: `"100000"` = US$ 1.000,00 |
| Cantidad | `bigint` en 10⁻⁸ unidades (`1250000n` = 0,0125) | `text` cifrado | string decimal con hasta 8 decimales y sin ceros finales: `"0.0125"`, `"6.25"`, `"1"` |
| Precio por unidad | `bigint` en unidades menores | `bigint`, sin cifrar | string entero: `"56240"` = US$ 562,40 |
| TRM | `bigint` en centavos de peso (SPEC 09) | `integer` | `"4120.00"` |
| Porcentaje de rendimiento | `bigint` en centésimas de punto (`1248n` = 12,48 %) | — | `number` entero en centésimas: `1248` |

- El precio no se cifra: es un dato de mercado, como la TRM. La cantidad sí, porque revela las tenencias.
- Todos los redondeos son half-up (la mitad lejos de cero) y se hacen con aritmética de enteros, sin `Number` ni `parseFloat`.

### Constantes

- Tipo de cuenta `'inversion'`. En el dominio, `TIPO_INVERSION` en `src/domain/inversion/inversion.ts`. `naturalezaDe("inversion")` es `"activo"`.
- Monedas `('COP', 'USD')`. En el dominio, `MONEDAS` en `src/domain/inversion/inversion.ts`.
- Clases de operación `('inicial', 'compra', 'venta')`.
- Orígenes de precio `('manual')`. SPEC 11 amplía el `check`.

### Cambios en tablas y funciones existentes

- `cuentas.tipo`: el `check` admite además `inversion`.
- `cuentas.moneda text not null default 'COP'`:
  - `check (moneda in ('COP','USD'))`;
  - `cuentas_moneda_check`: `check (moneda = 'COP' or tipo = 'inversion')`. Solo una inversión puede estar en USD.
- `public.naturaleza_de(tipo)`: `inversion` → `'activo'`.
- Política `cuentas_insert_propia`: `with check (usuario_id = auth.uid() and tipo not in (<préstamo>, 'inversion'))`. Una inversión solo nace en `crear_inversion`.
- `impedir_cambio_naturaleza()`: además, si `old.tipo <> new.tipo` y alguno de los dos es `inversion`, lanza `raise exception 'TIPO_DE_INVERSION_FIJO'`.
- Trigger nuevo `impedir_cambio_moneda()`: `before update of moneda on cuentas`. Si cambió, lanza `raise exception 'MONEDA_FIJA'`.
- `asignar_posicion()`, `reordenar_cuentas()` y `cuentas_nombre_unico` no cambian. La inversión es una cuenta visible del grupo activo.
- `movimientos.moneda`: el `check` pasa a `moneda in ('COP','USD')`. Es la moneda de la cuenta de origen, o la del destino en un ingreso. La fija la función, no el cliente.
- `movimientos.monto_destino text`, nullable:
  - con el `check` de formato cifrado de SPEC 05;
  - `movimientos_monto_destino_check`: `check (monto_destino is null or tipo = 'transferencia')`.
  - Va solo cuando las monedas de origen y destino difieren. Está en la moneda del destino. AAD `movimientos|monto_destino|<id>`.
- `movimientos.tasa` no cambia de tipo. Con monedas distintas es la implícita, en COP por US$ 1: `pesos ÷ (centavos ÷ 100)`, con 6 decimales y half-up. La calcula el dominio, porque los montos llegan cifrados. Con la misma moneda es `1`.
- `privado.registrar_movimiento` y `privado.reemplazar_movimiento`, y sus envolturas, se recrean con dos parámetros finales con defecto, `p_monto_destino text default null` y `p_tasa numeric default 1`. Las llamadas de SPEC 07 y SPEC 08 siguen funcionando sin cambios. Además:
  - fijan `moneda` desde las cuentas;
  - si las monedas difieren y `p_monto_destino` es nulo, lanzan `MONTO_DESTINO_REQUERIDO:montoDestino`;
  - si no difieren y viene, lanzan `MONTO_DESTINO_NO_PERMITIDO:montoDestino`;
  - si un `gasto` o un `ingreso` usa una cuenta `inversion`, lanzan `CUENTA_DE_INVERSION:<campo>`.
- `movimientos_detalle` se recrea, porque `m.*` se expande al crearla y no vería `monto_destino`.
- `foto_movimiento` no cambia: `to_jsonb(m)` ya incluye la columna nueva en `movimientos_cambios`.

### Tabla `public.inversion_activos`

Un activo por símbolo dentro de una cuenta.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `cuenta_id` | `uuid` | not null |
| `simbolo` | `text` | not null, `check (simbolo ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$')`. La API lo recorta y lo pasa a mayúsculas. |
| `nombre` | `text` | not null, `check (char_length(btrim(nombre)) between 1 and 80)` |
| `creado_en` | `timestamptz` | not null, default `now()` |

- `unique (usuario_id, cuenta_id, id)` (`inversion_activos_usuario_cuenta_id_key`), para la FK compuesta de las operaciones.
- `unique (cuenta_id, simbolo)` (`inversion_activos_simbolo_unico`).
- FK `(usuario_id, cuenta_id) → cuentas (usuario_id, id) on delete cascade`.
- Índice `inversion_activos_usuario_idx (usuario_id)`.
- RLS: solo `inversion_activos_select_propio`. Los activos nacen en `crear_inversion` o `registrar_operacion`.

### Tabla `public.inversion_operaciones`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK. Lo genera la API, para atar el cifrado (AAD). |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `cuenta_id` | `uuid` | not null |
| `activo_id` | `uuid` | not null |
| `clase` | `text` | not null, `check (clase in ('inicial','compra','venta'))` |
| `cantidad` | `text` | not null, formato cifrado. AAD `inversion_operaciones|cantidad|<id>`. |
| `monto` | `text` | not null, formato cifrado. Total de la operación en la moneda de la cuenta, comisión incluida. AAD `inversion_operaciones|monto|<id>`. |
| `fecha` | `date` | not null |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- FK `(usuario_id, cuenta_id, activo_id) → inversion_activos (usuario_id, cuenta_id, id) on delete restrict`. El activo es del usuario y de esa cuenta.
- FK `(usuario_id, cuenta_id) → cuentas (usuario_id, id) on delete restrict`. Una cuenta con operaciones no se elimina (`CUENTA_CON_MOVIMIENTOS`).
- Índices:
  - `inversion_operaciones_usuario_idx (usuario_id)`;
  - `inversion_operaciones_cuenta_idx (cuenta_id, fecha desc, creado_en desc)`;
  - `inversion_operaciones_activo_idx (usuario_id, cuenta_id, activo_id)`.
- RLS:
  - `inversion_operaciones_select_propia`;
  - `inversion_operaciones_update_propia`, con `using` y `with check` `usuario_id = auth.uid()`;
  - `inversion_operaciones_delete_propia`;
  - sin INSERT: nacen en las funciones.
- Permisos de columna: `revoke update on inversion_operaciones from authenticated` y `grant update (cantidad, monto, fecha) on inversion_operaciones to authenticated`. La clase y el activo quedan fijos.
- Triggers:
  - `marcar_actualizado`;
  - `registrar_cambio_operacion`, `after update or delete`, `security definer` con `set search_path = ''`. Inserta la foto en `inversion_operaciones_cambios`: `edicion` con antes y después si algo cambió, o `eliminacion` con antes.

### Tabla `public.inversion_operaciones_cambios`

Historial de operaciones (RN-13), con la forma de `movimientos_cambios`.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `operacion_id` | `uuid` | not null, **sin FK**: sobrevive a la eliminación |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `operacion` | `text` | not null, `check (operacion in ('edicion','eliminacion'))` |
| `antes` | `jsonb` | not null. Fila completa, con los textos cifrados. |
| `despues` | `jsonb` | nullable |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `inversion_operaciones_cambios_usuario_idx (usuario_id)` e `inversion_operaciones_cambios_operacion_idx (operacion_id)`.
- RLS: solo `inversion_operaciones_cambios_select_propio`.

### Tabla `public.inversion_precios`

Historial de precios por unidad. Solo admite INSERT: cambiar un precio no borra el anterior (N-53).

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `activo_id` | `uuid` | not null |
| `precio_cent` | `bigint` | not null, `check (precio_cent > 0)`. Unidades menores de la moneda de la cuenta. |
| `fecha` | `date` | not null. Día de la cotización en la zona del usuario. |
| `origen` | `text` | not null, default `'manual'`, `check (origen in ('manual'))` |
| `cotizado_en` | `timestamptz` | not null, default `now()` |

- FK `(usuario_id, activo_id) → inversion_activos (usuario_id, id) on delete cascade`. Requiere `unique (usuario_id, id)` en `inversion_activos` (`inversion_activos_usuario_id_key`).
- Índices `inversion_precios_usuario_idx (usuario_id)` e `inversion_precios_activo_idx (activo_id, fecha desc, cotizado_en desc)`.
- RLS:
  - `inversion_precios_select_propio`;
  - `inversion_precios_insert_propio`: `with check (usuario_id = auth.uid())`. La FK compuesta impide el activo ajeno.
  - sin UPDATE ni DELETE.

### Función `crear_inversion`

`privado.crear_inversion(p_cuenta_id uuid, p_nombre text, p_moneda text, p_saldo_inicial text, p_posiciones jsonb) returns uuid`. Es `security definer` con `set search_path = ''` y tiene una envoltura `security invoker` en `public` con la misma firma. Permisos como `registrar_movimiento`.

`p_posiciones` es `[{ operacion_id, activo_id, simbolo, nombre, cantidad, monto, fecha, precio_cent }]`, con `cantidad` y `monto` cifrados.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Si `p_moneda` no es `COP` ni `USD`, lanza `MONEDA_INVALIDA:moneda`.
3. Inserta la cuenta `(p_cuenta_id, usuario, 'inversion', btrim(p_nombre), p_saldo_inicial, p_moneda)`. `asignar_posicion` le da su lugar. Un `23505` sobre `cuentas_nombre_unico` revierte todo.
4. Por cada posición:
   - inserta el activo `(activo_id, cuenta, simbolo, btrim(nombre))`; un símbolo repetido da `23505` sobre `inversion_activos_simbolo_unico`;
   - inserta la operación `inicial`;
   - inserta el precio `(activo_id, precio_cent, fecha, 'manual')`.
5. Devuelve `p_cuenta_id`. Todo en una transacción.

### Función `registrar_operacion`

`privado.registrar_operacion(p_operacion_id uuid, p_cuenta_id uuid, p_activo_id uuid, p_simbolo text, p_nombre text, p_clase text, p_cantidad text, p_monto text, p_fecha date, p_precio_cent bigint) returns uuid`. Mismo esquema de seguridad, envoltura y permisos.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Lee la cuenta del usuario con tipo `inversion`. Si no existe, lanza `INVERSION_NO_ENCONTRADA`. Si está archivada, lanza `CUENTA_ARCHIVADA`.
3. Busca el activo por `(p_cuenta_id, p_simbolo)`:
   - si existe, usa su id e ignora `p_activo_id`, `p_nombre` y `p_precio_cent`;
   - si no existe y la clase es `venta`, lanza `ACTIVO_NO_ENCONTRADO:simbolo`;
   - si no existe y falta `p_nombre`, lanza `NOMBRE_REQUERIDO:nombre`;
   - si no existe, inserta el activo con `p_activo_id` y su primer precio `(p_precio_cent, p_fecha, 'manual')`.
4. Inserta la operación.
5. Devuelve el id del activo.

Las ediciones y eliminaciones de operaciones van por UPDATE y DELETE directos con RLS. El trigger deja el historial. Los precios manuales van por INSERT directo.

### Reglas del dominio (`src/domain/inversion/`)

Fechas `"YYYY-MM-DD"` en la zona del perfil. `hoy` sale de `fechaLocal`.

- **Cantidad en el contrato** (`cantidad.ts`):
  - `^\d{1,10}(\.\d{1,8})?$` y mayor que 0;
  - `"0.0125"` ↔ `1250000n` y `"6.25"` ↔ `625000000n`;
  - al formatear se quitan los ceros finales.
- **Posición de un activo a la fecha F** (`posiciones.ts`): se recorren sus operaciones con fecha ≤ F, por `fecha` y luego por `creadoEn`.
  - `inicial` y `compra`: `cantidad += c` y `costo += monto`.
  - `venta`:
    - `costoVendido = redondear(costo × c ÷ cantidad)`;
    - `gananciaRealizada = monto − costoVendido`;
    - `cantidad −= c` y `costo −= costoVendido`.
    - Es costo promedio ponderado: vender no cambia el costo promedio.
  - `costoPromedio = redondear(costo × 10⁸ ÷ cantidad)`. Es el precio por unidad en unidades menores, solo para mostrar. Es nulo con cantidad 0.
  - Una posición está **abierta** si `cantidad > 0`.
- **Efectivo a la fecha F:** `calcularSaldo` de la cuenta con los movimientos de fecha ≤ F, `− Σ monto de compras + Σ monto de ventas` con fecha ≤ F. Las `inicial` no lo tocan.
- **Saldo en Cuentas sin fecha** (RN-01): igual que SPEC 04, con todos los movimientos y operaciones, también los de fecha futura.
- **Efecto de un movimiento en el saldo** (`domain/cuenta/saldo.ts`): `EfectoMovimiento` gana `montoDestino: bigint | null`. La cuenta de origen recibe `monto` y la de destino `montoDestino ?? monto`. Para las cuentas COP no cambia nada.
- **Precio vigente en F:** el de mayor `fecha ≤ F` y, en empate, el de mayor `cotizadoEn`. Si no hay ninguno ≤ F, el más antiguo. **Precio anterior:** el que sigue al vigente en ese orden, o nulo.
- **Valoración** (`valoracion.ts`):
  - `valor = redondear(cantidad × precio ÷ 10⁸)`;
  - `rendimiento = valor − costo`;
  - `rendimientoPorcentaje = redondear(rendimiento × 10000 ÷ costo)` en centésimas, o nulo si `costo` es 0;
  - `valorMercado = efectivo + Σ valor` de las posiciones abiertas;
  - los totales de la cuenta (`costo`, `rendimiento` y su %) son la suma de las posiciones abiertas, sin el efectivo.
- **A COP** (`aCop(monto, moneda, trmCent)`):
  - en COP, el mismo monto;
  - en USD, `redondear(centavos × trmCent ÷ 10⁴)`;
  - sin TRM, `null`.
  - Ejemplo: 112.480 centavos × 412000 ÷ 10⁴ = 4.634.176 pesos.
- **Tasa implícita** (`domain/movimiento/tasa.ts`): `tasaImplicita(pesos, centavos)` = `pesos × 100 ÷ centavos`, como decimal de 6 cifras, half-up, en string. `8240000` y `200000` dan `"4120.000000"`.
- **Línea de tiempo válida** (`validar.ts`, N-65). Se agrupa por día todo lo que mueve la cuenta (saldo inicial, transferencias y operaciones). Al cierre de cada día:
  - el efectivo corrido es ≥ 0 (`EFECTIVO_INSUFICIENTE`);
  - la cantidad de cada activo es ≥ 0 (`CANTIDAD_INSUFICIENTE`).
  - Se aplica después de simular la escritura, sobre una lectura fresca, en:
    - crear, editar y borrar operaciones;
    - crear, editar y borrar transferencias que tocan la inversión;
    - cambiar el saldo inicial con `PATCH /cuentas/:id`.
- **Orden de las posiciones** (N-34): por la fecha de la primera operación del activo, luego por `creadoEn` y luego por símbolo.

### Patrimonio y revaluación (`src/domain/resumen/`)

- `DatosPatrimonio` gana:
  - `inversiones`: operaciones y precios por cuenta;
  - `trm`: un mapa fecha → `trmCent | null`, que llena `TrmService.enFechas`.
- `patrimonioEn(datos, F)`: una cuenta `inversion` aporta `aCop(valorMercado(F), moneda, trm(F))` en lugar de su saldo. Una inversión USD sin TRM aporta 0 (ver riesgos). Las demás cuentas no cambian.
- **Aportes a la fecha F:** para cada inversión con `creadaEl ≤ F`:
  - `aCop(saldoInicialVigente(F), moneda, trm(creadaEl))`;
  - más `Σ aCop(monto, moneda, trm(op.fecha))` de sus operaciones `inicial` con fecha ≤ F.
- **Flujos del mes:** transferencias con fecha en `(fechaAnterior, fechaCierre]` entre una inversión y una cuenta que no lo es. Se toma el lado COP:
  - hacia la inversión, `+monto`, porque el origen es COP;
  - desde la inversión, `−(montoDestino ?? monto)`.
  - Las transferencias entre dos inversiones son internas y no cuentan.
- **Revaluación del mes:** `[V(cierre) − V(anterior)] − [aportes(cierre) − aportes(anterior)] − flujos`. `V(F)` es la suma del valor COP de las inversiones en F. Incluye la variación de precio, la del dólar y la ganancia realizada.
- `cambioDelMes`: `otrosCambios = cierre − anterior − resultado − revaluacion`. El puente sigue cuadrando.

### `TrmService.enFechas(token, fechas)`

1. Lee de la caché las filas que se cruzan con `[min, max]` y la última anterior a `min`.
2. Para las fechas sin fila que las cubra, hace **una** consulta a la fuente por el rango `[minFaltante, maxFaltante]`: `$where=vigenciahasta >= 'min' AND vigenciadesde <= 'max'&$order=vigenciadesde&$limit=1000`. Guarda todas las filas con `ignoreDuplicates`.
3. Resuelve cada fecha con `resolverTrm` (SPEC 09).
4. Devuelve `Map<fecha, TrmResuelta>`.

- Solo se llama si el usuario tiene al menos una inversión USD.
- `TrmFuente` gana `obtenerRango(desde, hasta)`, con el mismo timeout y la misma regla de falla.

### Validaciones

- **Alta de inversión:**
  - `nombre` de 1 a 60 caracteres tras recortar, sin chocar con otra cuenta activa (`NOMBRE_DUPLICADO`);
  - `moneda` `COP` o `USD` (`MONEDA_INVALIDA`);
  - `efectivoInicial` entero ≥ 0, por defecto `"0"`;
  - `posiciones` como las operaciones `inicial`, sin símbolos repetidos (`ACTIVO_DUPLICADO`).
- **Operación:**
  - `clase` válida (`ENTRADA_INVALIDA`);
  - `simbolo` válido tras recortar y pasar a mayúsculas (`SIMBOLO_INVALIDO`);
  - `nombre` de 1 a 80 caracteres, obligatorio solo si el activo es nuevo;
  - `cantidad` válida y > 0 (`CANTIDAD_INVALIDA`);
  - `monto` entero > 0 (`MONTO_REQUERIDO`, `MONTO_INVALIDO`);
  - `fecha` válida, no futura (`FECHA_FUTURA`), por defecto hoy;
  - línea de tiempo válida (`EFECTIVO_INSUFICIENTE`, `CANTIDAD_INSUFICIENTE`).
  - El primer precio de un activo nuevo es `redondear(monto × 10⁸ ÷ cantidad)`, con la fecha de la operación. Si da 0, `PRECIO_INVALIDO`.
- **Edición de operación:** `cantidad`, `monto` y `fecha` con las mismas reglas, al menos uno (`SIN_CAMBIOS`). La línea de tiempo debe seguir válida.
- **Eliminación de operación:** la línea de tiempo debe seguir válida. Ejemplo: borrar una compra con ventas posteriores da `CANTIDAD_INSUFICIENTE`.
- **Precio manual:** `precio` entero > 0 (`PRECIO_INVALIDO`). La fecha es hoy. El activo es de la inversión (`ACTIVO_NO_ENCONTRADO`). La cuenta no está archivada (`CUENTA_ARCHIVADA`).
- **Movimientos:**
  - una transferencia entre monedas distintas exige `montoDestino` entero > 0 (`MONTO_DESTINO_REQUERIDO`, `MONTO_INVALIDO`);
  - con la misma moneda lo rechaza (`MONTO_DESTINO_NO_PERMITIDO`);
  - un `gasto` o un `ingreso` con una cuenta de inversión da `CUENTA_DE_INVERSION`;
  - una transferencia que deja negativo el efectivo en algún día da `EFECTIVO_INSUFICIENTE`.
- **Otros módulos:**
  - `POST`/`PUT /recurrentes` con una cuenta de inversión: `CUENTA_DE_INVERSION`;
  - `POST /prestamos`, desembolsos y abonos con una inversión como cuenta propia: `CUENTA_DE_INVERSION`;
  - `PATCH /perfil` con una inversión como cuenta predeterminada: `CUENTA_DE_INVERSION`. La captura elige por defecto la primera cuenta activa que no es inversión.
  - `PATCH /cuentas/:id` de una inversión:
    - cambiar `tipo` da `TIPO_DE_INVERSION_FIJO`;
    - `cupo` da `CUPO_NO_PERMITIDO`;
    - bajar `saldoInicial` hasta dejar el efectivo negativo da `EFECTIVO_INSUFICIENTE`.
  - `POST /cuentas` con `tipo: "inversion"`: `TIPO_INVALIDO`, como hoy.
  - Archivar una inversión exige saldo 0: sin efectivo y sin posiciones abiertas (`SALDO_NO_CERO`, SPEC 03).

### Tipos de dominio (`src/domain/inversion/inversion.ts`)

```ts
type Moneda = "COP" | "USD";
type ClaseOperacion = "inicial" | "compra" | "venta";
type Activo = { id: string; cuentaId: string; simbolo: string; nombre: string; creadoEn: Date };
type Operacion = { id: string; activoId: string; clase: ClaseOperacion; cantidad: bigint; monto: bigint; fecha: string; creadoEn: Date; actualizadoEn: Date };
type Precio = { activoId: string; precio: bigint; fecha: string; origen: "manual"; cotizadoEn: Date };
type Posicion = { activo: Activo; cantidad: bigint; costo: bigint; costoPromedio: bigint | null; primeraFecha: string };
type Valoracion = { valor: bigint; rendimiento: bigint; rendimientoPorcentaje: bigint | null };
```

### Contrato HTTP

Convenciones de `docs/api/README.md`.

**Excepción:** en este módulo los porcentajes son enteros en **centésimas** (`1248` = 12,48 %). Pueden ser negativos, y son `null` sin base. Así lo pide el diseño, que muestra dos decimales.

```ts
type Moneda = "COP" | "USD";
type TrmDto = { valor: string; vigenteDesde: string; vigenteHasta: string; fuente: string }; // SPEC 09

type InversionResumenDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  valorMercado: string;                   // en su moneda
  valorMercadoCop: string | null;         // null en COP o sin TRM
  rendimiento: string;
  rendimientoPorcentaje: number | null;   // centésimas
};

type InversionesDto = {
  fechaHoy: string;
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  inversiones: InversionResumenDto[];     // no archivadas, en el orden de Cuentas
};

type PosicionDto = {
  activoId: string;
  simbolo: string;
  nombre: string;
  cantidad: string;                       // "0.0125"
  costo: string;
  costoPromedio: string;                  // por unidad
  precio: string;                         // último, por unidad
  precioFecha: string;
  precioOrigen: "manual";
  precioAnterior: { precio: string; fecha: string } | null;
  valor: string;
  valorCop: string | null;
  rendimiento: string;
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;
};

type InversionDetalleDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  naturaleza: "activo";
  fechaHoy: string;
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  valorMercado: string;                   // efectivo + posiciones
  valorMercadoCop: string | null;
  costo: string;                          // posiciones abiertas
  costoCop: string | null;
  rendimiento: string;
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;
  efectivo: string;
  efectivoCop: string | null;
  posiciones: PosicionDto[];              // solo abiertas
  archivadaEn: string | null;
};

type OperacionDto = {
  id: string;
  activo: { id: string; simbolo: string; nombre: string };
  clase: "inicial" | "compra" | "venta";
  cantidad: string;
  monto: string;
  precioUnitario: string;                 // monto ÷ cantidad, redondeado
  fecha: string;
  gananciaRealizada: string | null;       // solo en venta; puede ser negativa
  creadoEn: string;
  actualizadoEn: string;
};

type PosicionInicialCuerpo = { simbolo: string; nombre: string; cantidad: string; costo: string; fecha?: string };

type InversionCuerpo = {                  // POST /inversiones
  nombre: string;
  moneda: Moneda;
  efectivoInicial?: string;               // default "0"
  posiciones?: PosicionInicialCuerpo[];   // default []
};

type OperacionCuerpo = {                  // POST /inversiones/:id/operaciones
  clase: "inicial" | "compra" | "venta";
  simbolo: string;
  nombre?: string;                        // obligatorio si el activo es nuevo
  cantidad: string;
  monto: string;                          // total, comisión incluida
  fecha?: string;                         // default hoy
};

type OperacionCambio = { cantidad?: string; monto?: string; fecha?: string };
type PrecioCuerpo = { precio: string };
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /inversiones` | — | `200 InversionesDto` |
| `POST /inversiones` | `InversionCuerpo` | `201 InversionDetalleDto` |
| `GET /inversiones/:id` | — | `200 InversionDetalleDto` |
| `GET /inversiones/:id/operaciones` | `?activoId=` (opcional) | `200 { operaciones: OperacionDto[] }` |
| `POST /inversiones/:id/operaciones` | `OperacionCuerpo` | `201 InversionDetalleDto` |
| `PUT /inversiones/:id/operaciones/:operacionId` | `OperacionCambio` | `200 InversionDetalleDto` |
| `DELETE /inversiones/:id/operaciones/:operacionId` | — | `204` |
| `POST /inversiones/:id/activos/:activoId/precios` | `PrecioCuerpo` | `201 InversionDetalleDto` |

- `GET /inversiones/:id` también responde con una inversión archivada.
- `operaciones` va por `fecha` desc y luego por `creado_en` desc.
- El texto relativo «hace 4 días» lo arma el cliente con `precioFecha` y `fechaHoy`.
- La vista previa del precio manual (N-29) la calcula el cliente con `cantidad` y `trm`.
- En una inversión COP, todo campo `…Cop` es `null`: el monto ya está en pesos.
- El fondeo y el retiro son `POST /movimientos` (transferencia con `montoDestino`). Corregirlos es `PUT`/`DELETE /movimientos/:id`.

### Cambios en contratos existentes

- `POST`/`PUT /movimientos`: cuerpo con `montoDestino?: string`.
- `MovimientoDto`:
  - `moneda: "COP" | "USD"` (la del origen, o la del destino en un ingreso);
  - `montoDestino: string | null`;
  - `tasa`: la implícita, o `"1"`.
- `GET /cuentas` (`ListaCuentasDto`):
  - `CuentaDto` gana `moneda: Moneda` (`"COP"` en las demás) e `inversion: { efectivo: string; valorMercado: string; tasa: string | null } | null`;
  - en una inversión:
    - `saldo` es el valor de mercado en COP (`"0"` si es USD y no hay TRM);
    - `saldoInicial` es el efectivo inicial en su moneda;
    - `tarjeta` es `null`;
  - `activos.total` y `patrimonioNeto` incluyen las inversiones a valor de mercado;
  - la lista gana `trm: TrmDto | null` y `trmDesactualizada: boolean` (N-74).
- `GET /cuentas/archivadas`, `PATCH /cuentas/:id`, `archivar` y `restaurar` devuelven `CuentaDto` con los mismos campos.
- `GET /resumen`:
  - `patrimonio` y su serie valoran las inversiones a mercado;
  - `cambioDelMes` gana `revaluacion: string`, que puede ser negativa;
  - `otrosCambios` la excluye.
- `POST`/`PUT /recurrentes`, `POST /prestamos`, `POST /prestamos/:id/desembolsos`, `POST /prestamos/:id/abonos` y `PATCH /perfil`: el error `CUENTA_DE_INVERSION`.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `INVERSION_NO_ENCONTRADA` | 404 | — | «La cuenta de inversión no existe.» |
| `ACTIVO_NO_ENCONTRADO` | 404 | `simbolo` | «No tienes ese activo en esta cuenta.» |
| `OPERACION_NO_ENCONTRADA` | 404 | — | «La operación no existe.» |
| `MONEDA_INVALIDA` | 400 | `moneda` | «Elige COP o USD.» |
| `SIMBOLO_INVALIDO` | 400 | `simbolo` | «Escribe el símbolo del activo, hasta 12 letras o números.» |
| `CANTIDAD_INVALIDA` | 400 | `cantidad` | «Escribe una cantidad mayor que cero, con hasta 8 decimales.» |
| `PRECIO_INVALIDO` | 400 | `precio` | «Escribe un precio mayor que cero.» |
| `FECHA_FUTURA` | 400 | `fecha` | «La fecha no puede ser futura.» |
| `ACTIVO_DUPLICADO` | 400 | `posiciones` | «Ese activo ya está en la lista.» |
| `EFECTIVO_INSUFICIENTE` | 422 | — | «No hay efectivo suficiente en la cuenta. Registra primero el fondeo.» |
| `CANTIDAD_INSUFICIENTE` | 422 | `cantidad` | «No tienes esa cantidad del activo en esa fecha.» |
| `MONTO_DESTINO_REQUERIDO` | 400 | `montoDestino` | «Escribe cuánto llegó a la cuenta de destino.» |
| `MONTO_DESTINO_NO_PERMITIDO` | 400 | `montoDestino` | «Las dos cuentas usan la misma moneda: basta un monto.» |
| `CUENTA_DE_INVERSION` | 422 | el de la cuenta | «Esa cuenta es de inversión: solo admite transferencias y se maneja desde Inversiones.» |
| `TIPO_DE_INVERSION_FIJO` | 422 | `tipo` | «Una cuenta de inversión no cambia de tipo.» |
| `MONEDA_FIJA` | 422 | `moneda` | «La moneda de una cuenta no cambia.» |

Se reutilizan:

- `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `NOMBRE_DUPLICADO`, `MONTO_REQUERIDO`, `MONTO_INVALIDO`;
- `FECHA_INVALIDA`, `SIN_CAMBIOS`, `CUENTA_ARCHIVADA`, `CUENTA_CON_MOVIMIENTOS`, `SALDO_NO_CERO`, `CUPO_NO_PERMITIDO`, `TIPO_INVALIDO`;
- `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

Traducciones en los repositorios:

- `<CODIGO>[:<campo>]` lanzado por las funciones o los triggers → su código y campo.
- `23505` sobre `cuentas_nombre_unico` → `NOMBRE_DUPLICADO`.
- `23505` sobre `inversion_activos_simbolo_unico` → `ACTIVO_DUPLICADO`.
- `23503` sobre las FK de `inversion_operaciones` a `cuentas` → `CUENTA_CON_MOVIMIENTOS`.
- Fila no visible por RLS → `INVERSION_NO_ENCONTRADA`, `OPERACION_NO_ENCONTRADA` o `ACTIVO_NO_ENCONTRADO`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_inversiones.sql
src/
  app.module.ts                          # + InversionesModule
  comun/error-api.ts                     # + códigos nuevos
  inversiones/
    inversiones.controller.ts
    inversiones.service.ts
    inversiones.module.ts                # importa TrmModule
    esquemas.ts                          # Zod: cuerpos, :id, :operacionId, :activoId, ?activoId
    dto.ts
  trm/trm.service.ts                     # + enFechas
  cuentas/cuentas.service.ts, dto.ts     # inversiones en activos, moneda, trm, EFECTIVO_INSUFICIENTE, TIPO_DE_INVERSION_FIJO
  movimientos/movimientos.service.ts, esquemas.ts, dto.ts  # montoDestino, tasa, CUENTA_DE_INVERSION, EFECTIVO_INSUFICIENTE
  recurrentes/recurrentes.service.ts     # CUENTA_DE_INVERSION
  prestamos/prestamos.service.ts         # CUENTA_DE_INVERSION
  perfil/perfil.service.ts               # CUENTA_DE_INVERSION
  captura/captura.service.ts             # predeterminada sin inversiones
  resumen/resumen.service.ts, dto.ts     # valoración y revaluacion
  domain/
    cuenta/cuenta.ts, naturaleza.ts      # tipo inversion, moneda
    cuenta/saldo.ts (+ .test.ts)         # montoDestino en el destino
    movimiento/tasa.ts (+ .test.ts)      # tasaImplicita
    movimiento/movimiento.ts, validar.ts # moneda, montoDestino
    inversion/
      inversion.ts                       # tipos y constantes
      cantidad.ts (+ .test.ts)
      posiciones.ts (+ .test.ts)         # posición a F, costo prom., ganancia realizada, efectivo
      valoracion.ts (+ .test.ts)         # precio vigente, valor, rendimiento, %, aCop
      validar.ts (+ .test.ts)            # cuerpos y línea de tiempo
    resumen/resumen.ts, patrimonio.ts (+ .test.ts)  # inversiones, aportes, flujos, revaluación
  repositories/
    datos-gov/trm.fuente.ts              # + obtenerRango
    supabase/
      inversiones.repository.ts          # cifra/descifra, rpc crear_inversion y registrar_operacion
      trm.repository.ts                  # + filas en rango
      cuentas.repository.ts, movimientos.repository.ts, resumen.repository.ts  # moneda, monto_destino, tipo inversion
      tipos.ts                           # regenerado
    cifrado/montos.ts                    # + contextos monto_destino, operación cantidad y monto
test/
  aislamiento.e2e-spec.ts                # ampliado (no se borra ni se desactiva)
  inversiones.e2e-spec.ts
docs/api/
  inversiones.md, README.md, cuentas.md, movimientos.md, resumen.md, recurrentes.md, prestamos.md, perfil.md, captura.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_inversiones.sql` según el modelo. **El autor la revisa antes del paso 2** (REGLAS §8).
2. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`. Las e2e existentes siguen en verde: los parámetros nuevos tienen defecto.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con una inversión con una posición, una operación editada y un precio, el otro:
   - no ve activos, operaciones, historial ni precios ajenos;
   - recibe `INVERSION_NO_ENCONTRADA` al llamar a `registrar_operacion` sobre la cuenta ajena;
   - no consigue insertar un precio sobre un activo ajeno (falla la FK);
   - afecta 0 filas al hacer UPDATE o DELETE de una operación ajena.
   - Además:
     - un INSERT directo en `cuentas` con tipo `inversion` falla por RLS;
     - un UPDATE de `clase` o `activo_id` falla por permisos;
     - un UPDATE de `moneda` lanza `MONEDA_FIJA`;
     - UPDATE y DELETE de precios afectan 0 filas.
   - `npm test` en verde.
4. `domain/inversion/inversion.ts` y `cantidad.ts` con pruebas:
   - `"0.0125"`↔`1250000n`, `"6.25"`↔`625000000n` y `"1"`↔`100000000n`;
   - `"0"`, `"-1"`, `"1.123456789"`, `"1,5"` y `""` son inválidas.
5. `domain/cuenta/saldo.ts` con `montoDestino` y `domain/movimiento/tasa.ts`, con pruebas:
   - el destino suma `montoDestino` y el origen resta `monto`;
   - `tasaImplicita(8240000n, 200000n)` → `"4120.000000"`;
   - `tasaImplicita(1000000n, 24000n)` → `"4166.666667"`.
6. `posiciones.ts` con pruebas: inicial, compras, venta parcial con costo promedio y ganancia realizada, venta total que cierra la posición, posición a una fecha pasada y efectivo con compras y ventas.
7. `valoracion.ts` con pruebas:
   - precio vigente y anterior, con empates por `cotizadoEn` y fecha previa al primer precio;
   - el ejemplo VOO del diseño: 6,25 × 562,40 = 3.515,00 → `351500n`;
   - BTC: 0,0125 × 71.400,00 → `89250n`;
   - `%` con costo 0 → `null`;
   - `aCop` con redondeo de negativos.
8. `validar.ts` con pruebas: cada código de validación, y la línea de tiempo con efectivo negativo un día intermedio, venta antes de la compra y borrado de compra con venta posterior.
9. `domain/resumen/patrimonio.ts` con pruebas: inversión USD en el patrimonio con TRM por fecha, aportes, flujos y una revaluación que cuadra con el ejemplo de los criterios.
10. Agregar los códigos a `error-api.ts` y los contextos de cifrado. Ampliar los tipos de cuenta y movimiento del dominio. Los repositorios de cuentas, movimientos y resumen leen `moneda` y `monto_destino` y aceptan el tipo `inversion`. Las e2e existentes siguen en verde.
11. `TrmFuente.obtenerRango`, `TrmRepository` en rango y `TrmService.enFechas`, con pruebas de `aTrm` sobre varias filas.
12. `POST`/`PUT /movimientos` con `montoDestino`, la tasa implícita, `CUENTA_DE_INVERSION` y `EFECTIVO_INSUFICIENTE`. `MovimientoDto` con `moneda` y `montoDestino`.
13. `inversiones.repository.ts`: lecturas de activos, operaciones y precios, descifrado con la AAD de cada fila, `rpc` a `crear_inversion` y `registrar_operacion`, UPDATE y DELETE de operaciones, INSERT de precios y traducción de errores.
14. `src/inversiones/` con `GET /inversiones`, `GET /inversiones/:id` y `POST /inversiones`.
15. Operaciones: `GET`, `POST`, `PUT` y `DELETE`, con la línea de tiempo validada sobre una lectura fresca.
16. `POST /inversiones/:id/activos/:activoId/precios`.
17. `GET /cuentas` con inversiones a mercado, `moneda`, `inversion` y `trm`. `PATCH /cuentas/:id` con `TIPO_DE_INVERSION_FIJO` y `EFECTIVO_INSUFICIENTE`.
18. `GET /resumen` con valoración a mercado y `revaluacion`.
19. Guardas `CUENTA_DE_INVERSION` en recurrentes, préstamos y perfil. La captura excluye las inversiones de la cuenta predeterminada.
20. `test/inversiones.e2e-spec.ts` con los criterios de aceptación. Se omite con aviso si falta `SUPABASE_SECRET_KEY`.
21. `docs/api/`:
    - crear `inversiones.md`;
    - `cuentas.md`: `moneda`, `inversion`, `trm` y saldo a mercado;
    - `movimientos.md`: `montoDestino`, `moneda`, `tasa` y los errores nuevos;
    - `resumen.md`: inversiones en el patrimonio y `revaluacion`;
    - `recurrentes.md`, `prestamos.md` y `perfil.md`: `CUENTA_DE_INVERSION`;
    - `captura.md`: predeterminada sin inversiones;
    - agregar la fila en `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | SPEC 09 (`GET /trm`). |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04. |
| N-05 | `InversionDetalleDto.nombre`. |
| N-06 | `moneda` y `naturaleza`. |
| N-07 | `InversionDetalleDto.trm` (SPEC 09); el cliente la muestra solo si `moneda` es `"USD"`. |
| N-08 | `valorMercado` (efectivo + posiciones, calculado). |
| N-09 | `valorMercadoCop`. |
| N-10 | `costo`. |
| N-11 | `costoCop`. |
| N-12 | `rendimiento` (no realizado). |
| N-13 | `rendimientoPorcentaje` (centésimas). |
| N-14 | `rendimientoCop`, con la TRM de hoy. |
| N-15 | `PosicionDto.simbolo`. |
| N-16 | `PosicionDto.nombre`. |
| N-17 | `PosicionDto.cantidad` (hasta 8 decimales). |
| N-18 | `costoPromedio` (derivado, costo promedio ponderado). |
| N-19 | `precio` (precio vigente). |
| N-20 | `valor` y `valorCop`. |
| N-21 | `rendimiento` y `rendimientoCop`. |
| N-22 | `rendimientoPorcentaje`. |
| N-23 | `precioFecha`. Cierre o intradía con hora: SPEC 11. |
| N-24 | `precioOrigen: "manual"`. |
| N-25 | `precioFecha` y `fechaHoy`; el texto es del cliente. |
| N-26 | `activoId` → `POST /inversiones/:id/activos/:activoId/precios`. |
| N-27 | `POST …/precios`, con la fecha de hoy. |
| N-28 | `PRECIO_INVALIDO`. |
| N-29 | Cliente, con `cantidad` y `trm`. |
| N-30 | `efectivo` y `efectivoCop` (calculado, RN-01). |
| N-31 | `fechaHoy`: el efectivo se calcula a hoy (ver choques del inventario). |
| N-32 | `valorMercado`, `rendimiento` y `rendimientoPorcentaje` del detalle. |
| N-33 | SPEC 11 (clase de activo y precio automático). |
| N-34 | Orden de `posiciones` (dominio). |
| N-35 | Igual que N-26. |
| N-36 | `precioAnterior`. |
| N-37 | `GET /inversiones` → `inversiones: []`. |
| N-38 | SPEC 09. `GET /inversiones` también trae `trm`. |
| N-39 | `POST /inversiones`. |
| N-40 | `InversionCuerpo.nombre` y `moneda`. |
| N-41 | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `NOMBRE_DUPLICADO` y `MONEDA_INVALIDA`. |
| N-42 | `InversionCuerpo.efectivoInicial` → `cuentas.saldo_inicial`. |
| N-43 | `InversionCuerpo.posiciones` y `OperacionCuerpo.clase: "inicial"` (no mueve efectivo). |
| N-44 | `PATCH /cuentas/:id` (SPEC 03). |
| N-45 | `POST /cuentas/:id/archivar` (SPEC 03), con `SALDO_NO_CERO`. |
| N-46 | `GET /inversiones` → `inversiones[]` con `id`. |
| N-47 | `GET /inversiones/:id` con `posiciones: []` y `efectivo` `"0"`. |
| N-48 | SPEC 11. En SPEC 10, todo activo nace manual. |
| N-49 | `NOMBRE_REQUERIDO` para un activo nuevo. El primer precio es el costo unitario de la operación. |
| N-50 | SPEC 11. |
| N-51 | SPEC 09. |
| N-52 | Parte TRM: SPEC 09. Parte precios: SPEC 11. |
| N-53 | `inversion_precios` solo admite INSERT. |
| N-54 | Precio vigente en F (dominio) y `TrmService.enFechas`. |
| N-55 | `moneda: "COP"`: los campos `…Cop` en `null`. |
| N-56 | `POST …/operaciones` con `clase: "compra"`. |
| N-57 | `CANTIDAD_INVALIDA`, `MONTO_INVALIDO`, `FECHA_INVALIDA`, `FECHA_FUTURA` y `EFECTIVO_INSUFICIENTE`. |
| N-58 | `POST …/operaciones` con `clase: "venta"`. |
| N-59 | `CANTIDAD_INSUFICIENTE`. |
| N-60 | `OperacionDto.gananciaRealizada`. No entra al resultado del resumen. |
| N-61 | `posiciones` solo trae las abiertas. Las cerradas siguen en `GET …/operaciones`. |
| N-62 | `domain/inversion/posiciones.ts`. |
| N-63 | `GET /inversiones/:id/operaciones?activoId=`. |
| N-64 | `PUT`/`DELETE …/operaciones/:operacionId` con `inversion_operaciones_cambios`. Saldo inicial: `cuentas_cambios` (SPEC 03). |
| N-65 | Línea de tiempo (`EFECTIVO_INSUFICIENTE`, `CANTIDAD_INSUFICIENTE`) en operaciones, movimientos y `PATCH /cuentas/:id`. |
| N-66 | `POST /movimientos` transferencia con `montoDestino`. |
| N-67 | `movimientos.tasa` = `tasaImplicita`, congelada. |
| N-68 | Transferencia desde la inversión USD hacia una cuenta COP, con `montoDestino`. |
| N-69 | `MONTO_DESTINO_REQUERIDO`, `MONTO_INVALIDO` y `CUENTAS_IGUALES` (SPEC 04). |
| N-70 | `MovimientoDto.moneda`, `montoDestino` y `tasa`; el equivalente COP es el lado COP. |
| N-71 | `GET /cuentas` → la inversión en `activos`, con `saldo` en COP, `moneda` e `inversion`. |
| N-72 | `patrimonioNeto` y `GET /resumen` → `patrimonio`, a valor de mercado. |
| N-73 | `cambioDelMes.revaluacion`. |
| N-74 | `ListaCuentasDto.trm` (SPEC 09). |
| N-75 | Las operaciones no son movimientos. Las transferencias no son ingreso ni gasto (RN-05, RN-06): el resultado del resumen no cambia. |
| N-76 | Fuera de alcance: dividendos (duda resuelta en el inventario). |
| N-77 | Fuera de alcance: `CUENTA_DE_INVERSION` impide gastos e ingresos; solo las inversiones pueden ser USD. |
| N-78 | Fuera de alcance: la comisión va dentro de `monto`. |

Endpoint → N-xx:

- `GET /inversiones`: N-37, N-46.
- `POST /inversiones`: N-39, N-40, N-42, N-43.
- `GET /inversiones/:id`: N-05 – N-32, N-34, N-36, N-47.
- `GET /inversiones/:id/operaciones`: N-63.
- `POST /inversiones/:id/operaciones`: N-43, N-56, N-58.
- `PUT`/`DELETE /inversiones/:id/operaciones/:operacionId`: N-64.
- `POST /inversiones/:id/activos/:activoId/precios`: N-26, N-27, N-35.
- Cambios en `POST`/`PUT /movimientos`: N-66 – N-70.
- Cambios en `GET /cuentas`: N-71, N-72, N-74.
- Cambios en `GET /resumen`: N-72, N-73.
- Guardas `CUENTA_DE_INVERSION`: N-77 y RN-06. Inversiones en préstamos, recurrentes y perfil: coherencia del tipo, sin N-xx propia (como `CUENTA_DE_PRESTAMO` en SPEC 08).

## Criterios de aceptación

`H` es hoy en la zona del perfil. La TRM falsa vale `"4120"` en todas las fechas. Bancolombia es una cuenta banco con saldo inicial `"10000000"`. Todo ocurre en `H`, salvo que se indique otra cosa.

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre las tablas ni las funciones nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3.
- [ ] Las e2e de cuentas, movimientos, captura, resumen, recurrentes y préstamos siguen en verde.
- [ ] `GET /inversiones` sin inversiones → `200` con `inversiones: []` y `trm.valor` `"4120.00"`.
- [ ] `POST /inversiones { nombre: "eToro", moneda: "USD" }` → `201` con `efectivo` `"0"`, `posiciones: []` y `naturaleza: "activo"`. eToro aparece en `GET /cuentas` → `activos`, con `moneda: "USD"` y `saldo` `"0"`.
- [ ] `POST /cuentas { tipo: "inversion" }` → `400 TIPO_INVALIDO`.
- [ ] `POST /movimientos` transferencia de Bancolombia a eToro, `monto: "8240000"`, sin `montoDestino` → `400 MONTO_DESTINO_REQUERIDO`.
- [ ] La misma con `montoDestino: "200000"`:
  - responde `201` con `moneda: "COP"`, `montoDestino` `"200000"` y `tasa` igual a 4120;
  - Bancolombia queda en `"1760000"`;
  - el efectivo de eToro es `"200000"`;
  - `patrimonioNeto` sigue en `"10000000"`.
- [ ] Una transferencia entre dos cuentas COP con `montoDestino` → `400 MONTO_DESTINO_NO_PERMITIDO`.
- [ ] Un `gasto` con origen eToro → `422 CUENTA_DE_INVERSION`.
- [ ] `POST /inversiones/:id/operaciones { clase: "compra", simbolo: "voo", nombre: "Vanguard S&P 500 ETF", cantidad: "2", monto: "100000" }` → `201` con:
  - `efectivo` `"100000"`;
  - la posición VOO con `cantidad` `"2"`, `costo` `"100000"`, `costoPromedio` `"50000"`, `precio` `"50000"` (primer precio), `precioOrigen: "manual"` y `rendimiento` `"0"`.
- [ ] Una compra con `monto: "150000"` → `422 EFECTIVO_INSUFICIENTE`, sin crear nada.
- [ ] `POST …/activos/:vooId/precios { precio: "56240" }` → VOO con:
  - `valor` `"112480"`, `rendimiento` `"12480"` y `rendimientoPorcentaje` `1248`;
  - `valorCop` `"4634176"`;
  - `precioAnterior` `{ precio: "50000", fecha: H }`.
  - `valorMercado` es `"212480"` y `valorMercadoCop` `"8754176"`.
- [ ] Una venta de VOO `cantidad: "1"`, `monto: "56000"`:
  - deja `cantidad` `"1"`, `costo` `"50000"` y `costoPromedio` `"50000"`;
  - `efectivo` pasa a `"156000"`;
  - `GET …/operaciones` trae la venta con `gananciaRealizada` `"6000"`.
- [ ] Una venta de `cantidad: "2"` → `422 CANTIDAD_INSUFICIENTE`. Una de un símbolo inexistente → `404 ACTIVO_NO_ENCONTRADO`.
- [ ] `GET /resumen` del mes:
  - `cambioDelMes.revaluacion` es `"504288"`: (US$ 60,00 realizados + US$ 62,40 no realizados) × 4.120;
  - `resultado` no incluye compras, ventas ni el fondeo;
  - el puente cuadra: `anterior + resultado + revaluacion + otrosCambios = cierre`.
- [ ] `GET /cuentas` → eToro con `saldo` `"8744288"` (212.240 centavos × 41,2), `inversion.efectivo` `"156000"` e `inversion.valorMercado` `"212240"`. `patrimonioNeto` es `"10504288"` y la lista trae `trm`.
- [ ] `DELETE /movimientos/:id` del fondeo → `422 EFECTIVO_INSUFICIENTE`.
- [ ] Una transferencia de retiro de eToro a Bancolombia con `monto: "200000"` y `montoDestino: "824000"` → `422 EFECTIVO_INSUFICIENTE`. Con `monto: "100000"` y `montoDestino: "412000"` → `201` y efectivo `"56000"`.
- [ ] `PUT …/operaciones/:compraId { monto: "90000" }` → `200` con `costo` de VOO en `"45000"`, y deja una fila `edicion` en `inversion_operaciones_cambios`. `PUT { }` → `400 SIN_CAMBIOS`.
- [ ] `DELETE …/operaciones/:compraId` con la venta viva → `422 CANTIDAD_INSUFICIENTE`. `DELETE` de la venta → `204` con una fila `eliminacion`.
- [ ] `POST /inversiones` con `moneda: "COP"`, `efectivoInicial: "1000000"` y una posición inicial `{ simbolo: "ECOPETROL", nombre: "Ecopetrol", cantidad: "100", costo: "250000" }`:
  - el efectivo queda en `"1000000"` (la inicial no lo toca);
  - `valorMercado` es `"1250000"` y `valorMercadoCop` `null`;
  - en `GET /cuentas`, `saldo` es `"1250000"`.
- [ ] `POST /inversiones` con dos posiciones `"VOO"` → `400 ACTIVO_DUPLICADO`. `moneda: "EUR"` → `400 MONEDA_INVALIDA`.
- [ ] `cantidad: "0.000000001"` → `400 CANTIDAD_INVALIDA`. `simbolo: "con espacios"` → `400 SIMBOLO_INVALIDO`. `fecha: H+1` → `400 FECHA_FUTURA`. `precio: "0"` → `400 PRECIO_INVALIDO`.
- [ ] `PATCH /cuentas/:etoroId { tipo: "banco" }` → `422 TIPO_DE_INVERSION_FIJO`.
- [ ] `POST /cuentas/:etoroId/archivar` con efectivo o posiciones → `409 SALDO_NO_CERO`.
- [ ] `POST /recurrentes`, `POST /prestamos` y `PATCH /perfil` con eToro → `422 CUENTA_DE_INVERSION`.
- [ ] Con la fuente de TRM fallando y sin caché, `GET /inversiones/:id` de eToro → `200` con `trm: null` y los campos `…Cop` en `null`. En `GET /cuentas`, eToro tiene `saldo` `"0"` e `inversion.tasa` `null`.
- [ ] `GET /resumen` hace a lo sumo una consulta a la fuente de TRM, aunque necesite varias fechas.
- [ ] Un id ajeno en cualquier ruta `/inversiones/:id…` → `404 INVERSION_NO_ENCONTRADA`.
- [ ] En la BD, `inversion_operaciones.cantidad`, `inversion_operaciones.monto` y `movimientos.monto_destino` cumplen `^v1\.`. `inversion_precios.precio_cent` es un número.
- [ ] Ninguna ruta devuelve texto de Postgres en `mensaje`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún monto, cantidad, precio, tasa ni porcentaje pasa por `number` en un cálculo.
- [ ] `docs/api/inversiones.md` existe y `README.md` lo enlaza.

## Decisiones

- **Sí:** una inversión es una cuenta de tipo `inversion` con `cuentas.moneda`. Saldo, patrimonio, nombre, archivo y orden reutilizan SPEC 03 y SPEC 06. **No:** una tabla propia, porque reescribe saldo, patrimonio y transferencias.
- **Sí:** activos, operaciones y precios guardados, y posiciones derivadas (RN-01). **No:** guardar cantidad y costo promedio, que es un saldo guardado con otro nombre.
- **Sí:** la operación `inicial` registra lo que ya se tenía sin mover efectivo, como un saldo inicial. **No:** obligar a fondear y comprar lo que se tenía antes de usar Tino.
- **Sí:** comprar y vender son operaciones internas, no movimientos (RN-06). **No:** transferencias hacia subcuentas por activo, porque multiplica cuentas sin aportar nada.
- **Sí:** cantidad en 10⁻⁸ cifrada, montos en unidades menores cifrados y precio en unidades menores sin cifrar. **No:** precios con decimales de centavo, porque no los pide ningún activo del autor. **No:** cifrar el precio, porque es un dato de mercado.
- **Sí:** el monto de la operación es el total real, con la comisión incluida. El precio unitario se deriva.
- **Sí:** el primer precio de un activo nuevo es el costo unitario de su operación. **No:** un campo de precio obligatorio, porque frena la captura.
- **Sí:** costo promedio ponderado para el costo vendido y la ganancia realizada. Es el «Costo prom.» del diseño. **No:** FIFO.
- **Sí:** la ganancia realizada no es ingreso: queda en el efectivo y va a `revaluacion`. **No:** ingreso o gasto con categoría reservada.
- **Sí:** `movimientos.monto_destino` y la tasa implícita para el fondeo entre monedas. La función fija `moneda` desde las cuentas. **No:** dos movimientos enlazados, que rompen RN-03 y RN-05. **No:** derivar el segundo monto de la tasa, que se redondea.
- **Sí:** el fondeo y el retiro van por `POST /movimientos`. **No:** un endpoint propio, que duplicaría la escritura de transferencias.
- **Sí:** `p_monto_destino` y `p_tasa` con defecto en `registrar_movimiento` y `reemplazar_movimiento`. Las llamadas de recurrentes y préstamos no cambian.
- **Sí:** una inversión solo admite transferencias (`CUENTA_DE_INVERSION`). Se valida en la función, porque es compartida y la guarda es barata. **No:** gastos o ingresos en una inversión COP.
- **Sí:** las inversiones quedan fuera de recurrentes, préstamos y la cuenta predeterminada.
- **Sí:** efectivo y cantidades no negativos en ningún día. Se valida en el dominio sobre una lectura fresca, porque los montos están cifrados. **No:** un trigger, porque no puede leer montos.
- **Sí:** operaciones editables en cantidad, monto y fecha, con historial por trigger (RN-13). La clase y el activo quedan fijos por permisos de columna. **No:** editar la clase o el activo.
- **Sí:** los precios solo admiten INSERT, con `fecha` y `cotizado_en`. El historial habilita `precioAnterior` y el patrimonio histórico.
- **Sí:** `crear_inversion` y `registrar_operacion` como funciones `security definer` atómicas, como en SPEC 08. **No:** varias llamadas desde la API.
- **Sí:** en Cuentas, la inversión va en `activos` con `saldo` a valor de mercado en COP y un bloque `inversion`. **No:** un campo aparte como `prestamos`, que dejaría Cuentas N-20 sin cubrir.
- **Sí:** la revaluación es Δ valor − Δ aportes − flujos, y absorbe precio, cambio del dólar y lo realizado. **No:** separar precio y cambio, que es más complejo y no cuadra solo.
- **Sí:** `TrmService.enFechas` con a lo sumo una consulta a la fuente por petición.
- **Sí:** porcentajes en centésimas en este módulo, porque el diseño muestra dos decimales. Es una excepción documentada, como las décimas del resumen.
- **Sí:** un solo spec, aunque toca cuentas, movimientos y resumen. Esos cambios son la mitad del objetivo: sin ellos la inversión no suma al patrimonio. **No:** separar la revaluación, porque sin ella el puente mostraría la revaluación como `otrosCambios`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar la firma de `registrar_movimiento` rompe a quien la llama | Los parámetros nuevos van al final y con defecto. Las e2e de recurrentes y préstamos corren en el paso 2. |
| `movimientos_detalle` no ve `monto_destino` | Se recrea en la migración. Una e2e lee `montoDestino`. |
| Sin TRM nunca obtenida, una inversión USD vale 0 en el patrimonio | Solo pasa si la fuente nunca respondió para ese usuario. `inversion.tasa: null` y los `…Cop` en `null` lo hacen visible. En cuanto haya TRM se recalcula. |
| `GET /cuentas` y `GET /resumen` leen más (operaciones, precios, TRM) | Solo cuando hay inversiones. Columnas justas, en paralelo, y la TRM en una consulta. A escala personal sobra. |
| Validación de la línea de tiempo con escrituras simultáneas | Igual que en SPEC 08: lectura fresca antes de escribir. Una carrera solo afecta los datos propios, y la siguiente lectura la muestra. |
| Un cliente llama a `registrar_movimiento` por PostgREST y se salta `EFECTIVO_INSUFICIENTE` | Solo afecta sus propios datos (RN-12 intacta). El dominio tolera un efectivo negativo al leer. |
| Redondeo del costo vendido en ventas sucesivas | Se descuenta del costo total de forma proporcional y se redondea por operación. El costo restante siempre cuadra con la suma de operaciones. |
| El precio unitario derivado de un monto pequeño redondea a 0 | `PRECIO_INVALIDO` al crear el activo. Para corregir, el precio manual. |
| Revaluación con aportes valorados a la TRM de su fecha | Aproximación documentada. Su efecto cambiario posterior cae en la revaluación, que es lo esperado. |

## Lo que **no** entra en este spec

- Precios automáticos, clase de activo y precio de cierre o intradía (SPEC 11).
- Dividendos.
- Gastos e ingresos en USD, y cuentas USD que no sean de inversión.
- Comisión como campo aparte.
- Recurrentes sobre inversiones.
- Editar o eliminar activos, o cambiar la clase o el activo de una operación.
- Precios con fracciones de centavo.
- Consulta del historial de operaciones.

Cada uno, si llega, va en su propio spec.
