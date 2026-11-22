# SPEC 11 — Precios automáticos de inversiones

> **Estado:** Implementado
> **Depende de:** SPEC 09, SPEC 10
> **Fecha:** 2026-11-22
> **Objetivo:** Que la API traiga sola de Twelve Data el precio de los activos que el proveedor cubre (cierre en acciones y ETF, intradía en cripto), lo guarde en la caché de precios del usuario y complete los cierres pasados que pide el patrimonio, con el precio manual como modo de respaldo.

## Por qué existe este spec

Es el tercero de los tres specs del inventario `specs/necesidades/inversiones.md`. SPEC 09 trajo la TRM y SPEC 10 las cuentas de inversión con precio manual. Este agrega el precio automático.

Reutiliza los dos patrones de SPEC 09 y suma dos:

- **Datos externos bajo demanda, en caché por usuario** (SPEC 09). Los precios se piden al leer, solo si están vencidos, y se guardan en `inversion_precios` con el token del usuario. Ningún job ni `service_role` (REGLAS §4).
- **La fuente externa es un repositorio inyectable** (SPEC 09). `src/repositories/twelve-data/` es el único lugar que conoce Twelve Data.
- **Cada activo tiene un modo de cotización.** Un activo es `automatica` o `manual`. Es automático solo si el proveedor lo encuentra en la moneda de la cuenta. El usuario puede pasarlo a manual si el proveedor confundió el símbolo, y volverlo automático si lo cubre. El precio manual solo se registra en activos manuales.
- **Una fila de intradía por activo y día.** El intradía de hoy se reemplaza en su sitio. Los cierres y los precios manuales siguen siendo solo INSERT (N-53).

Cubre el resto del inventario `specs/necesidades/inversiones.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con:
  - las columnas `cotizacion`, `clase`, `simbolo_fuente` y `consultado_en` en `inversion_activos`;
  - los orígenes `cierre` e `intradia` en `inversion_precios`;
  - la función `guardar_precios_automaticos`;
  - parámetros de cotización en `crear_inversion` y `registrar_operacion`.
  - Todo con RLS.
- Cliente de Twelve Data en `src/repositories/twelve-data/precios.fuente.ts`.
- Variable de entorno opcional `TWELVE_DATA_API_KEY`.
- `PreciosService` en `src/precios/`, con:
  - `refrescar`: precio actual de los activos vencidos;
  - `completarHistorico`: cierres de fechas pasadas;
  - `buscar`: cobertura de un símbolo.
- `GET /inversiones/:id/activos/buscar?simbolo=` y `PATCH /inversiones/:id/activos/:activoId`.
- Cambios en módulos existentes:
  - `POST /inversiones` y `POST /inversiones/:id/operaciones` resuelven la cobertura de los activos nuevos;
  - `GET /inversiones`, `GET /inversiones/:id` y `GET /cuentas` refrescan los precios vencidos;
  - `GET /resumen` además completa los cierres pasados;
  - `POST /inversiones/:id/activos/:activoId/precios` rechaza los activos automáticos;
  - `PosicionDto` trae `cotizacion`, `clase`, `precioCotizadoEn` y `precioVencido`.
- Dominio puro en `src/domain/precio/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/precios.e2e-spec.ts`, con la fuente de precios falsa.
- `docs/api/inversiones.md` actualizado.

**Fuera de alcance (specs futuros):**

- Activos de bolsas no estadounidenses o en COP con precio automático. El plan gratis de Twelve Data cubre bolsa de EE. UU. y cripto; un activo de una cuenta COP queda manual.
- Precios con fracciones de centavo (decisión de SPEC 10).
- Una tabla global de precios compartida entre usuarios: exigiría `service_role` o abriría el envenenamiento de datos (SPEC 09).
- Cola, reintentos o reparto de créditos entre usuarios.
- Dividendos, divisiones de acciones y eventos corporativos.
- Proveedores alternos o de respaldo.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_precios_automaticos.sql`.

### Cambios en `public.inversion_activos`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `cotizacion` | `text` | not null, default `'manual'`, `check (cotizacion in ('automatica','manual'))` |
| `clase` | `text` | nullable, `check (clase in ('accion','etf','cripto'))`. La da el proveedor. |
| `simbolo_fuente` | `text` | nullable. Símbolo en el proveedor: `'VOO'`, `'BTC/USD'`. |
| `consultado_en` | `timestamptz` | nullable. Última consulta del precio actual al proveedor, haya respondido o no. |

