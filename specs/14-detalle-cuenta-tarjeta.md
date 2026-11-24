# SPEC 14 — Detalle de cuenta y tarjeta con ciclo

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 08, SPEC 10, SPEC 13
> **Fecha:** 2026-11-23
> **Objetivo:** Que la API dé el detalle de una cuenta (historial con saldo corrido, conciliación y ajuste de saldo) y el ciclo de facturación de una tarjeta de crédito con sus condiciones.

## Por qué existe este spec

REGLAS §7 se enmendó en los dos repos: «detalle de cuenta con conciliación» y «tarjeta de crédito con ciclo» pasan a «construir ahora».

Fija cinco patrones:

- **La conciliación es por cuenta.** Un movimiento tiene un estado por cada lado: `conciliado_origen` y `conciliado_destino`. Conciliar en Efectivo no concilia en Bancolombia.
- **Conciliar es una modificación registrada** (RN-13). Deja una fila `conciliacion` en `movimientos_cambios`. Editar monto, fecha o cuenta devuelve el lado afectado a pendiente, en un trigger, sea cual sea el camino de escritura.
- **El ajuste de saldo es un tipo propio** (RN-14): `tipo = 'ajuste'`, con la categoría reservada «Ajuste». La dirección la da la cuenta: si sube el saldo va en `cuenta_destino_id`, si baja en `cuenta_origen_id`. `calcularSaldo` no cambia.
- **El ciclo de la tarjeta se calcula, no se guarda** (RN-01). Se guardan solo las condiciones (día de corte, día de pago, tasa, cuota de manejo, cuenta de pago). Corte, pago límite, saldo al corte y grupos salen del dominio.
- **Los cargos del banco son gastos** (RN-09). Se distinguen por categoría: «Intereses» (existente, SPEC 08) y «Cuota de manejo» (nueva). Los registra el usuario.

Cubre el inventario `specs/necesidades/detalle-cuenta.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con:
  - en `movimientos`: el tipo `ajuste`, las columnas `conciliado_origen` y `conciliado_destino`, y el trigger `desconciliar_al_editar`;
  - en `categorias`: el tipo `ajuste`, y en la semilla «Ajuste» y «Cuota de manejo», con relleno para los usuarios existentes;
  - en `movimientos_cambios`: la operación `conciliacion`;
  - `validar_escritura_movimiento` con las reglas del ajuste;
  - las funciones `conciliar_movimientos`, `registrar_ajuste` y `crear_tarjeta`;
  - las tablas `tarjetas` y `tarjetas_cambios`, con sus triggers;
  - el trigger `quitar_cuenta_pago` en `cuentas`.
  - Todo con RLS.
- `GET /cuentas/:id`.
- `GET /cuentas/:id/historial`, `PUT /cuentas/:id/conciliacion` y `POST /cuentas/:id/ajustes`.
- `GET /cuentas/:id/ciclo`, con la consulta `compra`.
- Cambios en módulos existentes:
  - `POST` y `PATCH /cuentas` reciben las condiciones de la tarjeta; `CuentaDto.tarjeta` las devuelve;
  - `PUT /movimientos/:id` edita ajustes; `POST /movimientos` no los crea;
  - `GET /movimientos` devuelve ajustes con `tipo: "ajuste"`;
  - el resumen del mes no cuenta ajustes;
  - `GET /captura` no lista la categoría «Ajuste».
- Dominio puro en `src/domain/cuenta/` y `src/domain/tarjeta/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/detalle-cuenta.e2e-spec.ts`.
- `docs/api/cuentas.md`, `movimientos.md`, `resumen.md` y `captura.md` actualizados.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- Aviso «Corte de la tarjeta» (avisos N-42). Va en su inventario.
- Historial conciliable de la tarjeta. Duda resuelta: la tarjeta solo tiene su pantalla de ciclo.
- Ajuste de saldo en tarjeta o inversión.
- Generar cuota de manejo o intereses automáticamente al corte.
- Historial de cambios del cupo.
- Endpoint de lectura de `movimientos_cambios` o `tarjetas_cambios`.
- Extractos de ciclos pasados (solo el ciclo en curso).
- Línea «Ajustes» en el resumen del mes.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_detalle_cuenta.sql`. Los montos son `text` cifrado (SPEC 05).

### Constantes

- `src/domain/movimiento/movimiento.ts`: `TipoMovimiento` suma `"ajuste"`. `DESCRIPCION_AJUSTE = "Ajuste de saldo"`.
- `src/domain/cuenta/cuenta.ts`: `TIPOS_CON_DETALLE = ['efectivo', 'banco']`. Son los que tienen historial, conciliación y ajuste.
- `src/domain/tarjeta/tarjeta.ts`: `CATEGORIAS_CARGO = ['Intereses', 'Cuota de manejo']` (de gasto). `DIAS_HISTORIAL_POR_DEFECTO = 30`.

En SQL se repiten las listas.

### Cambios en `public.movimientos`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `conciliado_origen` | `boolean` | not null, default `false` |
| `conciliado_destino` | `boolean` | not null, default `false` |

- `check (tipo in ('gasto','ingreso','transferencia','ajuste'))`.
- `movimientos_cuentas_por_tipo` suma el caso `ajuste`: exactamente una de `cuenta_origen_id` y `cuenta_destino_id` no nula, y `categoria_id` no nulo.
- `movimientos_conciliado_check`: `(not conciliado_origen or cuenta_origen_id is not null) and (not conciliado_destino or cuenta_destino_id is not null)`.
- La FK `(usuario_id, categoria_id, tipo) → categorias` ya obliga a que un ajuste lleve la categoría de tipo `ajuste`. Hay una sola por usuario: la reservada.
- Trigger `desconciliar_al_editar()`, `before update on movimientos`:
  - si cambian `tipo`, `monto`, `monto_destino` o `fecha`, pone los dos lados en `false`;
  - si cambia `cuenta_origen_id`, pone `conciliado_origen = false`;
  - si cambia `cuenta_destino_id`, pone `conciliado_destino = false`.
  - Compara textos cifrados: la API reutiliza el cifrado si el monto no cambió (SPEC 05).
- `foto_movimiento` ya usa `to_jsonb(m)`: las fotos del historial incluyen las columnas nuevas sin tocarla.

### Cambios en `public.categorias` y la semilla

- `check (tipo in ('gasto','ingreso','ajuste'))`.
- `insertar_semilla` se recrea con dos categorías más:
  - `('Ajuste', 'ajuste', 0)`;
  - `('Cuota de manejo', 'gasto', 10)`, después de «Intereses» (9).