- `inversion_activos_cotizacion_check`: `check ((cotizacion = 'automatica') = (simbolo_fuente is not null))`. Un activo automático siempre sabe qué pedir.
- Los activos existentes quedan `manual`, con `clase`, `simbolo_fuente` y `consultado_en` nulos.
- Política nueva `inversion_activos_update_propio`, con `using` y `with check` `usuario_id = auth.uid()`.
- Permisos de columna: `revoke update on inversion_activos from authenticated` y `grant update (cotizacion, clase, simbolo_fuente, consultado_en) on inversion_activos to authenticated`. Símbolo, nombre y cuenta siguen fijos.
- Cambiar el modo no es un dato financiero y no lleva historial. Los precios que deja cada modo sí quedan, en `inversion_precios`.

### Cambios en `public.inversion_precios`

- `origen`: el `check` pasa a `origen in ('manual','cierre','intradia')`.
  - `manual`: lo digitó el usuario, o es el costo unitario de la operación que creó el activo (SPEC 10).
  - `cierre`: precio de cierre del proveedor. `fecha` es el día de la sesión.
  - `intradia`: último precio del día, solo en cripto. Hay a lo sumo uno por activo y día.
- `cotizado_en`: en `cierre` e `intradia` es el instante que informa el proveedor (en UTC). En `manual` sigue siendo `now()`.
- Índices únicos parciales:
  - `inversion_precios_cierre_unico (activo_id, fecha) where origen = 'cierre'`;
  - `inversion_precios_intradia_unico (activo_id, fecha) where origen = 'intradia'`.
- Política nueva `inversion_precios_update_intradia`: `using` y `with check` `usuario_id = auth.uid() and origen = 'intradia'`. Permisos de columna: `grant update (precio_cent, cotizado_en) on inversion_precios to authenticated`. Manual y cierre siguen sin UPDATE.
- Sin DELETE, como en SPEC 10.

### Función `guardar_precios_automaticos`

`public.guardar_precios_automaticos(p_precios jsonb, p_consultados uuid[]) returns void`, `security invoker` con `set search_path = ''` y `grant execute to authenticated`. Corre como el usuario, así que la RLS aplica.

- `p_precios` es `[{ activo_id, precio_cent, fecha, origen, cotizado_en }]`, con `origen` en `cierre` o `intradia` (si no, `ENTRADA_INVALIDA:origen`).
  - `cierre`: `insert … on conflict (activo_id, fecha) where origen = 'cierre' do nothing`. Un cierre no cambia.
  - `intradia`: `insert … on conflict (activo_id, fecha) where origen = 'intradia' do update set precio_cent, cotizado_en`, solo si el nuevo `cotizado_en` es posterior.
- `p_consultados`: `update inversion_activos set consultado_en = now() where id = any(p_consultados)`. La RLS limita a los propios.
- Todo en una transacción.

### Cambios en `crear_inversion` y `registrar_operacion`

- Cada posición de `crear_inversion` acepta `cotizacion`, `clase` y `simbolo_fuente` (por defecto `manual`, nulo y nulo).
- `registrar_operacion` gana `p_cotizacion text default 'manual'`, `p_clase text default null` y `p_simbolo_fuente text default null`, al final. Solo se usan al crear el activo.
- El primer precio sigue siendo el costo unitario, con origen `manual` (SPEC 10). Si la fuente cae justo después de crear, el activo ya tiene valor.

### Fuente (Twelve Data)

- Base `https://api.twelvedata.com`. Clave en la cabecera `Authorization: apikey <clave>`, nunca en el log.
- Plan gratis: 8 créditos por minuto y 800 al día, a 1 crédito por símbolo.
- `fetch` nativo con `AbortSignal.timeout(5000)` y sin reintentos. Respuestas validadas con Zod.
- Endpoints:
  - **Búsqueda:** `GET /symbol_search?symbol=S&outputsize=30`. Trae por resultado `symbol`, `instrument_name`, `instrument_type`, `currency` y `exchange`.
  - **Precio actual:** `POST /batch`, con una subpetición por activo y a lo sumo 8 por lote:
    - acción o ETF: `/eod?symbol=S`, el último cierre con su fecha;
    - cripto: `/quote?symbol=S/USD`, con `close` como precio y `datetime`.
  - **Histórico:** `POST /batch` con `/time_series?symbol=S&interval=1day&start_date=A&end_date=B`, una subpetición por activo y a lo sumo 8 por lote.
- **Falla** es cualquiera de estos casos: sin clave, error de red, timeout, estado distinto de 200, forma inesperada o `status: "error"` en el lote o en una subpetición. La fuente devuelve `null` para lo que falló y deja un aviso con `Logger.warn`, sin datos del usuario ni la clave. Una subpetición fallida no tumba las demás.
- **Precio de la fuente:** viene como string decimal (`"562.4"`, `"71400.12345"`). Se convierte a unidades menores con `parsearPrecio`, half-up a centavos. Si da 0, es una falla de ese activo.

### Reglas del dominio (`src/domain/precio/`)

Fechas `"YYYY-MM-DD"` en la zona del perfil. `ahora` es un `Date`.

- **Cobertura** (`cobertura.ts`, `elegirCobertura(simbolo, moneda, resultados)`):
  1. El primer resultado con `symbol === S`, `currency === moneda`, `instrument_type` de acción o ETF y una bolsa de EE. UU. → `{ cubierto: true, clase: "accion" | "etf", simboloFuente: S, nombre: instrument_name }`.
  2. Si no, el primero con `symbol === "S/" + moneda` e `instrument_type` de cripto → `{ cubierto: true, clase: "cripto", simboloFuente: "S/USD", nombre }`.
  3. Si no, `{ cubierto: false }`.
  - Las cadenas exactas de `instrument_type` y de las bolsas se fijan en el paso 6 con respuestas reales grabadas. El dominio las recibe como constantes.
  - Una cuenta COP nunca queda cubierta con el plan gratis (regla 1 exige `currency === "COP"`).
- **Vencimiento** (`vencimiento.ts`, `debeConsultar(activo, ahora)`):
  - un activo manual nunca se consulta;
  - un automático con `consultadoEn` nulo, sí;
  - acción o ETF: si `ahora − consultadoEn ≥ 60 min`;
  - cripto: si `ahora − consultadoEn ≥ 15 min`.
  - Se cuenta desde la última consulta y no desde la fecha del precio. Así un fin de semana no consulta en cada lectura.
- **Lote:** de los activos que hay que consultar, los 8 con `consultadoEn` más antiguo (los nulos primero). El resto espera a la siguiente lectura.
- **Precio vencido** (`precioVencido` en el contrato): el activo es automático y la última consulta no trajo precio. Es decir, el precio vigente es anterior a la última consulta fallida, o es el primer precio manual. Se deriva de `consultadoEn` y del `cotizadoEn` del precio vigente, sin columna propia.
- **Histórico** (`historico.ts`, `fechasFaltantes(activo, fechas, operaciones, precios)`). Para cada fecha F pedida por el patrimonio (los cierres de la serie y del puente, y hoy):
  - si el activo es automático y tuvo cantidad > 0 en F;
  - y no hay precio con fecha en `[F − 7, F]`;
  - entonces F falta. La ventana de 7 días cubre fines de semana y festivos.
  - Por activo se pide un solo rango, `[min(F) − 7, max(F)]`. De la serie que llega se guarda solo el último cierre ≤ F de cada F faltante, como `cierre` con su propia fecha.
- **Precio vigente** (SPEC 10) no cambia. Mayor `fecha ≤ F` y, en empate, mayor `cotizadoEn`, sea cual sea el origen.

### Flujo de `PreciosService`

- **`refrescar(usuario, activos, ahora)`:** si la fuente está apagada (sin clave), no hace nada.
  1. Elige el lote con `debeConsultar`.
  2. Llama a `PreciosFuente.actuales(lote)`.
  3. Guarda con `guardar_precios_automaticos`. Los precios que llegaron van en `p_precios`, y todos los del lote en `p_consultados`, también los que fallaron, para no repetir la consulta en la siguiente lectura.
  4. Si guardar falla, responde igual y deja un aviso, como la TRM.
- **`completarHistorico(usuario, datos, fechas)`:** calcula `fechasFaltantes` por activo, pide los rangos en un lote de hasta 8 activos y guarda los cierres.
- **`buscar(usuario, cuentaId, simbolo)`:** normaliza el símbolo (SPEC 10). Si la fuente está apagada o falla, responde `{ cubierto: false, proveedorDisponible: false }`. Si no, aplica `elegirCobertura` con la moneda de la cuenta.
- Quién llama a quién:
  - `InversionesService.listar` y `detalle`, y `CuentasService` (lista y archivadas), llaman a `refrescar` antes de valorar y releen los precios;
  - `ResumenService` llama a `refrescar` y después a `completarHistorico` con sus fechas;
  - `registrarOperacion` y `crear` de inversiones llaman a `buscar` por cada activo nuevo, antes de escribir.

### Validaciones

- **Activo nuevo** (`POST /inversiones` y `POST …/operaciones`):
  - si el símbolo está cubierto, el activo nace `automatica` con su `clase` y su `simbolo_fuente`. `nombre` pasa a ser opcional: sin él va el del proveedor, y con él gana el del usuario;
  - si no está cubierto, nace `manual` y `nombre` sigue siendo obligatorio (`NOMBRE_REQUERIDO`, SPEC 10).