- Regla nueva: `manejo` → «Cuota de manejo».
- La migración inserta las dos categorías y la regla a cada perfil existente que no las tenga.

### Cambios en `public.movimientos_cambios`

- `check (operacion in ('edicion','eliminacion','conciliacion'))`.
- Una fila `conciliacion` lleva `antes` y `despues` con la foto completa.

### Cambios en `validar_escritura_movimiento`

Para `p_tipo = 'ajuste'`:

- la cuenta informada es `efectivo` o `banco` (`TIPO_NO_ADMITIDO`);
- sin partes (`DIVISION_NO_PERMITIDA:partes`).

### Función `conciliar_movimientos`

`privado.conciliar_movimientos(p_cuenta_id uuid, p_ids uuid[], p_conciliado boolean) returns void`. Es `security definer` con `set search_path = ''` y tiene una envoltura `security invoker` en `public` con la misma firma. Permisos como `registrar_movimiento`.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Lee la cuenta del usuario. Si no existe o es un préstamo, lanza `CUENTA_NO_ENCONTRADA`. Si no es `efectivo` ni `banco`, `TIPO_NO_ADMITIDO`. Si está archivada, `CUENTA_ARCHIVADA`.
3. Si algún id no es de un movimiento del usuario que toque la cuenta, lanza `MOVIMIENTO_NO_ENCONTRADO`.
4. Por cada movimiento cuyo lado de esa cuenta cambia de estado: toma la foto, actualiza `conciliado_origen` o `conciliado_destino` (los dos si fuera origen y destino, cosa que RN-03 impide) e inserta la fila `conciliacion`.
5. Los que ya estaban en ese estado no cambian ni dejan fila.

### Función `registrar_ajuste`

`privado.registrar_ajuste(p_id uuid, p_cuenta_id uuid, p_monto text, p_sube boolean, p_fecha date, p_conciliar boolean) returns uuid`. Mismo esquema de seguridad, envoltura y permisos.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Busca la categoría de tipo `ajuste` del usuario.
3. Llama a `privado.registrar_movimiento(p_id, 'ajuste', p_monto, p_fecha, 'Ajuste de saldo', null, <origen>, <destino>, <categoría>, null)`. Con `p_sube`, la cuenta va en destino; si no, en origen. Esa llamada valida tipo de cuenta y archivada.
4. Marca conciliado el lado de la cuenta en el ajuste nuevo, sin fila de historial (nace conciliado).
5. Si `p_conciliar`: concilia todos los movimientos de la cuenta con `fecha <= p_fecha`, con su fila `conciliacion` cada uno, como `conciliar_movimientos`.
6. Todo en una transacción. Devuelve `p_id`.

El monto y la dirección los calcula la API: Postgres no ve cifras.

### Tabla `public.tarjetas`

Condiciones de una tarjeta, como `prestamos` para un préstamo. Una tarjeta creada antes de este spec no tiene fila.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `cuenta_id` | `uuid` | PK |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `dia_corte` | `smallint` | not null, `check (dia_corte between 1 and 31)` |
| `dia_pago` | `smallint` | not null, `check (dia_pago between 1 and 31)` |
| `tasa_mensual_cpb` | `integer` | nullable, `check (tasa_mensual_cpb between 0 and 10000)`. Centésimas de punto: 1,98 % = `198`. |
| `cuota_manejo` | `text` | nullable. Cifrado, AAD `tarjetas\|cuota_manejo\|<cuenta_id>`. |
| `cuenta_pago_id` | `uuid` | nullable |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `unique (usuario_id, cuenta_id)`.
- FK `(usuario_id, cuenta_id) → cuentas (usuario_id, id) on delete cascade` (`tarjetas_cuenta_fkey`).
- FK `(usuario_id, cuenta_pago_id) → cuentas (usuario_id, id) on delete set null (cuenta_pago_id)` (`tarjetas_cuenta_pago_fkey`).
- `check (cuenta_pago_id is null or cuenta_pago_id <> cuenta_id)`.
- `cuota_manejo` con la restricción de formato cifrado de SPEC 05.
- Índices `tarjetas_usuario_idx (usuario_id)` y `tarjetas_cuenta_pago_idx (usuario_id, cuenta_pago_id)`.
- RLS: `tarjetas_select_propia`, `tarjetas_insert_propia` y `tarjetas_update_propia`. Sin DELETE: cae con la cuenta.
- Triggers:
  - `marcar_actualizado`;
  - `validar_tarjeta()`, `before insert or update of cuenta_id, cuenta_pago_id`:
    - la cuenta es `tarjeta_credito` (`TIPO_NO_ADMITIDO`);
    - si `cuenta_pago_id` no es nulo, es `efectivo` o `banco` y no está archivada (`CUENTA_PAGO_INVALIDA:tarjeta.cuentaPagoId`);
  - `registrar_cambio_tarjeta()`, ver `tarjetas_cambios`.

### Tabla `public.tarjetas_cambios`

Historial (RN-13), con la forma de `cuentas_cambios`. Sin endpoint de lectura.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `cuenta_id` | `uuid` | not null, FK `cuentas(id) on delete cascade` |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `campo` | `text` | not null, `check (campo in ('dia_corte','dia_pago','tasa_mensual_cpb','cuota_manejo','cuenta_pago_id'))` |
| `valor_anterior` | `text` | nullable |
| `valor_nuevo` | `text` | nullable |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `tarjetas_cambios_usuario_idx (usuario_id)` y `tarjetas_cambios_cuenta_idx (cuenta_id)`.
- RLS: solo `tarjetas_cambios_select_propio`.
- `registrar_cambio_tarjeta()`, `after update on tarjetas`, `security definer` con `set search_path = ''`. Una fila por campo que cambió. `cuota_manejo` se copia cifrada.
- El alta no deja fila, como `cuentas_cambios`.

### Trigger `quitar_cuenta_pago`

`after update of archivada_en on cuentas`, cuando `new.archivada_en is not null`. Pone `cuenta_pago_id = null` en las tarjetas del usuario que la usan. El cambio deja su fila en `tarjetas_cambios`. Borrar la cuenta hace lo mismo por la FK.

### Función `crear_tarjeta`

`public.crear_tarjeta(p_id uuid, p_nombre text, p_detalle text, p_saldo_inicial text, p_cupo text, p_dia_corte smallint, p_dia_pago smallint, p_tasa_mensual_cpb integer, p_cuota_manejo text, p_cuenta_pago_id uuid) returns uuid`. `security invoker`, `set search_path = ''`, `grant execute to authenticated`. Inserta la cuenta `tarjeta_credito` y su fila en `tarjetas` en una transacción. Las políticas de las dos tablas aplican.