- **`PATCH …/activos/:activoId`:**
  - cuerpo `{ cotizacion: "automatica" | "manual" }`; otro valor o campo da `ENTRADA_INVALIDA`;
  - a `automatica`: se busca la cobertura con la moneda de la cuenta. Sin cobertura → `ACTIVO_NO_CUBIERTO`. Con la fuente caída → `PROVEEDOR_NO_DISPONIBLE`. Si cubre, guarda `clase` y `simbolo_fuente`, deja `consultado_en` en nulo y la siguiente lectura trae el precio;
  - a `manual`: deja `simbolo_fuente` y `consultado_en` en nulo y conserva `clase`. El precio vigente sigue siendo el último que hubo, ahora como base del modo manual;
  - pedir el mismo modo que ya tiene da `SIN_CAMBIOS`;
  - la cuenta no está archivada (`CUENTA_ARCHIVADA`) y el activo es de la inversión (`ACTIVO_NO_ENCONTRADO`).
- **`POST …/activos/:activoId/precios`** en un activo automático: `PRECIO_AUTOMATICO`.
- **Búsqueda:** `simbolo` válido (`SIMBOLO_INVALIDO`, SPEC 10).

### Tipos de dominio

```ts
// src/domain/inversion/inversion.ts (cambia)
type Cotizacion = "automatica" | "manual";
type ClaseActivo = "accion" | "etf" | "cripto";
type OrigenPrecio = "manual" | "cierre" | "intradia";
type Activo = {
  id: string; cuentaId: string; simbolo: string; nombre: string; creadoEn: Date;
  cotizacion: Cotizacion; clase: ClaseActivo | null; simboloFuente: string | null; consultadoEn: Date | null;
};

// src/domain/precio/precio.ts
type ResultadoBusqueda = { symbol: string; instrumentName: string; instrumentType: string; currency: string; exchange: string };
type Cobertura =
  | { cubierto: true; clase: ClaseActivo; simboloFuente: string; nombre: string }
  | { cubierto: false };
type PrecioObtenido = { activoId: string; precio: bigint; fecha: string; origen: "cierre" | "intradia"; cotizadoEn: Date };
```

### Contrato HTTP

Convenciones de `docs/api/README.md` y de `docs/api/inversiones.md` (porcentajes en centésimas).

```ts
type ClaseActivo = "accion" | "etf" | "cripto";

type PosicionDto = {                      // cambia
  // … campos de SPEC 10 …
  cotizacion: "automatica" | "manual";
  clase: ClaseActivo | null;
  precioOrigen: "manual" | "cierre" | "intradia";
  precioCotizadoEn: string;               // ISO 8601 UTC; la hora del intradía la arma el cliente en la zona del usuario
  precioVencido: boolean;                 // automático cuya última consulta no trajo precio
};

type BusquedaActivoDto = {
  simbolo: string;                        // normalizado
  cubierto: boolean;
  nombre: string | null;                  // del proveedor, si cubre
  clase: ClaseActivo | null;
  proveedorDisponible: boolean;           // false: sin clave o la fuente falló; cubierto es false
};

type CotizacionCambio = { cotizacion: "automatica" | "manual" };
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /inversiones/:id/activos/buscar` | `?simbolo=` | `200 BusquedaActivoDto` |
| `PATCH /inversiones/:id/activos/:activoId` | `CotizacionCambio` | `200 InversionDetalleDto` |

- La búsqueda gasta un crédito del proveedor. El cliente la llama al salir del campo de símbolo, no en cada tecla.
- Un activo existente no necesita la búsqueda: `registrar_operacion` usa el que ya hay (SPEC 10).
- La nota del diseño (N-33) la arma el cliente con `clase`, `precioOrigen`, `precioFecha` y `precioCotizadoEn` de cada posición.
- «Actualizar precio» (N-26) se muestra solo con `cotizacion: "manual"`.
- `PATCH` devuelve el detalle con el precio todavía sin refrescar si pasó a automático. La siguiente lectura lo trae.

### Cambios en contratos existentes

- `PosicionDto` (`GET /inversiones/:id` y las rutas que devuelven `InversionDetalleDto`): `cotizacion`, `clase`, `precioCotizadoEn` y `precioVencido`. `precioOrigen` admite `"cierre"` e `"intradia"`.
- `OperacionCuerpo.nombre` y `PosicionInicialCuerpo.nombre`: opcionales si el símbolo está cubierto.
- `POST /inversiones/:id/activos/:activoId/precios`: el error `PRECIO_AUTOMATICO`.
- `GET /inversiones`, `GET /inversiones/:id`, `GET /cuentas`, `GET /cuentas/archivadas` y `GET /resumen` pueden consultar al proveedor. Su forma no cambia por eso.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `ACTIVO_NO_CUBIERTO` | 422 | `cotizacion` | «El proveedor de precios no cubre este activo. Actualiza su precio a mano.» |
| `PROVEEDOR_NO_DISPONIBLE` | 503 | — | «El proveedor de precios no responde. Intenta más tarde.» |
| `PRECIO_AUTOMATICO` | 422 | `precio` | «Este activo tiene precio automático. Pásalo a manual para fijar su precio.» |