La edición escribe `tarjetas` con un upsert del repositorio, después de validar todo en el dominio.

### Reglas del dominio

Fechas `"YYYY-MM-DD"` en la zona del perfil. `hoy` sale de `fechaLocal`. Orden cronológico de los movimientos: `fecha`, luego `creadoEn`, luego `id`.

**Historial** (`src/domain/cuenta/historial.ts`), solo `efectivo` y `banco`:

- **Efecto** de un movimiento en la cuenta: `+monto` si es destino (`montoDestino ?? monto`), `−monto` si es origen.
- **Saldo corrido:** `saldoInicial` + efectos en orden cronológico. Cada fila lleva el saldo tras ella.
- **Rango:** `desde` obligatorio en el dominio; `hasta` opcional. Sin `hasta` no hay tope y entran los futuros (N-39).
- **Saldo al inicio del rango:** saldo tras los movimientos con `fecha < desde`.
- **Entradas y salidas del rango:** Σ efectos positivos y Σ |efectos negativos| de las filas del rango.
- **Saldo a hoy:** saldo tras los movimientos con `fecha <= hoy`.
- **Filas:** las del rango, la más reciente primero.
- **Contraparte** de una transferencia: la otra cuenta, con `sentido = 'desde'` si esta es destino y `'hacia'` si es origen.

**Conciliación** (`src/domain/cuenta/conciliacion.ts`):

- **Estado de un movimiento en la cuenta:** `conciliado_destino` si es destino, `conciliado_origen` si es origen.
- **Saldo conciliado:** el saldo corrido tras el último movimiento, en orden cronológico, tal que él y todos los anteriores están conciliados. Su fecha es la de ese movimiento. Si el primero está pendiente, los dos son `null`.
- **Pendientes:** cuántos movimientos de la cuenta, de cualquier fecha, están pendientes.

**Ajuste** (`src/domain/cuenta/ajuste.ts`):

- `diferencia = saldoReal − saldoAHoy`.
- `diferencia = 0` → `SIN_DIFERENCIA`.
- `sube = diferencia > 0`, `monto = |diferencia|`, `fecha = hoy`.

**Ciclo** (`src/domain/tarjeta/ciclo.ts`):

- **Fecha de un día en un mes:** `min(dia, último día del mes)` (N-76). Corte 31 en febrero de 2027 → `2027-02-28`.
- **Próximo corte:** el corte del mes de `hoy` si es `>= hoy`; si no, el del mes siguiente. Un consumo del día del corte entra en ese ciclo (N-78).
- **Corte anterior:** el corte del mes anterior al del próximo corte.
- **Inicio del ciclo:** corte anterior + 1 día.
- **Pago límite de un corte:** la fecha del día de pago en el mes del corte si es posterior al corte; si no, la del mes siguiente (N-77). Corte 25, pago 10 → día 10 del mes siguiente.
- **Días hasta el corte y hasta el pago:** diferencia en días con `hoy`.
- **Saldo al corte anterior:** deuda con los movimientos de `fecha <= corte anterior`. En el primer ciclo es el saldo inicial (N-80).
- **Movimientos del ciclo:** los de la tarjeta con fecha entre el inicio y el próximo corte, inclusive, en orden cronológico.
  - **Abonos:** los que entran a la tarjeta (pagos, devoluciones).
  - **Cargos:** gastos desde la tarjeta con una categoría de `CATEGORIAS_CARGO`. Un gasto dividido no es cargo.
  - **Consumos:** las demás salidas, incluidos los avances (transferencias que salen de la tarjeta).
- **Saldo anterior pendiente:** saldo al corte anterior − Σ abonos. Puede ser negativo si se pagó de más.
- **Pago sugerido:** `max(0, saldo anterior pendiente)`.
- **Deuda al corte:** saldo anterior pendiente + Σ consumos + Σ cargos.
- Sin fila en `tarjetas`, no hay ciclo (N-79).

**Compra simulada** (`src/domain/tarjeta/compra.ts`), con `disponible` y `porcentajeUsado` de SPEC 03:

- `cabe = compra <= disponible`.
- Si cabe: `disponibleTras = disponible − compra` y `porcentajeTras = min(100, floor((deuda + compra) × 100 ÷ cupo))`.
- Si no: `falta = compra − disponible`.
- La compra entra al próximo corte y se paga en su pago límite.

**Tasa** (`src/domain/tarjeta/tasa.ts`):

- `efectivaAnual = floor(((1 + m ÷ 10000)^12 − 1) × 10000)`, en centésimas de punto, con aritmética entera en `bigint` a escala 10^12, truncado como los demás porcentajes. `198` → `2652` (26,526 %).

### Validaciones

**Condiciones de la tarjeta** (`src/domain/tarjeta/validar.ts`):

- `diaCorte` y `diaPago`: enteros de 1 a 31 (`DIA_INVALIDO`, campo `tarjeta.diaCorte` o `tarjeta.diaPago`).
- `tasaMensual`: entero de 0 a 10000, o `null` (`TASA_INVALIDA`).
- `cuotaManejo`: string `^\d{1,19}$`, o `null` (`MONTO_INVALIDO`, campo `tarjeta.cuotaManejo`).
- `cuentaPagoId`: UUID de una cuenta `efectivo` o `banco` del usuario, no archivada, o `null` (`CUENTA_PAGO_INVALIDA`).
- Alta de una tarjeta: `tarjeta` con `diaCorte` y `diaPago` obligatorio (`CONDICIONES_REQUERIDAS`).
- Alta o edición de otra cuenta: `tarjeta` prohibido (`CONDICIONES_NO_PERMITIDAS`).
- Edición de una tarjeta sin fila en `tarjetas`: el primer `tarjeta` trae `diaCorte` y `diaPago` (`CONDICIONES_REQUERIDAS`).

**Historial:**

- `desde` y `hasta`: `YYYY-MM-DD` válidas (`FECHA_INVALIDA`). Sin `desde`: `hoy − 30 días`.
- `hasta < desde` → `RANGO_INVALIDO`.

**Conciliación:**

- `movimientoIds`: lista de 1 a 500 UUID sin repetir (`ENTRADA_INVALIDA`).
- `conciliado`: booleano (`ENTRADA_INVALIDA`).

**Ajuste:**

- `saldoReal`: string `^\d{1,19}$` (`MONTO_INVALIDO`). No negativo, como el saldo inicial.
- `conciliarHastaHoy`: booleano opcional, por defecto `true`.

**Compra:** `compra` string `^\d{1,19}$` mayor que 0 (`MONTO_INVALIDO`, campo `compra`).

**Movimientos:**

- `POST /movimientos` con `tipo: "ajuste"`: `TIPO_MOVIMIENTO_INVALIDO`. Un ajuste solo nace en `POST /cuentas/:id/ajustes`.
- `PUT /movimientos/:id` que convierte en ajuste otro tipo, o un ajuste en otro tipo: `MOVIMIENTO_DE_AJUSTE`.
- `PUT` de un ajuste:
  - exactamente una cuenta: sin ninguna, `ORIGEN_REQUERIDO`; con las dos, `DESTINO_NO_PERMITIDO`;
  - sin `categoriaId` (`CATEGORIA_NO_PERMITIDA`): la API pone la reservada;
  - sin partes (`DIVISION_NO_PERMITIDA`);
  - la cuenta puede cambiar a otra `efectivo` o `banco`; otro tipo da `TIPO_NO_ADMITIDO`.

### Contrato HTTP

Montos en string entero de pesos. Los que pueden ser negativos (`efecto`, `saldo` de una fila, `saldoAnteriorPendiente`) llevan `-`.

```ts
type Ref = { id: string; nombre: string };

// CuentaDto (SPEC 03): crece `tarjeta`.
type TarjetaDto = {
  cupo: string;
  disponible: string;
  porcentajeUsado: number;
  diaCorte: number | null;          // null: tarjeta sin condiciones (N-79)
  diaPago: number | null;
  tasaMensual: number | null;       // centésimas de punto: 198 = 1,98 % M.V.
  tasaEfectivaAnual: number | null; // centésimas de punto: 2652 = 26,52 % E.A.
  cuotaManejo: string | null;
  cuentaPago: Ref | null;
};

type CondicionesTarjeta = {
  diaCorte?: number;
  diaPago?: number;
  tasaMensual?: number | null;
  cuotaManejo?: string | null;
  cuentaPagoId?: string | null;
};

type FilaHistorialDto = {
  movimientoId: string;
  tipo: "gasto" | "ingreso" | "transferencia" | "ajuste";
  fecha: string;
  descripcion: string | null;
  efecto: string;                   // con signo: + entra, − sale
  saldo: string;                    // saldo corrido tras la fila
  conciliado: boolean;              // en esta cuenta
  categoria: Ref | null;            // en un ajuste, «Ajuste»
  partes: { categoria: Ref; monto: string }[];
  contraparte: (Ref & { sentido: "desde" | "hacia" }) | null; // solo transferencias
};

type HistorialDto = {
  fechaHoy: string;
  desde: string;
  hasta: string | null;
  saldo: string;                    // actual, con futuros (SPEC 03)
  saldoHoy: string;                 // el del panel de ajuste
  conciliacion: { saldo: string | null; al: string | null; pendientes: number };
  entradas: string;
  salidas: string;                  // positivo; el «−» lo pone el cliente
  saldoInicioRango: string;
  filas: FilaHistorialDto[];        // la más reciente primero
};

type FilaCicloDto = {
  movimientoId: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  fecha: string;
  descripcion: string | null;
  monto: string;
  categoria: Ref | null;
  partes: { categoria: Ref; monto: string }[];
  contraparte: Ref | null;          // la otra cuenta de una transferencia
};

type CicloDto = {
  fechaHoy: string;
  ciclo: {
    inicio: string;
    corte: string;
    pagoLimite: string;
    diasHastaCorte: number;
    diasHastaPago: number;
    corteAnterior: { fecha: string; saldo: string };
    abonos: FilaCicloDto[];
    saldoAnteriorPendiente: string;
    pagoSugerido: string;
    consumos: FilaCicloDto[];
    totalConsumos: string;
    cargos: (FilaCicloDto & { clase: "intereses" | "cuota_manejo" })[];
    totalCargos: string;
    deudaAlCorte: string;
  } | null;                         // null: tarjeta sin condiciones
  compra: {
    monto: string;
    cabe: boolean;
    disponibleTras: string | null;
    porcentajeTras: number | null;
    falta: string | null;
  } | null;                         // solo con ?compra=
};
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /cuentas/:id` | — | `200 CuentaDto`, también archivada |
| `GET /cuentas/:id/historial` | `?desde=&hasta=` | `200 HistorialDto` |
| `PUT /cuentas/:id/conciliacion` | `{ movimientoIds: string[], conciliado: boolean }` | `204` |
| `POST /cuentas/:id/ajustes` | `{ saldoReal: string, conciliarHastaHoy?: boolean }` | `201 MovimientoDto` |
| `GET /cuentas/:id/ciclo` | `?compra=` | `200 CicloDto` |

- `GET /cuentas/:id` de un préstamo o de otro usuario: `404 CUENTA_NO_ENCONTRADA`. Una inversión se valora como en `GET /cuentas`.
- Historial, conciliación y ajuste solo en `efectivo` y `banco`; ciclo solo en `tarjeta_credito`. Otro tipo: `422 TIPO_NO_ADMITIDO`.
- Una cuenta archivada se lee (cuenta, historial, ciclo), pero no se concilia ni se ajusta: `409 CUENTA_ARCHIVADA`.
- Los atajos del cliente: «Últimos 30 días» sin `desde` ni `hasta`; mes actual con `desde` el día 1 y sin `hasta`; mes anterior con los dos.
- El cliente suma los `efecto` de lo seleccionado (N-23) y muestra la diferencia previa del ajuste con `saldoHoy` (N-28). La API la fija al registrar.
- «Registrar pago» abre la captura de una transferencia con `cuentaPago`, la tarjeta y `pagoSugerido`. Se registra con `POST /movimientos`.
- El cliente arma «Cargo fijo» con `clase: "cuota_manejo"` y «Sobre N» con `saldoAnteriorPendiente`.

### Cambios en contratos existentes

- `POST /cuentas`: campo `tarjeta: CondicionesTarjeta`, obligatorio con `diaCorte` y `diaPago` si `tipo` es `tarjeta_credito`; prohibido en otro tipo. La tarjeta nace con `crear_tarjeta`. **Cambio incompatible para la web:** el alta de tarjeta sin condiciones pasa a responder `400 CONDICIONES_REQUERIDAS`.
- `PATCH /cuentas/:id`: `tarjeta` parcial. `null` en un campo opcional lo borra.
- `CuentaDto.tarjeta` es `TarjetaDto`.
- `GET /movimientos` y `MovimientoDto`: `tipo` suma `"ajuste"`. Un ajuste trae una sola cuenta y la categoría «Ajuste». Se muestra con `+` si trae `cuentaDestino` y `−` si trae `cuentaOrigen`.
- `PUT /movimientos/:id`: reglas del ajuste (ver Validaciones). Editar monto, fecha o cuenta de cualquier movimiento lo devuelve a pendiente en el lado afectado.
- `GET /resumen`: los ajustes no suman a ingresos, gastos ni `cantidad`. Sí mueven saldos y patrimonio.
- `GET /captura`: no lista la categoría de tipo `ajuste`. «Cuota de manejo» aparece entre las de gasto.