Se reutilizan `SIMBOLO_INVALIDO`, `NOMBRE_REQUERIDO`, `ACTIVO_NO_ENCONTRADO`, `INVERSION_NO_ENCONTRADA`, `CUENTA_ARCHIVADA`, `SIN_CAMBIOS`, `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

`PROVEEDOR_NO_DISPONIBLE` solo sale de `PATCH` a `automatica`, porque ahí el usuario pidió algo que exige al proveedor. En las lecturas, la falla nunca es un error HTTP.

## Estructura de archivos

```
supabase/migrations/<timestamp>_precios_automaticos.sql
src/
  config/env.ts (+ env.test.ts)              # TWELVE_DATA_API_KEY opcional
  main.ts                                    # aviso al arrancar si falta la clave
  comun/error-api.ts                         # + códigos nuevos
  precios/
    precios.module.ts                        # exporta PreciosService
    precios.service.ts                       # refrescar, completarHistorico, buscar
  inversiones/
    inversiones.controller.ts, esquemas.ts   # buscar, PATCH activo
    inversiones.service.ts, dto.ts           # cobertura al crear, refresco, campos nuevos
  cuentas/cuentas.service.ts                 # refrescar antes de valorar
  resumen/resumen.service.ts                 # refrescar y completarHistorico
  domain/
    inversion/inversion.ts                   # Cotizacion, ClaseActivo, OrigenPrecio, Activo
    inversion/validar.ts (+ .test.ts)        # nombre opcional si cubre
    precio/
      precio.ts                              # tipos y constantes del proveedor
      valor.ts (+ .test.ts)                  # parsearPrecio
      cobertura.ts (+ .test.ts)              # elegirCobertura
      vencimiento.ts (+ .test.ts)            # debeConsultar, lote, precioVencido
      historico.ts (+ .test.ts)              # fechasFaltantes, cierres a guardar
  repositories/
    twelve-data/
      precios.fuente.ts (+ .test.ts)         # PreciosFuente: buscar, actuales, historico; parseo puro
      respuestas.test-utils.ts               # respuestas reales grabadas
    supabase/
      inversiones.repository.ts              # columnas nuevas, rpc guardar_precios_automaticos, PATCH activo
      tipos.ts                               # regenerado
test/
  aislamiento.e2e-spec.ts                    # ampliado (no se borra ni se desactiva)
  precios.e2e-spec.ts
.env.example                                 # TWELVE_DATA_API_KEY vacía
docs/api/
  inversiones.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_precios_automaticos.sql` según el modelo. **El autor la revisa antes del paso 2** (REGLAS §8).
2. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`. Las e2e de inversiones siguen en verde: todo activo existente es `manual`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con un activo automático y precios `cierre` e `intradia`, el otro:
   - no ve los precios ajenos;
   - afecta 0 filas al hacer UPDATE de la cotización del activo ajeno o del intradía ajeno;
   - no cambia nada ajeno con `guardar_precios_automaticos` (la FK falla en `p_precios` y `p_consultados` afecta 0 filas).
   - Además:
     - un UPDATE de un precio `cierre` o `manual` propio afecta 0 filas;
     - un UPDATE de `simbolo` o `nombre` del activo falla por permisos;
     - un activo `automatica` sin `simbolo_fuente` viola el `check`.
   - `npm test` en verde.
4. `env.ts`: `TWELVE_DATA_API_KEY` opcional, sin prefijo público y recortada. `main.ts` avisa al arrancar si falta. Pruebas de `env.test.ts`.
5. `domain/precio/` con pruebas:
   - `valor.ts`: `"562.4"`→`56240n`, `"71400.12345"`→`7140012n`, `"0.004"`→`null` y `"abc"`→`null`;
   - `vencimiento.ts`: bordes de 60 y 15 min, manual nunca, nulo siempre, lote de 8 por antigüedad y `precioVencido`;
   - `historico.ts`: ventana de 7 días, sin cantidad no falta, un rango por activo y último cierre ≤ F.
6. Pedir a Twelve Data, una vez y a mano, `symbol_search` de `VOO`, `AAPL` y `BTC`, `eod` de `VOO`, `quote` de `BTC/USD` y `time_series` de `VOO`. Guardar las respuestas en `respuestas.test-utils.ts` (sin la clave). Fijar las constantes de `instrument_type` y bolsas en `domain/precio/precio.ts`. `cobertura.ts` con pruebas sobre esas respuestas: VOO → `etf`, AAPL → `accion`, BTC → `cripto` con `BTC/USD`, y un símbolo inexistente o una cuenta COP → no cubierto.
7. `repositories/twelve-data/precios.fuente.ts`:
   - parseo puro probado con las respuestas grabadas, incluido un lote con una subpetición en error;
   - `PreciosFuente` con `buscar`, `actuales` e `historico`, que devuelven `null` ante cualquier falla, y `disponible` según haya clave.
8. `inversiones.repository.ts`: lee las columnas nuevas, llama por `rpc` a `guardar_precios_automaticos`, actualiza la cotización del activo y pasa los parámetros nuevos a `crear_inversion` y `registrar_operacion`.
9. `src/precios/` con `PreciosService` y su registro. `InversionesModule`, `CuentasModule` y `ResumenModule` lo importan.
10. `GET /inversiones/:id/activos/buscar`. Cobertura al crear en `POST /inversiones` y `POST …/operaciones`, con nombre opcional.
11. `PATCH /inversiones/:id/activos/:activoId` y `PRECIO_AUTOMATICO` en `POST …/precios`.
12. `refrescar` en `GET /inversiones`, `GET /inversiones/:id` y `GET /cuentas`. `PosicionDto` con los campos nuevos.
13. `refrescar` y `completarHistorico` en `GET /resumen`.
14. `test/precios.e2e-spec.ts` con una `PreciosFuente` falsa que cuenta llamadas, y la TRM falsa de SPEC 10. Se omite con aviso si falta `SUPABASE_SECRET_KEY`.
15. `docs/api/inversiones.md`: búsqueda, `PATCH` de cotización, campos nuevos de `PosicionDto`, errores y cuándo se consulta al proveedor. `.env.example` con la variable.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | SPEC 09. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04. |
| N-05 – N-22 | SPEC 10. |
| N-23 | `precioFecha` (SPEC 10), `precioOrigen` (`cierre` o `intradia`) y `precioCotizadoEn` para la hora. |
| N-24 | SPEC 10 (`precioOrigen: "manual"`). `cotizacion` lo distingue del modo. |
| N-25 – N-32 | SPEC 10. `N-26` y `N-35` se muestran solo con `cotizacion: "manual"`. |
| N-33 | `PosicionDto.clase`, `precioOrigen`, `precioFecha` y `precioCotizadoEn`; la nota la arma el cliente. |
| N-34 – N-47 | SPEC 09 y SPEC 10. |
| N-48 | `GET /inversiones/:id/activos/buscar` → `cubierto`, `nombre` y `clase`. Al crear, la cobertura se resuelve sola y el activo queda `automatica` o `manual`. |
| N-49 | SPEC 10. Con este spec, el nombre solo es obligatorio si el símbolo no está cubierto. |
| N-50 | `PreciosService.refrescar` al leer: acciones y ETF al cierre (60 min), cripto intradía (15 min). |
| N-51 | SPEC 09. |
| N-52 | Parte precios: si el proveedor falla, el precio vigente sigue con su fecha y `precioVencido: true`. Parte TRM: SPEC 09. |
| N-53 | SPEC 10. Manual y cierre siguen solo INSERT; el intradía de hoy se reemplaza, uno por día. |
| N-54 | Parte precios automáticos: `completarHistorico` guarda los cierres de las fechas del patrimonio. Precios manuales y TRM: SPEC 10 y SPEC 09. |
| N-55 – N-75 | SPEC 10. |
| N-76 | Fuera de alcance: dividendos (duda resuelta en el inventario). |
| N-77 | Fuera de alcance (SPEC 10). |
| N-78 | Fuera de alcance (SPEC 10). |

Endpoint → N-xx:

- `GET /inversiones/:id/activos/buscar`: N-48.
- `PATCH /inversiones/:id/activos/:activoId`: N-48 y N-50. Hace falta para volver automáticos los activos que SPEC 10 dejó en manual y para corregir una cobertura equivocada.
- Cambios en `GET /inversiones/:id` (`PosicionDto`): N-23, N-33, N-52.
- Refresco en lecturas: N-50. Histórico en `GET /resumen`: N-54.

Con este spec, todas las N-xx de `specs/necesidades/inversiones.md` quedan cubiertas o fuera de alcance con motivo.

## Criterios de aceptación

`H` es hoy en la zona del perfil. La TRM falsa vale `"4120"`. La fuente de precios falsa:

- cubre `VOO` (etf, «Vanguard S&P 500 ETF») y `BTC` (cripto, `BTC/USD`, «Bitcoin US Dollar»);
- devuelve cierre `"562.4"` de `H−1` para VOO e intradía `"71400"` para BTC/USD, con `cotizadoEn` de hace 1 minuto;
- no cubre `RENEW`.