### Errores nuevos

| Código | HTTP | Campo | Mensaje sugerido |
|---|---|---|---|
| `TIPO_NO_ADMITIDO` | 422 | — | Esta operación no está disponible para este tipo de cuenta. |
| `RANGO_INVALIDO` | 400 | `hasta` | La fecha final no puede ser anterior a la inicial. |
| `SIN_DIFERENCIA` | 422 | `saldoReal` | El saldo contado es igual al de TINO: no hay nada que ajustar. |
| `MOVIMIENTO_DE_AJUSTE` | 422 | `tipo` | Un ajuste no cambia de tipo, y ningún movimiento se convierte en ajuste. |
| `DIA_INVALIDO` | 400 | `tarjeta.diaCorte` o `tarjeta.diaPago` | Elige un día entre 1 y 31. |
| `TASA_INVALIDA` | 400 | `tarjeta.tasaMensual` | Escribe una tasa entre 0 % y 100 %. |
| `CUENTA_PAGO_INVALIDA` | 422 | `tarjeta.cuentaPagoId` | Elige una cuenta de efectivo o banco activa. |
| `CONDICIONES_REQUERIDAS` | 400 | `tarjeta` | La tarjeta necesita día de corte y día de pago. |
| `CONDICIONES_NO_PERMITIDAS` | 400 | `tarjeta` | Solo las tarjetas tienen condiciones. |

Se reusan `ENTRADA_INVALIDA`, `MONTO_INVALIDO`, `FECHA_INVALIDA`, `CUENTA_NO_ENCONTRADA`, `CUENTA_ARCHIVADA`, `MOVIMIENTO_NO_ENCONTRADO`, `TIPO_MOVIMIENTO_INVALIDO`, `ORIGEN_REQUERIDO`, `DESTINO_NO_PERMITIDO`, `CATEGORIA_NO_PERMITIDA` y `DIVISION_NO_PERMITIDA`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_detalle_cuenta.sql
src/domain/cuenta/
  historial.ts          Efecto, saldo corrido, rango, entradas y salidas.
  conciliacion.ts       Saldo conciliado y pendientes.
  ajuste.ts             Diferencia y dirección.
  *.test.ts
src/domain/tarjeta/
  tarjeta.ts            Tipos y constantes.
  ciclo.ts              Fechas del ciclo y grupos.
  compra.ts             Compra simulada.
  tasa.ts               Tasa efectiva anual.
  validar.ts            Condiciones.
  fixtures.test-utils.ts
  *.test.ts
src/domain/movimiento/movimiento.ts, validar.ts   Tipo ajuste.
src/domain/resumen/mes.ts                         Excluye ajustes.
src/repositories/supabase/cuentas.repository.ts   Una cuenta, tarjetas, crear_tarjeta.
src/repositories/supabase/detalle-cuenta.repository.ts
src/repositories/supabase/movimientos.repository.ts  Columnas de conciliación.
src/cuentas/                                      GET /cuentas/:id; condiciones en alta y edición.
src/detalle-cuenta/
  detalle-cuenta.module.ts
  detalle-cuenta.controller.ts   @Controller('cuentas'): historial, conciliacion, ajustes, ciclo.
  detalle-cuenta.service.ts
  esquemas.ts
  dto.ts