eToro es una inversión USD con efectivo suficiente.

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre los cambios.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3.
- [ ] Las e2e de inversiones, cuentas y resumen siguen en verde.
- [ ] `GET …/activos/buscar?simbolo=voo` → `{ simbolo: "VOO", cubierto: true, nombre: "Vanguard S&P 500 ETF", clase: "etf", proveedorDisponible: true }`. Con `RENEW` → `cubierto: false` y `nombre: null`.
- [ ] Una compra de `VOO`, `cantidad: "2"` y `monto: "100000"`, sin `nombre` → `201`:
  - el activo queda `cotizacion: "automatica"` y `clase: "etf"`, con el nombre del proveedor;
  - la misma respuesta, o la siguiente lectura, trae `precio` `"56240"`, `precioOrigen: "cierre"`, `precioFecha` `H−1` y `precioVencido: false`.
- [ ] Una compra de `RENEW` sin `nombre` → `400 NOMBRE_REQUERIDO`. Con nombre → activo `manual`, `clase: null`.
- [ ] Una compra de `BTC` → activo `cripto` con `precioOrigen: "intradia"` y `precio` `"7140000"`.
- [ ] Un segundo `GET /inversiones/:id` antes de 15 minutos no llama a la fuente. Con el reloj de la prueba 16 minutos después y un intradía nuevo `"71500"`:
  - se consulta solo BTC;
  - la fila `intradia` de hoy se actualiza en su sitio (sigue habiendo una);
  - el precio es `"7150000"`.
- [ ] Con la fuente fallando y el reloj vencido:
  - `GET /inversiones/:id` → `200` con el último precio de cada activo y `precioVencido: true` en los automáticos;
  - `consultado_en` se actualiza, así que una lectura inmediata no vuelve a llamar a la fuente.
- [ ] `POST …/activos/:vooId/precios` → `422 PRECIO_AUTOMATICO`.
- [ ] `PATCH …/activos/:vooId { cotizacion: "manual" }` → `200` con VOO `manual`. `POST …/precios { precio: "57000" }` → `201`. Repetir el `PATCH` → `400 SIN_CAMBIOS`.
- [ ] `PATCH …/activos/:renewId { cotizacion: "automatica" }` → `422 ACTIVO_NO_CUBIERTO`. Con la fuente fallando → `503 PROVEEDOR_NO_DISPONIBLE`.
- [ ] Un activo creado en SPEC 10 como manual pasa a automático con `PATCH { cotizacion: "automatica" }`, y la siguiente lectura trae su precio de la fuente.
- [ ] Con más de 8 activos automáticos vencidos, una lectura consulta solo los 8 más antiguos.
- [ ] `GET /resumen` de un mes pasado con VOO comprado antes del cierre de ese mes:
  - pide a la fuente un solo `time_series` por activo;
  - guarda como `cierre` solo los cierres de las fechas usadas;
  - una segunda llamada no consulta el histórico.
- [ ] Sin `TWELVE_DATA_API_KEY`:
  - la API arranca y avisa;
  - la búsqueda da `cubierto: false` y `proveedorDisponible: false`;
  - los activos nuevos nacen manuales;
  - ninguna lectura llama a la fuente.
- [ ] Un id ajeno en `buscar` o en `PATCH …/activos/:activoId` → `404 INVERSION_NO_ENCONTRADA` o `404 ACTIVO_NO_ENCONTRADO`.
- [ ] Ningún log ni respuesta contiene la clave de Twelve Data.
- [ ] Ningún archivo fuera de `src/repositories/twelve-data/` contiene `twelvedata.com`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún precio pasa por `number`.
- [ ] `docs/api/inversiones.md` documenta la búsqueda, el `PATCH` de cotización y los campos nuevos.

## Decisiones

- **Sí:** Twelve Data como único proveedor, para acciones, ETF y cripto con una clave. **No:** sumar CoinGecko para cripto (dos clientes y dos claves). **No:** Stooq, que no tiene clave pero es no oficial, frágil y sin intradía.
- **Sí:** precios bajo demanda al leer, solo si están vencidos, en la caché por usuario (patrón de SPEC 09). **No:** un botón «Actualizar» como única vía, porque N-50 pide que se actualicen solos. **No:** un job con `service_role` (REGLAS §4).
- **Sí:** el vencimiento se cuenta desde `consultado_en`, la última consulta haya respondido o no: 60 min en acciones y ETF, 15 min en cripto. **No:** contar desde la fecha del precio, que consultaría en cada lectura del fin de semana o con la fuente caída.
- **Sí:** a lo sumo 8 activos por lote, el límite por minuto del plan gratis, y el resto en la siguiente lectura. **No:** esperar o reintentar dentro de la petición.
- **Sí:** acciones y ETF con `/eod`, el último cierre con su fecha, como muestra el diseño («Cierre 10 nov»). Cripto con `/quote`, el intradía. **No:** intradía para acciones: el diseño muestra el cierre.
- **Sí:** una fila `intradia` por activo y día, reemplazable. Manual y cierre siguen solo INSERT. **No:** insertar cada refresco, unas 96 filas diarias por activo sin valor.
- **Sí:** el histórico guarda solo los cierres de las fechas que pide el patrimonio, con una consulta por activo y rango. **No:** un backfill completo desde la primera operación (filas que nadie lee). **No:** sin histórico, que deja la serie imprecisa.
- **Sí:** el activo guarda `cotizacion`, `clase`, `simbolo_fuente` y `consultado_en`. **No:** una tabla aparte de cobertura.
- **Sí:** automático solo si el proveedor lo encuentra en la moneda de la cuenta. Una cuenta COP queda manual con el plan gratis.
- **Sí:** un endpoint de búsqueda que autocompleta el nombre, más la resolución al crear. Si el símbolo está cubierto, el nombre es opcional (diez segundos, REGLAS §1). **No:** resolver solo al crear con el nombre obligatorio.
- **Sí:** `PATCH` de modo, y precio manual solo en activos manuales (`PRECIO_AUTOMATICO`). Con el `PATCH`, los activos de SPEC 10 pasan a automáticos y se corrige un símbolo confundido. **No:** «gana el más reciente», porque el siguiente refresco pisaría el precio manual. **No:** revisar solos los activos existentes, que gasta créditos sin pedirlo.
- **Sí:** el primer precio sigue siendo el costo unitario, también en un activo automático. Si la fuente cae al crear, el activo vale algo.
- **Sí:** `guardar_precios_automaticos` como función `security invoker`. Hace el `on conflict` sobre los índices parciales, que PostgREST no puede expresar, sin saltar la RLS. **No:** `security definer`, porque no hace falta privilegio.
- **Sí:** clave opcional. Sin ella todo queda manual y un aviso sale al arrancar. **No:** variable obligatoria: las pruebas y el desarrollo no la necesitan.
- **Sí:** `PROVEEDOR_NO_DISPONIBLE` solo en el `PATCH` a automático, que es una acción explícita. En las lecturas, la falla nunca es un error HTTP.
- **Sí:** `precioVencido` derivado de `consultado_en` y del precio vigente. **No:** una columna de estado.
- **Sí:** las constantes de `instrument_type` y bolsas se fijan con respuestas reales grabadas, porque la documentación no las lista. La forma real queda en las pruebas, como en SPEC 09.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los 800 créditos diarios son de la clave, no del usuario: con caché por usuario, cada usuario gasta los suyos | A escala personal sobra: unas 24 consultas al día por acción, 96 por cripto si se lee sin parar, y el histórico una vez. Si hay más usuarios, un spec futuro agrega un plan pago o un caché compartido con su propia decisión de seguridad. |
| Una lectura paga el timeout de 5 s si Twelve Data está lento | Solo una vez por ventana de vencimiento, porque `consultado_en` se marca aunque falle. Las lecturas siguientes usan la caché. |
| El proveedor confunde un símbolo (otra bolsa u otro activo con el mismo ticker) | La regla exige símbolo exacto, moneda de la cuenta y bolsa de EE. UU. El usuario ve el nombre en la búsqueda y puede pasar el activo a manual con el `PATCH`. |
| Twelve Data cambia la forma de las respuestas o las cadenas de `instrument_type` | Zod valida y la falla deja el último precio con `precioVencido`. Las respuestas grabadas fijan la forma, y cambiar de proveedor solo toca `src/repositories/twelve-data/` y las constantes. |
| Ocho activos por lote dejan algunos sin refrescar en carteras grandes | El resto se refresca en las lecturas siguientes, los más antiguos primero. `precioFecha` muestra la antigüedad real. |
| Un split o un evento corporativo cambia el precio sin cambiar la cantidad | Fuera de alcance. El usuario corrige con una operación o pasa el activo a manual. |
| La clave se filtra en un log | Va en la cabecera, nunca en la URL ni en los avisos. Un criterio de aceptación lo verifica. |
| `GET /resumen` gasta créditos en el histórico | Una consulta por activo y por rango faltante. Después las fechas quedan en caché y no se vuelven a pedir. |

## Lo que **no** entra en este spec

- Precio automático de activos en COP o de bolsas no estadounidenses.
- Precios con fracciones de centavo.
- Caché global de precios entre usuarios.
- Colas, reintentos o reparto de créditos.
- Dividendos, divisiones y eventos corporativos.
- Proveedores alternos.

Cada uno, si llega, va en su propio spec.