src/movimientos/movimientos.service.ts            Reglas del ajuste.
src/captura/                                      Sin la categoría de ajuste.
src/comun/error-api.ts                            Errores nuevos.
src/app.module.ts                                 Registra DetalleCuentaModule.
test/detalle-cuenta.e2e-spec.ts
test/aislamiento.e2e-spec.ts                      Ampliada.
docs/api/cuentas.md, movimientos.md, resumen.md, captura.md
```

## Plan de implementación

1. Migración `<timestamp>_detalle_cuenta.sql`: columnas, checks, semilla, tablas, índices, RLS, triggers y funciones. **El autor la revisa antes de aplicarla** (REGLAS §8). Se aplica y se regeneran los tipos en `src/repositories/supabase/tipos.ts`.
2. Tipo `ajuste` en `src/domain/movimiento/`: tipos, `validarMovimiento` (prohibido en alta, reglas en edición) y pruebas. `src/domain/resumen/mes.ts` lo excluye, con su prueba. `GET /captura` filtra la categoría.
3. `src/domain/cuenta/historial.ts` y `conciliacion.ts` con sus pruebas, con los datos de Efectivo del diseño.
4. `src/domain/cuenta/ajuste.ts` con sus pruebas.
5. `src/domain/tarjeta/ciclo.ts`, `compra.ts` y `tasa.ts` con sus pruebas, con los datos de la tarjeta del diseño, meses cortos y pago en el mes siguiente.
6. `src/domain/tarjeta/validar.ts` con sus pruebas.
7. Repositorios: leer una cuenta con su fila de `tarjetas`, cifrar `cuota_manejo`, llamar a `crear_tarjeta`, upsert de condiciones; leer los movimientos de una cuenta con nombres, partes y conciliación; llamar a `conciliar_movimientos` y `registrar_ajuste`.
8. `GET /cuentas/:id` y condiciones en `POST` y `PATCH /cuentas`, con `TarjetaDto` en todas las respuestas de cuentas. La ruta `archivadas` va antes de `:id`.
9. Módulo `src/detalle-cuenta/`: `GET /cuentas/:id/historial`. Registrado en `app.module.ts`.
10. `PUT /cuentas/:id/conciliacion` y `POST /cuentas/:id/ajustes`.
11. `GET /cuentas/:id/ciclo` con `?compra=`.
12. `PUT /movimientos/:id` de ajustes y `TIPO_MOVIMIENTO_INVALIDO` en `POST`.
13. Prueba de aislamiento con `tarjetas`, `tarjetas_cambios` y las dos funciones nuevas sobre cuentas y movimientos ajenos; `test/detalle-cuenta.e2e-spec.ts`.
14. `docs/api/cuentas.md`, `movimientos.md`, `resumen.md` y `captura.md`, con la tabla «Necesidades → contrato».

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | `CuentaDto.id` y `tipo`; el cliente elige pantalla (historial o ciclo). |
| N-02 | `GET /cuentas/:id`: `nombre`, `tipo`, `detalle`, `naturaleza`. |
| N-03 | `HistorialDto.saldo` (y `CuentaDto.saldo`). |
| N-04 | `HistorialDto.conciliacion.saldo`. |
| N-05 | `HistorialDto.conciliacion.al`. |
| N-06 | `HistorialDto.conciliacion.pendientes`. |
| N-07 | `HistorialDto.entradas`. |
| N-08 | `HistorialDto.salidas`. |
| N-09 | `?desde=&hasta=` según el atajo; sin `desde`, últimos 30 días. |
| N-10 | `?desde=&hasta=` libres; `RANGO_INVALIDO`. |
| N-11 | `HistorialDto.desde` y `hasta`. |
| N-12 | `HistorialDto.filas`, la más reciente primero. |
| N-13 | `FilaHistorialDto.fecha`. |
| N-14 | `FilaHistorialDto.descripcion`. |
| N-15 | `FilaHistorialDto.categoria`, `partes` y `contraparte` con `sentido`. |
| N-16 | `FilaHistorialDto.efecto`, con signo. |
| N-17 | `FilaHistorialDto.saldo`. |
| N-18 | `FilaHistorialDto.conciliado`; columnas `conciliado_origen` y `conciliado_destino`. |
| N-19 | `PUT /cuentas/:id/conciliacion` con un id. |
| N-20 | `HistorialDto.saldoInicioRango`. |
| N-21 | Estado del cliente. |
| N-22 | Filas con `conciliado: false`; el cliente las selecciona. |
| N-23 | El cliente suma `efecto` de lo seleccionado. |
| N-24 | `PUT /cuentas/:id/conciliacion` con varios ids. |
| N-25 | `HistorialDto.saldoHoy`. |
| N-26 | `POST /cuentas/:id/ajustes` con `saldoReal`. |
| N-27 | `MONTO_INVALIDO` en `saldoReal`. |
| N-28 | Vista previa con `saldoHoy`; la API la fija (`ajuste.ts`). |
| N-29 | `HistorialDto.fechaHoy`; descripción `Ajuste de saldo`. |
| N-30 | `registrar_ajuste`: `tipo = 'ajuste'`, categoría reservada. |
| N-31 | `SIN_DIFERENCIA`. |
| N-32 | `conciliarHastaHoy`, por defecto `true`. |
| N-33 | El ajuste nace conciliado con categoría «Ajuste» y sale en el historial. |
| N-34 | `GET /resumen` excluye `tipo = 'ajuste'`. |
| N-35 | `TIPO_NO_ADMITIDO` fuera de `efectivo` y `banco`, en la API y en `validar_escritura_movimiento`. |
| N-36 | `404 CUENTA_NO_ENCONTRADA`. |
| N-37 | `filas: []` con `saldoInicioRango`. |
| N-38 | `conciliacion.saldo` y `al` en `null`. |
| N-39 | Sin `hasta` entran los futuros. |
| N-40 | Filas `conciliacion` en `movimientos_cambios`. |
| N-41 | Trigger `desconciliar_al_editar`. |
| N-42 | `PUT` y `DELETE /movimientos/:id` de ajustes; `MOVIMIENTO_DE_AJUSTE`. |
| N-43 | Lecturas de archivadas en `200`; conciliar y ajustar en `409 CUENTA_ARCHIVADA`. |
| N-44 | Montos en string entero; formato en el cliente. |
| N-45 | `GET /cuentas/:id`: `nombre`, `detalle`, `naturaleza`. |
| N-46 | `TarjetaDto.cupo` (SPEC 03). |
| N-47 | `CuentaDto.saldo` (SPEC 03). |
| N-48 | `TarjetaDto.disponible` (SPEC 03). |
| N-49 | `TarjetaDto.porcentajeUsado` (SPEC 03). |
| N-50 | `GET /cuentas/:id/ciclo?compra=`: `compra.cabe`. |
| N-51 | `compra.disponibleTras` y `porcentajeTras`. |
| N-52 | `ciclo.corte` y `ciclo.pagoLimite`. |
| N-53 | `compra.falta` y `TarjetaDto.disponible`. |
| N-54 | `compra: null` sin consulta; `MONTO_INVALIDO` en `compra`. |
| N-55 | `ciclo.inicio`, `corte` y `pagoLimite`. |
| N-56 | `ciclo.diasHastaCorte`, `diasHastaPago` y `fechaHoy`. |
| N-57 | `ciclo.corteAnterior`. |
| N-58 | `ciclo.abonos`, con `contraparte`. |
| N-59 | `ciclo.saldoAnteriorPendiente`. |
| N-60 | `ciclo.consumos`. |
| N-61 | Largo de `ciclo.consumos`. |
| N-62 | `ciclo.totalConsumos`. |
| N-63 | `ciclo.cargos` con `clase`; categoría «Cuota de manejo» en la semilla. |
| N-64 | `ciclo.totalCargos`. |
| N-65 | `ciclo.deudaAlCorte`. |
| N-66 | `TarjetaDto.cupo`. |
| N-67 | `TarjetaDto.tasaMensual` y `tasaEfectivaAnual`. |
| N-68 | `TarjetaDto.cuotaManejo`. |
| N-69 | `TarjetaDto.diaCorte`. |
| N-70 | `TarjetaDto.diaPago`. |
| N-71 | `TarjetaDto.cuentaPago`. |
| N-72 | `ciclo.pagoSugerido`, `cuentaPago` y `POST /movimientos` (SPEC 04). |
| N-73 | `POST /cuentas` con `tarjeta`; `crear_tarjeta`; `CONDICIONES_REQUERIDAS`. |
| N-74 | `PATCH /cuentas/:id` con `tarjeta`. |
| N-75 | `DIA_INVALIDO`, `TASA_INVALIDA`, `MONTO_INVALIDO`, `CUENTA_PAGO_INVALIDA`; `validar_tarjeta`. |
| N-76 | Fecha de un día en un mes (`ciclo.ts`). |
| N-77 | Pago límite de un corte (`ciclo.ts`). |
| N-78 | Ciclo hasta el corte inclusive (`ciclo.ts`). |
| N-79 | `TarjetaDto.diaCorte: null` y `CicloDto.ciclo: null`. |
| N-80 | Saldo al corte anterior desde el saldo inicial. |
| N-81 | Condiciones opcionales en `null`. |
| N-82 | Listas vacías y totales `"0"`. |
| N-83 | `tarjetas_cambios`. |
| N-84 | `tarjetas_cuenta_pago_fkey` `on delete set null` y trigger `quitar_cuenta_pago`. |

Endpoints sin N-xx propia: ninguno. `GET /cuentas/:id` cubre N-02 y N-45.

## Criterios de aceptación

- [ ] La migración aplica limpia y la prueba de aislamiento cubre `tarjetas`, `tarjetas_cambios`, `conciliar_movimientos` y `registrar_ajuste` contra datos ajenos.
- [ ] `tarjetas.cuota_manejo` solo guarda texto cifrado.
- [ ] Un usuario existente tiene las categorías «Ajuste» (tipo `ajuste`) y «Cuota de manejo» tras la migración, y uno nuevo las recibe en la semilla.
- [ ] `GET /captura` no trae «Ajuste» y trae «Cuota de manejo» entre las de gasto.
- [ ] `GET /cuentas/:id` devuelve una cuenta archivada; con el id de un préstamo responde `404 CUENTA_NO_ENCONTRADA`.
- [ ] `GET /cuentas/archivadas` sigue respondiendo la lista (no la toma `:id`).
- [ ] Con los datos de Efectivo del diseño (saldo inicial 122.200, 16 movimientos del 22 oct al 11 nov, octubre conciliado) y hoy 11 nov, `GET /cuentas/:id/historial` trae `saldo: "45000"`, `conciliacion: { saldo: "148100", al: "2026-10-31", pendientes: 9 }`, `entradas: "100000"`, `salidas: "177200"` y `saldoInicioRango: "122200"`.
- [ ] Con `desde=2026-11-01` trae solo los 9 de noviembre y `saldoInicioRango: "148100"`.
- [ ] Una transferencia de Bancolombia a Efectivo sale en el historial de Efectivo con `efecto` positivo y `contraparte` `{ nombre: "Bancolombia", sentido: "desde" }`.
- [ ] Un gasto con fecha de mañana sale primero en el historial sin `hasta` y su `saldo` coincide con `HistorialDto.saldo`; `saldoHoy` no lo incluye.
- [ ] `hasta` anterior a `desde` responde `400 RANGO_INVALIDO`.
- [ ] El historial o el ajuste de una tarjeta responden `422 TIPO_NO_ADMITIDO`; el ciclo de un banco, también.
- [ ] Conciliar en Efectivo una transferencia desde Bancolombia la deja conciliada en Efectivo y pendiente en Bancolombia.
- [ ] Conciliar tres movimientos deja tres filas `conciliacion` en `movimientos_cambios`; repetir la petición no deja más.
- [ ] Conciliar un movimiento que no toca la cuenta responde `404 MOVIMIENTO_NO_ENCONTRADO` y no cambia ninguno.
- [ ] Editar el monto de un movimiento conciliado lo devuelve a pendiente en sus dos lados; editar solo la nota lo deja conciliado.
- [ ] Cambiar la cuenta de origen de una transferencia conciliada en los dos lados deja pendiente el origen y conciliado el destino.
- [ ] Con saldo a hoy 45.000, `POST /cuentas/:id/ajustes` con `saldoReal: "41500"` crea un ajuste de 3.500 en `cuentaOrigen`, conciliado, con categoría «Ajuste», y el saldo queda en 41.500.
- [ ] Con `conciliarHastaHoy` por defecto, `conciliacion.pendientes` queda en 0 si no hay futuros.
- [ ] `saldoReal` igual al saldo a hoy responde `422 SIN_DIFERENCIA`.
- [ ] Ajustar una cuenta archivada responde `409 CUENTA_ARCHIVADA`.
- [ ] `POST /movimientos` con `tipo: "ajuste"` responde `400 TIPO_MOVIMIENTO_INVALIDO`.
- [ ] `PUT /movimientos/:id` de un ajuste cambia su monto; cambiarlo a gasto responde `422 MOVIMIENTO_DE_AJUSTE`; moverlo a una tarjeta responde `422 TIPO_NO_ADMITIDO`.
- [ ] Un ajuste no cambia `ingresos`, `gastos` ni `cantidad` de `GET /resumen`.
- [ ] `POST /cuentas` de una tarjeta sin `tarjeta` responde `400 CONDICIONES_REQUERIDAS`; un banco con `tarjeta`, `400 CONDICIONES_NO_PERMITIDAS`.
- [ ] `diaCorte: 32` responde `400 DIA_INVALIDO`; una tarjeta como cuenta de pago, `422 CUENTA_PAGO_INVALIDA`.
- [ ] Con los datos de la tarjeta del diseño (cupo 4.000.000, corte 15, pago 30, tasa 198, cuota 26.990, saldo al 15 oct 1.217.980, pago de 620.000 el 28 oct, 11 consumos y 2 cargos) y hoy 11 nov, `GET /cuentas/:id/ciclo` trae `inicio: "2026-10-16"`, `corte: "2026-11-15"`, `pagoLimite: "2026-11-30"`, `diasHastaCorte: 4`, `diasHastaPago: 19`, `saldoAnteriorPendiente: "597980"`, `totalConsumos: "651450"`, `totalCargos: "34870"` y `deudaAlCorte: "1284300"`.
- [ ] `GET /cuentas/:id` de esa tarjeta trae `tasaEfectivaAnual: 2652`.
- [ ] `?compra=450000` trae `{ cabe: true, disponibleTras: "2265700", porcentajeTras: 43, falta: null }`; `?compra=3000000`, `{ cabe: false, falta: "284300" }`.
- [ ] Con corte 31 y hoy 10 feb 2027, `corte` es `"2027-02-28"`. Con corte 25 y pago 10, el pago límite cae el 10 del mes siguiente.
- [ ] Un gasto del día del corte sale en `consumos` del ciclo que cierra ese día.
- [ ] Una tarjeta creada antes de este spec trae `diaCorte: null` y `ciclo: null`; su primer `PATCH` con `tarjeta` sin `diaPago` responde `400 CONDICIONES_REQUERIDAS`.
- [ ] Archivar la cuenta de pago deja `cuentaPago: null` en la tarjeta y una fila en `tarjetas_cambios`.
- [ ] Cambiar `diaCorte` deja una fila en `tarjetas_cambios`.
- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `docs/api/` documenta los endpoints y errores nuevos y los cambios de `cuentas`, `movimientos`, `resumen` y `captura`.
- [ ] La tabla de cobertura no tiene filas vacías.

## Decisiones

- **Sí:** un solo spec para detalle de cuenta y tarjeta. Decisión del autor. **No:** partirlo en dos.
- **Sí:** conciliación por cuenta, en dos columnas de `movimientos`. **No:** un estado por movimiento, que concilia en una cuenta lo que no se revisó en la otra. **No:** tabla aparte, que obliga a otro historial.
- **Sí:** conciliar deja fila en `movimientos_cambios` (RN-13). **No:** tratarlo como dato no financiero.
- **Sí:** desconciliar en un trigger `before update`. Cubre el `PUT`, préstamos, metas y recurrentes sin tocar cada función. **No:** hacerlo solo en `reemplazar_movimiento`.
- **Sí:** editar monto, fecha o tipo desconcilia los dos lados; cambiar una cuenta, solo ese lado. **No:** mantener el estado tras editar.
- **Sí:** ajuste como `tipo = 'ajuste'` con la dirección en la cuenta. `calcularSaldo` y la vista de saldos no cambian. **No:** columna de sentido. **No:** gasto o ingreso con categoría reservada, que RN-14 descarta.
- **Sí:** categoría de tipo `ajuste` en `categorias`, para que la FK compuesta la imponga. **No:** `categoria_id` nulo, que deja RN-14 sin garantía en la base.
- **Sí:** la diferencia contra el saldo a hoy, sin futuros. **No:** contra el saldo actual, que descuadra con un pago programado.
- **Sí:** ajuste solo en `efectivo` y `banco`, con la validación también en Postgres. **No:** en tarjeta o inversión.
- **Sí:** un ajuste solo nace en `/cuentas/:id/ajustes` y se edita en `/movimientos`. **No:** crearlo en `POST /movimientos`, que se saltaría el cálculo de la diferencia.
- **Sí:** el resumen solo excluye los ajustes. **No:** campo `ajustes` en el resumen. Ninguna N-xx lo dibuja.
- **Sí:** subrutas `GET /cuentas/:id`, `/historial`, `/conciliacion`, `/ajustes` y `/ciclo`. **No:** un `GET /detalle` que mezcla historial y ciclo.
- **Sí:** las subrutas en un módulo `src/detalle-cuenta/`. **No:** crecer `CuentasService`.
- **Sí:** sin `hasta`, sin tope. Los atajos incluyen futuros y la última fila cuadra con el saldo (N-39). **No:** `hasta = hoy` por defecto.
- **Sí:** el cliente suma la selección y previsualiza la diferencia con cifras que da la API. La API fija la diferencia al registrar (REGLAS §5). **No:** un endpoint por tecla.
- **Sí:** `PUT /cuentas/:id/conciliacion` con `204`. El cliente recarga el historial. **No:** devolver el historial, que exige el rango en una escritura.
- **Sí:** tabla `tarjetas` con `cuenta_id` como PK, como `prestamos`. El cupo se queda en `cuentas`. **No:** columnas en `cuentas`, nulas en tres de cuatro tipos.
- **Sí:** días de corte y pago obligatorios en la fila; tasa, cuota y cuenta de pago opcionales. Las tarjetas viejas no tienen fila hasta que se completen. **No:** todas obligatorias.
- **Sí:** condiciones en `POST` y `PATCH /cuentas`, con `crear_tarjeta` para el alta atómica. **No:** ruta propia para condiciones.
- **Sí:** día 29–31 en un mes corto es el último día. **No:** limitar a 1–28.
- **Sí:** tasa en centésimas de punto, como préstamos, y E.A. calculada con enteros. **No:** decimal en texto, que abre otra convención.
- **Sí:** la cuenta de pago se quita al archivarla o borrarla, con historial. **No:** bloquear el archivo.
- **Sí:** cargos manuales con categoría «Intereses» o «Cuota de manejo». Las condiciones son informativas. **No:** generarlos al corte, que RN-10 obligaría a confirmar y nadie pidió.
- **Sí:** reusar «Intereses» de SPEC 08. **No:** una tercera categoría de intereses.
- **Sí:** regla `manejo` → «Cuota de manejo» (RN-11). Registrar la cuota toma menos de diez segundos.
- **Sí:** un gasto dividido no es cargo. **No:** repartirlo por partes entre consumos y cargos.
- **Sí:** los avances son consumos. **No:** grupo propio.
- **Sí:** la compra simulada en la API (`?compra=`). Web y celular responden igual. **No:** calcularla en el cliente.
- **Sí:** solo el ciclo en curso. **No:** extractos pasados. Ninguna N-xx los pide.
- **Sí:** pago sugerido = saldo anterior pendiente, mínimo 0. **No:** la deuda total.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El alta de tarjeta sin condiciones deja de funcionar en la web | Cambio documentado en `docs/api/cuentas.md`; el spec de la web lo recoge. |
| `GET /cuentas/:id` captura `GET /cuentas/archivadas` | `archivadas` se declara antes que `:id`, y `:id` valida UUID. Hay un criterio que lo comprueba. |
| `PATCH` de una tarjeta escribe `cuentas` y `tarjetas` en dos sentencias | Todo se valida en el dominio antes de escribir. Primero `tarjetas`, luego `cuentas`. Si la segunda falla, el cliente reintenta el mismo cuerpo. |
| La diferencia del ajuste se calcula en la API y otro movimiento puede entrar en medio | Escala personal. Si pasa, el saldo queda descuadrado por ese movimiento y se ajusta otra vez. |
| «Conciliar hasta hoy» escribe muchas filas de historial | Una por movimiento que cambia. Una cuenta personal tiene cientos, no millones. |
| El trigger `desconciliar_al_editar` compara montos cifrados | La API reutiliza el cifrado si el monto no cambió (SPEC 05). Hay un criterio que lo verifica con una edición de nota. |
| Historial y ciclo leen todos los movimientos de la cuenta para el saldo corrido | Una cuenta, solo las columnas necesarias. Mismo costo que el saldo de `GET /cuentas`. |
| Un usuario llama `registrar_movimiento` por RPC con `tipo = 'ajuste'` | La base impone forma, cuenta y categoría. Solo afecta sus propios datos. |

## Lo que **no** entra en este spec

- Aviso de corte de la tarjeta.
- Historial conciliable de la tarjeta.
- Ajuste en tarjeta o inversión.
- Cuota de manejo e intereses automáticos.
- Historial del cupo.
- Lectura de `movimientos_cambios` y `tarjetas_cambios`.
- Extractos de ciclos pasados.
- Línea «Ajustes» en el resumen.

Cada uno, si llega, va en su propio spec.
