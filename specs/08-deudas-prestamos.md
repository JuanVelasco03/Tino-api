# SPEC 08 — Deudas y préstamos con personas

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05, SPEC 06
> **Fecha:** 2026-11-21
> **Objetivo:** Que la API lleve préstamos otorgados y deudas contraídas con personas como cuentas propias (desembolsos, abonos con capital e interés aparte, intereses causados calculados y condonación como gasto), con su consolidado, su detalle y su efecto en el patrimonio.

## Por qué existe este spec

REGLAS §7 se enmendó en los dos repos para que entren deudas y préstamos. Avisos, inversiones y tarjeta con ciclo siguen fuera.

Fija cuatro patrones:

- **Un préstamo es una cuenta** (RN-08). Es una fila de `cuentas` con tipo `prestamo_otorgado` (activo) o `deuda_contraida` (pasivo), saldo inicial 0 y una fila 1:1 en `prestamos` con la tasa y la fecha acordada. El capital pendiente es el saldo de esa cuenta: lo da `calcularSaldo` (RN-01, RN-02). El patrimonio de SPEC 03 y SPEC 06 lo incluye sin lógica nueva.
- **Todo es un movimiento normal.** El desembolso y el capital de un abono son transferencias entre una cuenta propia y la cuenta del préstamo (RN-07, RN-08). El interés es un ingreso o un gasto en la cuenta propia (RN-09). La condonación es un gasto con la cuenta del préstamo como origen (RN-17). Deshacer o corregir es `PUT`/`DELETE /movimientos/:id`, con historial (RN-13).
- **La persona es el nombre de la cuenta.** No hay tabla de personas. Prestar otra vez a quien ya tiene préstamo en ese sentido suma al mismo préstamo.
- **Los intereses causados se derivan, no se guardan.** Se calculan en `src/domain/prestamo/` desde la tasa, los tramos de capital y la fecha del último abono con interés. Solo se guarda el interés cobrado o pagado, como movimiento enlazado al préstamo en `prestamos_intereses`.

Cubre el inventario `specs/necesidades/deudas.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con:
  - tipos de cuenta `prestamo_otorgado` y `deuda_contraida`;
  - las tablas `prestamos`, `prestamos_intereses` y `prestamos_cambios`, y la vista `prestamos_detalle`;
  - las funciones `crear_prestamo` y `registrar_abono`;
  - los ajustes de índices, políticas y triggers de `cuentas`;
  - las categorías semilla «Intereses».
  - Todo con RLS.
- `GET /prestamos` (consolidado y lista) y `GET /prestamos/:id` (detalle e historial).
- `POST /prestamos` (alta) y `POST /prestamos/:id/desembolsos` (sumar a uno existente).
- `PATCH /prestamos/:id` (nombre y fecha acordada).
- `GET /prestamos/:id/propuesta-abono` y `POST /prestamos/:id/abonos`.
- `POST /prestamos/:id/condonaciones`.
- Cambios en módulos existentes:
  - `GET /cuentas` excluye los préstamos de sus grupos, agrega `prestamos` y los suma a `patrimonioNeto`;
  - `/cuentas/:id` trata un préstamo como inexistente;
  - `GET /resumen` acepta los tipos nuevos;
  - `POST /movimientos` y `POST`/`PUT /recurrentes` rechazan cuentas de préstamo;
  - `PUT`/`DELETE /movimientos/:id` protegen la forma y el capital de un préstamo.
- Dominio puro en `src/domain/prestamo/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/prestamos.e2e-spec.ts`.
- `docs/api/prestamos.md`. Se actualizan `cuentas.md`, `movimientos.md`, `recurrentes.md`, `resumen.md` y `README.md`.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- TRM, avisos y entradas a otros módulos (N-01, N-02, N-03).
- Préstamos en USD (N-100).
- Persona en la captura rápida, y marcar un gasto propio al registrarlo (N-101, captura N-44).
- Préstamos como líneas en la pantalla Cuentas (cuentas N-21, N-22).
- Cambiar la tasa después del alta.
- Eliminar un préstamo. Ninguna N-xx lo pide.
- Condonación de una deuda contraída (te perdonan): sería un ingreso y el diseño no la pide.
- Abono recurrente a una deuda (recurrentes N-78).
- Endpoint para consultar `prestamos_cambios`. Ninguna N-xx lo pide.
- Interés compuesto, tasas anuales o periodicidades distintas de la mensual.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_prestamos.sql`. Los montos son `text` cifrado (SPEC 05).

### Constantes

- Tipos de préstamo: `('prestamo_otorgado', 'deuda_contraida')`. En SQL se repite la lista. En el dominio vive `TIPOS_PRESTAMO` en `src/domain/prestamo/prestamo.ts`.

### Cambios en tablas y funciones existentes

- `public.naturaleza_de(tipo)`: `prestamo_otorgado` → `'activo'` y `deuda_contraida` → `'pasivo'`. Es el espejo de `naturalezaDe`, que ya los tiene.
- `cuentas.tipo`: el `check` admite `efectivo`, `banco`, `tarjeta_credito`, `prestamo_otorgado` y `deuda_contraida`. `cuentas_check` (cupo solo en tarjeta) no cambia.
- `cuentas_nombre_unico` se reemplaza por dos índices:
  - `cuentas_nombre_unico (usuario_id, lower(nombre)) where archivada_en is null and tipo not in (<préstamo>)`;
  - `cuentas_prestamo_nombre_unico (usuario_id, tipo, lower(btrim(nombre))) where tipo in (<préstamo>)`. «Mamá» puede tener un otorgado y una contraída. Un préstamo puede llamarse igual que una cuenta propia.
- Política `cuentas_insert_propia`: `with check (usuario_id = auth.uid() and tipo not in (<préstamo>))`. Una cuenta de préstamo solo nace en `crear_prestamo`.
- `impedir_cambio_naturaleza()`: además, si `old.tipo <> new.tipo` y alguno de los dos es de préstamo, lanza `raise exception 'TIPO_DE_PRESTAMO_FIJO'`.
- `asignar_posicion()` y `reordenar_cuentas()` ignoran las cuentas de préstamo (`tipo not in (<préstamo>)`). Así `PUT /cuentas/orden` sigue exigiendo solo las cuentas visibles.
- `insertar_semilla(p_usuario)`: agrega `('Intereses', 'gasto', 9)` e `('Intereses', 'ingreso', 4)`. Un bloque `do` las inserta en los perfiles existentes que no tengan una categoría de ese nombre y tipo, al final de su tipo (`max(posicion) + 1`).

### Tabla `public.prestamos`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `cuenta_id` | `uuid` | PK |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `tasa_mensual_cpb` | `integer` | not null, default `0`, `check (tasa_mensual_cpb between 0 and 10000)`. Centésimas de punto: 1 % = `100`, 1,5 % = `150`, 0 = sin intereses. |
| `fecha_acordada` | `date` | nullable |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `unique (usuario_id, cuenta_id)` (`prestamos_usuario_id_cuenta_id_key`).
- FK `(usuario_id, cuenta_id) → cuentas (usuario_id, id) on delete cascade` (`prestamos_cuenta_fkey`).
- Índice `prestamos_usuario_idx (usuario_id)`.
- RLS:
  - `prestamos_select_propio`;
  - `prestamos_update_propio`, con `using` y `with check` `usuario_id = auth.uid()`;
  - sin INSERT ni DELETE.
- Permisos de columna: `revoke update on prestamos from authenticated` y `grant update (fecha_acordada) on prestamos to authenticated`. La tasa queda fija desde el alta, garantizado en la BD.
- Triggers `marcar_actualizado` y `registrar_cambio_prestamo`.
- La tasa no es un monto y no se cifra (REGLAS §4 cifra importes).

### Tabla `public.prestamos_intereses`

Un fila por movimiento de interés (ingreso si te deben, gasto si debes).

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `movimiento_id` | `uuid` | PK |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `prestamo_id` | `uuid` | not null |
| `movimiento_capital_id` | `uuid` | nullable. El capital del mismo abono; nulo si el abono fue solo de interés. |
| `creado_en` | `timestamptz` | not null, default `now()` |

- FK `(usuario_id, movimiento_id) → movimientos (usuario_id, id) on delete cascade`. Borrar el movimiento de interés borra el enlace.
- FK `(usuario_id, prestamo_id) → prestamos (usuario_id, cuenta_id) on delete cascade`.
- FK `(usuario_id, movimiento_capital_id) → movimientos (usuario_id, id) on delete set null (movimiento_capital_id)`. Borrar el capital deja el interés como fila propia del historial.
- Índices: `prestamos_intereses_usuario_idx (usuario_id)`, `prestamos_intereses_prestamo_idx (usuario_id, prestamo_id)` y `prestamos_intereses_capital_idx (usuario_id, movimiento_capital_id)`.
- RLS: solo `prestamos_intereses_select_propio`. Las filas nacen en `registrar_abono` y mueren con su movimiento.

### Tabla `public.prestamos_cambios`

Historial de nombre y fecha acordada (RN-13), con la forma de `cuentas_cambios`.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `prestamo_id` | `uuid` | not null, **sin FK** |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `campo` | `text` | not null, `check (campo in ('nombre','fecha_acordada'))` |
| `valor_anterior` | `text` | nullable |
| `valor_nuevo` | `text` | nullable |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `prestamos_cambios_usuario_idx (usuario_id)` y `prestamos_cambios_prestamo_idx (prestamo_id)`.
- RLS: solo `prestamos_cambios_select_propio`.
- Triggers, `security definer` con `set search_path = ''`:
  - `registrar_cambio_prestamo()`: `after update of fecha_acordada on prestamos`. Si cambió, inserta `('fecha_acordada', old::text, new::text)`.
  - `registrar_cambio_nombre_prestamo()`: `after update of nombre on cuentas`, `when (old.tipo in (<préstamo>) and old.nombre is distinct from new.nombre)`. Inserta `('nombre', old.nombre, new.nombre)`.

### Vista `prestamos_detalle`

`with (security_invoker = true)`: `cuentas c join prestamos p on p.cuenta_id = c.id`, con `c.id`, `c.nombre`, `c.tipo`, `p.tasa_mensual_cpb`, `p.fecha_acordada`, `c.creado_en`.

### Función `crear_prestamo`

`privado.crear_prestamo(p_cuenta_id uuid, p_tipo text, p_nombre text, p_saldo_inicial text, p_tasa_mensual_cpb integer, p_fecha_acordada date, p_movimiento_id uuid, p_monto text, p_fecha date, p_cuenta_propia_id uuid, p_descripcion text) returns uuid`. Es `security definer` con `set search_path = ''` y tiene una envoltura `security invoker` en `public` con la misma firma. Permisos como `registrar_movimiento`.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Si `p_tipo` no es de préstamo, lanza `TIPO_INVALIDO:tipo`.
3. Si `p_cuenta_propia_id` no es una cuenta del usuario, lanza `CUENTA_INVALIDA:cuentaId`. Si es de préstamo, lanza `CUENTA_DE_PRESTAMO:cuentaId`.
4. Inserta la cuenta `(p_cuenta_id, usuario, p_tipo, btrim(p_nombre), p_saldo_inicial)`. `p_saldo_inicial` es el 0 cifrado con la AAD de la cuenta. Un `23505` sobre `cuentas_prestamo_nombre_unico` revierte todo.
5. Inserta `prestamos (p_cuenta_id, p_tasa_mensual_cpb, p_fecha_acordada)`.
6. Llama a `privado.registrar_movimiento(p_movimiento_id, 'transferencia', p_monto, p_fecha, p_descripcion, null, origen, destino, null, null)`:
   - en un otorgado, origen = la cuenta propia y destino = el préstamo;
   - en una contraída, origen = el préstamo y destino = la cuenta propia.
   - Esa llamada valida la cuenta archivada.
7. Devuelve `p_cuenta_id`.

### Función `registrar_abono`

`privado.registrar_abono(p_prestamo_id uuid, p_cuenta_propia_id uuid, p_fecha date, p_capital_id uuid, p_capital text, p_interes_id uuid, p_interes text, p_categoria_interes_id uuid, p_descripcion_capital text, p_descripcion_interes text) returns void`. Mismo esquema de seguridad, envoltura y permisos.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Lee el préstamo del usuario con su tipo. Si no existe, lanza `PRESTAMO_NO_ENCONTRADO`.
3. Valida la cuenta propia como en `crear_prestamo` (paso 3).
4. Si `p_capital` y `p_interes` son nulos los dos, lanza `ENTRADA_INVALIDA`.
5. Si hay capital, `registrar_movimiento(p_capital_id, 'transferencia', …)`:
   - en un otorgado, del préstamo a la cuenta propia;
   - en una contraída, de la cuenta propia al préstamo.
6. Si hay interés, `registrar_movimiento(p_interes_id, …)`:
   - en un otorgado, `ingreso` con destino la cuenta propia;
   - en una contraída, `gasto` con origen la cuenta propia;
   - en los dos casos con `p_categoria_interes_id`.
   - Después inserta `prestamos_intereses (p_interes_id, p_prestamo_id, p_capital_id)`.
7. Todo en una transacción: si un paso falla, no queda nada.

Desembolsos y condonaciones no necesitan función propia. El repositorio llama a `registrar_movimiento`. Los montos llegan cifrados con la AAD `movimientos|monto|<id>`.

### Reglas del dominio (`src/domain/prestamo/`)

Todas las fechas son días `"YYYY-MM-DD"` en la zona del perfil. `hoy` sale de `fechaLocal`.

- **Movimientos de capital:** los que tocan la cuenta del préstamo. Se clasifican así:
  - `desembolso`: transferencia que aumenta el capital. En un otorgado, destino = préstamo. En una contraída, origen = préstamo.
  - `abono`: transferencia que lo reduce.
  - `condonacion`: `gasto` con origen = préstamo. Solo existe en un otorgado.
- **Capital pendiente:** `calcularSaldo` de la cuenta, con todos sus movimientos. Siempre `≥ 0` (ver validaciones).
- **Estado:**
  - `saldado` si el capital es 0;
  - si no, `te_debe` en un otorgado y `le_debes` en una contraída.
- **Desde:** fecha del primer movimiento de capital posterior a la última vez que el capital corrido quedó en 0. Es nulo si está `saldado`.
- **Cierre:** solo en `saldado` con movimientos. Lleva la fecha del último movimiento de capital y su forma: `pago` si fue `abono` y `condonacion` si fue condonación.
- **Vencido:** `fechaAcordada !== null && fechaAcordada < hoy && capital > 0`.
- **Último abono:** fecha del último `abono`, o del último interés, si es posterior. Es nulo si no hay.
- **Totales:**
  - `totalPrestado` = Σ desembolsos.
  - `totalCondonado` = Σ condonaciones.
  - `totalAbonado` = Σ abonos + `totalCondonado`.
  - `interesesCobrados` = Σ montos de los movimientos de `prestamos_intereses` del préstamo.
- **Intereses causados a la fecha F:**
  - Si el capital corrido a F es 0, son 0 (N-69).
  - Si la tasa es 0, son 0.
  - Si no:
    - **Ancla A:** la fecha del último interés cobrado con fecha ≤ F. Sin ninguno, la del primer movimiento de capital.
    - **Capital del día d:** Σ efectos de capital con fecha ≤ d.
    - **Causados:** `redondear(Σ_{d ∈ [A, F)} capital(d) × tasa_cpb / 300000)`. Se calcula por tramos (capital × días), con una sola división y redondeo al peso, mitad hacia arriba. 300000 = 30 días × 10000.
  - Un interés cobrado salda todo lo causado hasta su fecha, aunque sea distinto de lo propuesto.
  - Una condonación parcial no cambia el ancla: los causados siguen sobre el nuevo capital (N-70).
- **Propuesta de abono** (fecha F, monto M):
  - `interes = min(M, causados(F))` y `capital = M − interes`.
  - Si `capital > capitalPendiente`, da `ABONO_EXCEDE_CAPITAL`.
- **Historial:**
  - Una fila por movimiento de capital.
  - Cada interés se une a la fila de su `movimiento_capital_id`. Sin capital, va como fila propia de clase `interes`.
  - Va por `fecha` asc y luego por `creado_en` asc.
  - `saldoCapital` es el capital corrido tras la fila.
  - El capital lleva signo: `+` en desembolso y `−` en abono y condonación.
- **Orden de la lista:**
  - `te_debe` y `le_debes` por capital desc y luego por nombre.
  - `saldado` por fecha de cierre desc (sin cierre al final) y luego por nombre.
  - Los grupos van en el orden `te_debe`, `le_debes`, `saldado`.
- **Consolidado:**
  - `teDeben` / `debes`: Σ capital, número de préstamos no saldados y Σ causados a hoy, de los otorgados / contraídas.
  - `debes.conIntereses`: alguna contraída no saldada tiene tasa > 0.
  - `posicionNeta = teDeben.total − debes.total`.
- **Tasa en el contrato:** string decimal con hasta dos decimales, entre `"0"` y `"100"`. `"1.5"` ↔ `150`. Se convierte con aritmética de enteros, sin `Number` ni `parseFloat`.

### Validaciones

- **Alta y desembolso:**
  - `monto` entero > 0;
  - nombre de 1 a 60 caracteres tras recortar;
  - `fecha` válida, por defecto hoy;
  - `fechaAcordada ≥ fecha` (`FECHA_ACORDADA_ANTERIOR`);
  - la tasa válida (`TASA_INVALIDA`);
  - la cuenta propia existe, no está archivada y no es de préstamo.
- **Abono:**
  - `capital` e `interes` enteros ≥ 0, con suma > 0 (`ABONO_VACIO`);
  - `capital ≤ capitalPendiente` (`ABONO_EXCEDE_CAPITAL`);
  - `fecha ≥` el primer movimiento de capital (`FECHA_ANTERIOR_AL_PRESTAMO`);
  - el préstamo no está saldado (`PRESTAMO_SALDADO`);
  - la cuenta propia, como en el alta.
- **Condonación:**
  - solo en un otorgado (`CONDONACION_NO_PERMITIDA`);
  - no saldado (`PRESTAMO_SALDADO`);
  - `monto` entero > 0 y `≤ capitalPendiente` (`CONDONACION_EXCEDE_CAPITAL`);
  - `categoriaId` de gasto del usuario.
  - La fecha es hoy.
- **Cambio:**
  - `nombre` como en el alta, sin chocar con otro préstamo del mismo tipo (`PRESTAMO_EXISTENTE`);
  - `fechaAcordada` puede ser `null`;
  - un cuerpo sin campos da `SIN_CAMBIOS`.
- **Movimientos desde `/movimientos` y `/recurrentes`** (N-95, N-96):
  - `POST /movimientos` y `POST`/`PUT /recurrentes` con una cuenta de préstamo dan `CUENTA_DE_PRESTAMO`.
  - `PUT /movimientos/:id` de un movimiento que toca un préstamo:
    - no cambia `tipo` ni saca el préstamo de su campo (`MOVIMIENTO_DE_PRESTAMO`);
    - la cuenta propia puede cambiar, pero no a otra de préstamo (`CUENTA_DE_PRESTAMO`).
  - `PUT /movimientos/:id` de un movimiento de `prestamos_intereses` no cambia `tipo` (`MOVIMIENTO_DE_PRESTAMO`).
  - `PUT` o `DELETE /movimientos/:id` que deja negativo el capital final de un préstamo da `CAPITAL_NEGATIVO`. Ejemplo: borrar el desembolso cuando ya hay abonos.

### Descripciones de los movimientos

Las fija el servicio. El nombre va recortado.

| Movimiento | Otorgado | Contraída |
|---|---|---|
| Desembolso | `Préstamo a <nombre>` | `Préstamo de <nombre>` |
| Capital de un abono | `Abono de <nombre>` | `Abono a <nombre>` |
| Interés | `Intereses de <nombre>` | `Intereses a <nombre>` |
| Condonación | `Condonación a <nombre>` | — |

### Categoría del interés

- Sin `categoriaInteresId` en el cuerpo, el servicio busca la categoría «Intereses» del tipo (`ingreso` en un otorgado, `gasto` en una contraída). Si el usuario la renombró o borró, va `null` («sin clasificar»).
- Con `categoriaInteresId`, usa esa. Con `null` explícito, va sin categoría.

### Tipos de dominio (`src/domain/prestamo/prestamo.ts`)

```ts
type TipoPrestamo = "prestamo_otorgado" | "deuda_contraida";
type EstadoPrestamo = "te_debe" | "le_debes" | "saldado";
type ClaseMovimientoPrestamo = "desembolso" | "abono" | "condonacion" | "interes";
type Prestamo = { id: string; nombre: string; tipo: TipoPrestamo; tasaCpb: number; fechaAcordada: string | null; creadoEn: Date };
type MovimientoDePrestamo = { id: string; tipo: TipoMovimiento; monto: bigint; fecha: string; creadoEn: Date; cuentaOrigenId: string | null; cuentaDestinoId: string | null; categoria: Ref | null };
type InteresDePrestamo = { movimientoId: string; movimientoCapitalId: string | null; monto: bigint; fecha: string; creadoEn: Date; cuenta: Ref };
```

### Contrato HTTP

Convenciones de `docs/api/README.md`: montos como string entero, fechas `"YYYY-MM-DD"` en la zona del usuario y `ErrorApi`.

```ts
type Ref = { id: string; nombre: string };
type TipoPrestamo = "prestamo_otorgado" | "deuda_contraida";
type EstadoPrestamo = "te_debe" | "le_debes" | "saldado";

type PrestamoResumenDto = {
  id: string;                     // id de la cuenta del préstamo
  nombre: string;                 // la persona
  tipo: TipoPrestamo;
  estado: EstadoPrestamo;
  capitalPendiente: string;       // "0" si saldado; positivo también en le_debes
  desde: string | null;           // null si saldado
  fechaAcordada: string | null;
  vencido: boolean;
  cierre: { fecha: string; forma: "pago" | "condonacion" } | null;
  interesesCausados: string;      // a hoy; "0" sin tasa o saldado
};

type PrestamosDto = {
  fechaHoy: string;
  teDeben: { total: string; personas: number; interesesCausados: string };
  debes: { total: string; personas: number; interesesCausados: string; conIntereses: boolean };
  posicionNeta: string;           // puede ser negativa
  prestamos: PrestamoResumenDto[];
};

type MovimientoPrestamoDto = {
  fecha: string;
  clase: "desembolso" | "abono" | "condonacion" | "interes";
  cuenta: Ref | null;             // la cuenta propia; null en condonación
  categoria: Ref | null;          // condonación: categoría del gasto
  capital: string;                // con signo; "0" en clase interes
  interes: string;                // "0" si no hay
  saldoCapital: string;
  movimientoId: string | null;    // el de capital; null en clase interes
  movimientoInteresId: string | null;
};

type PrestamoDetalleDto = PrestamoResumenDto & {
  fechaHoy: string;
  tasaMensual: string;            // "0", "1", "1.5"
  totalPrestado: string;
  totalAbonado: string;           // abonos a capital + condonaciones
  totalCondonado: string;         // > 0 → rótulo «Abonos y condonación»
  interesesCobrados: string;      // pagados, en una contraída
  ultimoAbono: string | null;
  historial: MovimientoPrestamoDto[];
  creadoEn: string;
};

type PrestamoCuerpo = {           // POST /prestamos
  tipo: TipoPrestamo;
  nombre: string;
  monto: string;                  // ^\d{1,19}$, > 0
  cuentaId: string;               // cuenta propia
  fecha?: string;                 // default hoy
  tasaMensual?: string;           // default "0"
  fechaAcordada?: string | null;
};

type DesembolsoCuerpo = { monto: string; cuentaId: string; fecha?: string };
type PrestamoCambio = { nombre?: string; fechaAcordada?: string | null };
type PropuestaAbonoDto = { fecha: string; monto: string; capital: string; interes: string; interesesCausados: string; capitalPendiente: string };
type AbonoCuerpo = { cuentaId: string; fecha: string; capital: string; interes: string; categoriaInteresId?: string | null };
type CondonacionCuerpo = { monto: string; categoriaId: string };
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /prestamos` | — | `200 PrestamosDto` |
| `GET /prestamos/:id` | — | `200 PrestamoDetalleDto` |
| `POST /prestamos` | `PrestamoCuerpo` | `201 PrestamoDetalleDto` |
| `POST /prestamos/:id/desembolsos` | `DesembolsoCuerpo` | `201 PrestamoDetalleDto` |
| `PATCH /prestamos/:id` | `PrestamoCambio` | `200 PrestamoDetalleDto` |
| `GET /prestamos/:id/propuesta-abono` | `?fecha=YYYY-MM-DD&monto=` | `200 PropuestaAbonoDto` |
| `POST /prestamos/:id/abonos` | `AbonoCuerpo` | `201 PrestamoDetalleDto` |
| `POST /prestamos/:id/condonaciones` | `CondonacionCuerpo` | `201 MovimientoDto` (SPEC 04) |

- `GET /prestamos` trae todos los préstamos, saldados incluidos. Los nombres de la lista son las personas existentes (N-78).
- Un desembolso sobre un préstamo saldado lo reabre.
- Deshacer una condonación es `DELETE /movimientos/:id` con el `id` del `MovimientoDto`.
- «Ver movimientos» de un saldado usa `historial`: cada fila trae sus ids para abrir el movimiento.
- Los textos relativos («hace 27 días», «89 días») los arma el cliente con `fechaHoy`.

### Cambios en contratos existentes

- `GET /cuentas` (`CuentasDto`):
  - `activos` y `pasivos` no incluyen préstamos;
  - nuevo campo `prestamos: { teDeben: string; debes: string }`;
  - `patrimonioNeto = activos.total − pasivos.total + prestamos.teDeben − prestamos.debes`.
- `PATCH`/`DELETE /cuentas/:id`, `archivar` y `restaurar` con el id de un préstamo dan `404 CUENTA_NO_ENCONTRADA`. `PATCH /perfil` con un préstamo como cuenta predeterminada falla igual que con una cuenta inexistente.
- `GET /resumen`: sin cambios de forma. El patrimonio y su serie incluyen los préstamos. Intereses y condonaciones cuentan como ingreso o gasto; desembolsos y abonos no (RN-05).
- `POST /movimientos`, `PUT /movimientos/:id`, `DELETE /movimientos/:id`, `POST /recurrentes` y `PUT /recurrentes/:id`: los errores nuevos de las validaciones.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `PRESTAMO_NO_ENCONTRADO` | 404 | — | «El préstamo no existe.» |
| `PRESTAMO_EXISTENTE` | 409 | `nombre` | «Ya tienes un préstamo con esa persona en ese sentido. Súmale un desembolso.» |
| `TASA_INVALIDA` | 400 | `tasaMensual` | «La tasa es un porcentaje entre 0 y 100, con hasta dos decimales.» |
| `FECHA_ACORDADA_ANTERIOR` | 400 | `fechaAcordada` | «La fecha acordada no puede ser anterior al préstamo.» |
| `ABONO_VACIO` | 400 | `capital` | «El abono tiene que ser mayor que cero.» |
| `ABONO_EXCEDE_CAPITAL` | 422 | `capital` | «El abono a capital supera lo pendiente.» |
| `FECHA_ANTERIOR_AL_PRESTAMO` | 400 | `fecha` | «La fecha no puede ser anterior al préstamo.» |
| `PRESTAMO_SALDADO` | 409 | — | «Este préstamo ya está saldado.» |
| `CONDONACION_NO_PERMITIDA` | 422 | — | «Solo se condona lo que te deben.» |
| `CONDONACION_EXCEDE_CAPITAL` | 422 | `monto` | «No puedes condonar más de lo pendiente.» |
| `CUENTA_DE_PRESTAMO` | 422 | el de la cuenta | «Esa cuenta es un préstamo. Regístralo desde Deudas.» |
| `MOVIMIENTO_DE_PRESTAMO` | 422 | `tipo` | «Este movimiento es de un préstamo: no cambia de tipo ni de préstamo.» |
| `CAPITAL_NEGATIVO` | 422 | — | «El cambio deja el préstamo con capital negativo.» |

Se reutilizan:

- `TIPO_INVALIDO`, `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `MONTO_REQUERIDO`, `MONTO_INVALIDO`;
- `FECHA_INVALIDA` (con campo `fecha`, `fechaAcordada` o `fecha` de la consulta);
- `CUENTA_INVALIDA`, `CUENTA_ARCHIVADA`, `CATEGORIA_INVALIDA`, `SIN_CAMBIOS`, `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

Traducciones en los repositorios:

- `<CODIGO>[:<campo>]` lanzado por `crear_prestamo` o `registrar_abono` → su código y campo. `CUENTA_ARCHIVADA:cuentaOrigenId|cuentaDestinoId`, cuando viene de una de estas funciones, sale con `campo` `cuentaId`.
- `23505` sobre `cuentas_prestamo_nombre_unico` → `PRESTAMO_EXISTENTE`.
- `23503` sobre la FK de categoría de `movimientos` → `CATEGORIA_INVALIDA`.
- Fila no visible por RLS → `PRESTAMO_NO_ENCONTRADO`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_prestamos.sql
src/
  app.module.ts                          # + PrestamosModule
  comun/error-api.ts                     # + códigos nuevos
  prestamos/
    prestamos.controller.ts
    prestamos.service.ts
    prestamos.module.ts
    esquemas.ts                          # Zod: cuerpos, :id, propuesta
    dto.ts
  cuentas/cuentas.service.ts, dto.ts     # prestamos + patrimonio
  movimientos/movimientos.service.ts     # CUENTA_DE_PRESTAMO, MOVIMIENTO_DE_PRESTAMO, CAPITAL_NEGATIVO
  recurrentes/recurrentes.service.ts     # CUENTA_DE_PRESTAMO
  domain/
    cuenta/cuenta.ts                     # tipos de cuenta en alcance + préstamo
    resumen/resumen.ts                   # acepta tipos de préstamo
    prestamo/
      prestamo.ts                        # tipos, TIPOS_PRESTAMO
      tasa.ts (+ .test.ts)               # "1.5" ↔ 150
      historial.ts (+ .test.ts)          # clasificar, historial, totales, desde, cierre, último abono
      intereses.ts (+ .test.ts)          # causadosEn, propuestaAbono
      consolidado.ts (+ .test.ts)        # estado, orden, teDeben/debes/posicionNeta
      validar.ts (+ .test.ts)            # alta, abono, condonación, cambio, cambio de movimiento
    fecha/mes.ts (+ mes.test.ts)         # + diasEntre si hace falta
  repositories/supabase/
    prestamos.repository.ts              # cifra/descifra, rpc crear_prestamo y registrar_abono
    cuentas.repository.ts                # filtra tipos de préstamo
    resumen.repository.ts                # acepta tipos de préstamo
    movimientos.repository.ts            # tipos de cuenta y enlaces de interés para las validaciones
    tipos.ts                             # regenerado
test/
  aislamiento.e2e-spec.ts                # ampliado (no se borra ni se desactiva)
  prestamos.e2e-spec.ts
docs/api/
  prestamos.md, README.md, cuentas.md, movimientos.md, recurrentes.md, resumen.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_prestamos.sql` según el modelo. **El autor la revisa antes del paso 2** (REGLAS §8).
2. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con un préstamo con desembolso y abono con interés, el otro:
   - no ve las cuentas de préstamo, `prestamos`, `prestamos_detalle`, `prestamos_intereses` ni `prestamos_cambios` ajenos;
   - no consigue que `crear_prestamo` use una cuenta propia ajena (`CUENTA_INVALIDA`);
   - recibe `PRESTAMO_NO_ENCONTRADO` al llamar a `registrar_abono` sobre el préstamo ajeno;
   - afecta 0 filas al hacer UPDATE de `prestamos` ajeno.
   - Además:
     - un INSERT directo en `cuentas` con tipo de préstamo falla por RLS;
     - un UPDATE directo de `tasa_mensual_cpb` falla por permisos;
     - un INSERT directo en `prestamos` o `prestamos_intereses` falla.
   - `npm test` en verde.
4. `domain/prestamo/prestamo.ts` y `tasa.ts` con pruebas: `"0"`→0, `"1"`→100, `"1.5"`→150, `"0.25"`→25, `"100"`→10000; `"100.01"`, `"-1"`, `"1.234"` y `"abc"` son inválidas; 150 → `"1.5"`.
5. `historial.ts` con pruebas, con el ejemplo del diseño (Camila y Mamá):
   - clases;
   - saldo corrido;
   - totales;
   - `desde` tras reabrir;
   - `cierre` por pago y por condonación;
   - interés unido a su capital y como fila propia cuando el capital se borró.
6. `intereses.ts` con pruebas:
   - Desembolso de 600.000 el `2026-08-14`, abono el `2026-10-02` con capital 100.000 e interés 12.000, tasa 100: los causados al `2026-11-11` son `6667n`.
   - Tasa 0 → 0.
   - Capital 0 → 0.
   - Una condonación parcial baja el tramo sin mover el ancla.
   - Un abono solo de capital no mueve el ancla.
   - Redondeo de x,5 hacia arriba.
   - Propuesta: interés limitado por el monto; `ABONO_EXCEDE_CAPITAL`.
7. `consolidado.ts` con pruebas: estados, orden de grupos y de filas, totales, `conIntereses` y `posicionNeta` negativa.
8. `validar.ts` con pruebas: cada código de la tabla y las reglas de cambio de movimiento (`MOVIMIENTO_DE_PRESTAMO`, `CAPITAL_NEGATIVO`).
9. Agregar los códigos a `error-api.ts`. Ampliar los tipos de cuenta del dominio. `cuentas.repository.ts` filtra los tipos de préstamo en todas sus lecturas. `resumen.repository.ts` acepta los tipos nuevos. `GET /cuentas` agrega `prestamos` y los suma al patrimonio. Las e2e de cuentas, movimientos y resumen siguen en verde.
10. `prestamos.repository.ts`:
    - lee `prestamos_detalle`, los movimientos que tocan las cuentas de préstamo (`movimientos_detalle`) y los intereses con sus movimientos;
    - descifra con la AAD de cada fila;
    - llama por `rpc` a `crear_prestamo` y `registrar_abono`, y a `registrar_movimiento` para desembolsos y condonaciones;
    - traduce los errores.
11. `src/prestamos/` con `GET /prestamos` y `GET /prestamos/:id`. El servicio resuelve la zona y `hoy`, llama al dominio y arma los DTO.
12. `POST /prestamos`, `POST /prestamos/:id/desembolsos` y `PATCH /prestamos/:id`. El servicio valida, genera los ids, cifra y fija las descripciones.
13. `GET /prestamos/:id/propuesta-abono` y `POST /prestamos/:id/abonos`. La validación del capital se hace contra una lectura fresca del préstamo. La categoría del interés se resuelve por defecto.
14. `POST /prestamos/:id/condonaciones`: valida, registra el gasto de hoy y devuelve la fila de `movimientos_detalle`.
15. Validaciones en `movimientos.service.ts` y `recurrentes.service.ts`: `CUENTA_DE_PRESTAMO`, `MOVIMIENTO_DE_PRESTAMO` y `CAPITAL_NEGATIVO`.
16. `test/prestamos.e2e-spec.ts` con los criterios de aceptación. Se omite con aviso si falta `SUPABASE_SECRET_KEY`.
17. `docs/api/`:
    - crear `prestamos.md`;
    - `cuentas.md`: `prestamos`, patrimonio y préstamos invisibles en `/cuentas/:id`;
    - `movimientos.md`: errores nuevos y movimientos de préstamo;
    - `recurrentes.md`: `CUENTA_DE_PRESTAMO`;
    - `resumen.md`: el patrimonio incluye préstamos;
    - agregar la fila en `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | Fuera de alcance: USD hasta inversiones. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04. |
| N-05 | Navegación del cliente; `GET /prestamos` alimenta la pantalla. |
| N-06 | `PrestamosDto.teDeben.total`. |
| N-07 | `teDeben.personas`. |
| N-08 | `teDeben.interesesCausados` (no entra en el patrimonio). |
| N-09 | `teDeben.personas === 0`. |
| N-10 | `debes.total`. |
| N-11 | `debes.personas`. |
| N-12 | `debes.interesesCausados` y `debes.conIntereses`. |
| N-13 | `posicionNeta`. |
| N-14 | Signo de `posicionNeta`; la leyenda es del cliente. |
| N-15 | `PrestamoResumenDto.estado`; el cliente agrupa. Se incluyen todos los saldados. |
| N-16 | `teDeben.total` y `debes.total`. |
| N-17 | Orden de `prestamos` (dominio `consolidado.ts`). |
| N-18 | `PrestamoResumenDto.nombre`. |
| N-19 | `tipo` y `estado`. |
| N-20 | `capitalPendiente` (`calcularSaldo`, RN-01). |
| N-21 | `desde` + `fechaHoy`. |
| N-22 | `cierre.fecha` y `cierre.forma`. |
| N-23 | `vencido` y `fechaAcordada`. |
| N-24 | `PrestamoResumenDto.id` → `GET /prestamos/:id`. |
| N-25 | `PrestamoDetalleDto.tipo` y `estado`. |
| N-26 | `PrestamoDetalleDto.nombre`. |
| N-27 | `PrestamoDetalleDto.capitalPendiente`. |
| N-28 | `totalPrestado`. |
| N-29 | `totalAbonado`. |
| N-30 | `totalCondonado > 0`. |
| N-31 | `tasaMensual`; `"0"` = «Sin intereses». |
| N-32 | `interesesCobrados`. |
| N-33 | `PrestamoDetalleDto.interesesCausados` (dominio `intereses.ts`). |
| N-34 | `fechaAcordada`. |
| N-35 | `vencido`, `fechaAcordada` y `fechaHoy`. |
| N-36 | `ultimoAbono`. |
| N-37 | `historial[].fecha`. |
| N-38 | `historial[].clase`, `cuenta` y `categoria`. |
| N-39 | `historial[].capital`. |
| N-40 | `historial[].interes`. |
| N-41 | `historial[].saldoCapital`. |
| N-42 | Orden de `historial`: `fecha` asc y luego `creado_en`. |
| N-43 | `POST /prestamos/:id/abonos`; el formulario es del cliente. |
| N-44 | `AbonoCuerpo.cuentaId`. |
| N-45 | `AbonoCuerpo.fecha`. |
| N-46 | `monto` de la consulta de `propuesta-abono`. |
| N-47 | `GET /prestamos/:id/propuesta-abono` → `capital` e `interes`. |
| N-48 | `AbonoCuerpo.capital` e `interes`. |
| N-49 | `registrar_abono`: transferencia + ingreso o gasto, con «Intereses» por defecto (RN-08, RN-09). |
| N-50 | `ABONO_VACIO`, `MONTO_INVALIDO`. |
| N-51 | `ABONO_EXCEDE_CAPITAL`. |
| N-52 | `CUENTA_INVALIDA`, `CUENTA_ARCHIVADA` y `CUENTA_DE_PRESTAMO`. |
| N-53 | `FECHA_ANTERIOR_AL_PRESTAMO`. |
| N-54 | `estado: "saldado"` con capital 0; `cierre.forma: "pago"`. |
| N-55 | RN-01: `GET /prestamos`, `GET /cuentas` y `GET /resumen` recalculan en cada lectura. |
| N-56 | `PATCH /prestamos/:id { fechaAcordada }` (`null` la quita). |
| N-57 | `PATCH /prestamos/:id { nombre }`. |
| N-58 | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO` y `PRESTAMO_EXISTENTE` (único por tipo). |
| N-59 | `historial` del detalle, con `movimientoId` y `movimientoInteresId`. |
| N-60 | `estado: "saldado"`; abonar o condonar da `PRESTAMO_SALDADO`. |
| N-61 | `tipo: "prestamo_otorgado"` y capital > 0; `CONDONACION_NO_PERMITIDA`, `PRESTAMO_SALDADO`. |
| N-62 | `capitalPendiente` como `monto` de la condonación. |
| N-63 | `CondonacionCuerpo.monto`. |
| N-64 | `MONTO_INVALIDO` y `CONDONACION_EXCEDE_CAPITAL` (ver choques). |
| N-65 | `CondonacionCuerpo.categoriaId`. |
| N-66 | Ya cubierto por SPEC 04 (categorías de gasto). |
| N-67 | `GET /cuentas` → `patrimonioNeto`, que ya incluye préstamos. |
| N-68 | `POST /prestamos/:id/condonaciones` → `gasto` de hoy con origen el préstamo (RN-17). |
| N-69 | Con capital 0, `estado: "saldado"`, `cierre.forma: "condonacion"` y causados 0, sin gasto por intereses. |
| N-70 | Regla de causados: la condonación no mueve el ancla. |
| N-71 | `201 MovimientoDto` (`monto`, `categoria`). |
| N-72 | `DELETE /movimientos/:id` (SPEC 04); foto en `movimientos_cambios`. |
| N-73 | `PRESTAMO_NO_ENCONTRADO`. |
| N-74 | Validación sobre una lectura fresca: `PRESTAMO_SALDADO`, `ABONO_EXCEDE_CAPITAL` y `CONDONACION_EXCEDE_CAPITAL`. |
| N-75 | `POST /prestamos`. |
| N-76 | `PrestamoCuerpo.tipo`. |
| N-77 | `POST /prestamos` (persona nueva) o `POST /prestamos/:id/desembolsos` (existente). |
| N-78 | `GET /prestamos` → `nombre`, `tipo` e `id` de cada préstamo. |
| N-79 | `PrestamoCuerpo.monto`. |
| N-80 | `PrestamoCuerpo.cuentaId` → transferencia (RN-08). |
| N-81 | `PrestamoCuerpo.fecha`. |
| N-82 | `PrestamoCuerpo.tasaMensual` → `tasa_mensual_cpb`, fija por permisos de columna. |
| N-83 | `PrestamoCuerpo.fechaAcordada`. |
| N-84 | `POST /prestamos/:id/desembolsos`; reabre un saldado. |
| N-85 | `MONTO_REQUERIDO` y `MONTO_INVALIDO`. |
| N-86 | `NOMBRE_REQUERIDO` y `NOMBRE_LARGO`. |
| N-87 | `CUENTA_INVALIDA`, `CUENTA_ARCHIVADA` y `CUENTA_DE_PRESTAMO`. |
| N-88 | `TASA_INVALIDA`. |
| N-89 | `FECHA_ACORDADA_ANTERIOR`. |
| N-90 | `GET /prestamos` sin préstamos: totales `"0"`, personas 0 y `posicionNeta` `"0"`. |
| N-91 | `prestamos: []`. |
| N-92 | `POST /prestamos` con el `tipo` elegido. |
| N-93 | `POST /prestamos` con `tipo: "deuda_contraida"`. |
| N-94 | `GET /cuentas` → `prestamos` y `patrimonioNeto`. `GET /resumen` → `patrimonioEn` con los tipos de préstamo. Los causados no se suman. |
| N-95 | `GET /cuentas` los excluye; `/cuentas/:id` da 404; `CUENTA_DE_PRESTAMO` en `POST /movimientos` y `/recurrentes`. |
| N-96 | `PUT`/`DELETE /movimientos/:id` con `MOVIMIENTO_DE_PRESTAMO` y `CAPITAL_NEGATIVO`; el historial sale de `movimientos_cambios` (RN-13). |
| N-97 | `prestamos_cambios` por `registrar_cambio_prestamo` y `registrar_cambio_nombre_prestamo`. |
| N-98 | El interés es ingreso o gasto, la condonación es gasto y el capital es transferencia: `GET /resumen` sin cambios de lógica (RN-05, RN-09). |
| N-99 | RLS, FK compuestas, permisos de columna y `test/aislamiento.e2e-spec.ts` (RN-12). |
| N-100 | Fuera de alcance: movimientos solo en COP (SPEC 04). |
| N-101 | Fuera de alcance: persona en la captura (duda resuelta en el inventario). |

Endpoint → N-xx:

- `GET /prestamos`: N-06, N-15, N-78, N-90.
- `GET /prestamos/:id`: N-24, N-37, N-59.
- `POST /prestamos`: N-75, N-92.
- `POST /prestamos/:id/desembolsos`: N-84.
- `PATCH /prestamos/:id`: N-56, N-57.
- `GET /prestamos/:id/propuesta-abono`: N-47.
- `POST /prestamos/:id/abonos`: N-43.
- `POST /prestamos/:id/condonaciones`: N-68.
- Cambios en `GET /cuentas`: N-67, N-94, N-95.
- Cambios en `POST /movimientos` y `/recurrentes`: N-95.
- Cambios en `PUT`/`DELETE /movimientos/:id`: N-96.

## Criterios de aceptación

`H` es hoy en la zona del perfil. `H−n` es n días antes. Cuentas: Nequi (banco, saldo inicial `"1000000"`) y Bancolombia (banco, saldo inicial `"2000000"`).

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre las tablas, la vista ni las funciones nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3.
- [ ] Un perfil nuevo tiene las categorías «Intereses» de gasto y de ingreso. Un perfil existente también las tiene tras la migración.
- [ ] `GET /prestamos` sin préstamos → `200` con `teDeben.total` `"0"`, `debes.total` `"0"`, `posicionNeta` `"0"` y `prestamos: []`.
- [ ] `POST /prestamos` de un otorgado a «Camila» de `"600000"` desde Nequi, fecha `H−60`, `tasaMensual: "1"`, `fechaAcordada` `H−27`:
  - responde `201` con `estado: "te_debe"`, `capitalPendiente` `"600000"`, `desde` `H−60` y `vencido: true`;
  - Nequi queda en `"400000"` en `GET /cuentas`;
  - Camila no aparece en `activos`;
  - `prestamos.teDeben` es `"600000"`;
  - `patrimonioNeto` no cambia.
- [ ] Repetir `POST /prestamos` con «camila» y el mismo tipo → `409 PRESTAMO_EXISTENTE`. Con `tipo: "deuda_contraida"`, responde `201`.
- [ ] `GET /prestamos/:id/propuesta-abono?fecha=H−40&monto=112000` → `interes` `"4000"` y `capital` `"108000"`. Son 600.000 × 20 días × 1 % / 30 = 4.000.
- [ ] `POST /prestamos/:id/abonos` con Nequi, fecha `H−40`, `capital: "100000"` e `interes: "12000"`:
  - responde `201`;
  - deja una transferencia «Abono de Camila» y un ingreso «Intereses de Camila» con la categoría «Intereses»;
  - Nequi queda en `"512000"`;
  - el detalle trae `capitalPendiente` `"500000"`, `interesesCobrados` `"12000"` e `interesesCausados` `"6667"`;
  - el historial trae dos filas: `+600000` (saldo `"600000"`) y `−100000` con interés `"12000"` (saldo `"500000"`).
- [ ] `GET /resumen` del mes de `H−40` cuenta el interés como ingreso. No cuenta ni el desembolso ni el abono.
- [ ] Un abono con `capital: "600000"` → `422 ABONO_EXCEDE_CAPITAL`. Con capital e interés en `"0"` → `400 ABONO_VACIO`. Con fecha `H−61` → `400 FECHA_ANTERIOR_AL_PRESTAMO`. Con Nequi archivada → `409 CUENTA_ARCHIVADA` y no crea ningún movimiento.
- [ ] `POST /prestamos/:id/condonaciones { monto: "200000", categoriaId: <Otros gastos> }`:
  - responde `201 MovimientoDto`, un `gasto` con fecha `H`;
  - el capital queda en `"300000"`;
  - `totalCondonado` es `"200000"`;
  - `patrimonioNeto` baja 200.000.
- [ ] `DELETE /movimientos/:id` de esa condonación devuelve el capital a `"500000"` y deja una fila `eliminacion` en `movimientos_cambios`.
- [ ] Condonar `"500000"`:
  - deja `estado: "saldado"`, `cierre: { fecha: H, forma: "condonacion" }` e `interesesCausados` `"0"`;
  - no crea un gasto por los intereses;
  - un nuevo abono o condonación → `409 PRESTAMO_SALDADO`.
- [ ] `POST /prestamos/:id/desembolsos` de `"50000"` sobre el saldado:
  - lo reabre en `te_debe` con capital `"50000"`;
  - `desde` es la fecha del desembolso.
- [ ] Condonar sobre una `deuda_contraida` → `422 CONDONACION_NO_PERMITIDA`.
- [ ] Una contraída de «Mamá» de `"900000"` hacia Bancolombia, sin tasa:
  - aumenta Bancolombia a `"2900000"`;
  - `debes.total` es `"900000"` y `debes.conIntereses` es `false`;
  - `posicionNeta` es `te deben − 900000`.
  - Un abono de `"200000"` desde Bancolombia baja la deuda a `"700000"`.
- [ ] `PATCH /prestamos/:id { fechaAcordada: null }` deja `vencido: false` y una fila `fecha_acordada` en `prestamos_cambios`. `PATCH { nombre: "Camila Ortiz" }` deja una fila `nombre`. `PATCH {}` → `400 SIN_CAMBIOS`.
- [ ] `tasaMensual: "1.234"` → `400 TASA_INVALIDA`. Una `fechaAcordada` anterior a `fecha` → `400 FECHA_ACORDADA_ANTERIOR`.
- [ ] `POST /movimientos` con la cuenta de Camila como destino → `422 CUENTA_DE_PRESTAMO`. Lo mismo con `POST /recurrentes`.
- [ ] `PUT /movimientos/:id` del abono:
  - si cambia el monto a `"80000"`, responde `200` y el capital sube 20.000;
  - si cambia el tipo a `gasto`, responde `422 MOVIMIENTO_DE_PRESTAMO`.
- [ ] `DELETE /movimientos/:id` del desembolso de Camila con abonos vivos → `422 CAPITAL_NEGATIVO`.
- [ ] `DELETE /movimientos/:id` del capital de un abono con interés deja el interés como fila `clase: "interes"` en el historial.
- [ ] `PATCH /cuentas/:id` y `DELETE /cuentas/:id` con el id de Camila → `404 CUENTA_NO_ENCONTRADA`. `PUT /cuentas/orden` con solo Nequi y Bancolombia en `activo` → `204`.
- [ ] `GET /resumen` → `patrimonio.hoy` coincide con `patrimonioNeto` de `GET /cuentas` (sin movimientos futuros).
- [ ] Un id ajeno en cualquier ruta `/prestamos/:id` → `404 PRESTAMO_NO_ENCONTRADO`.
- [ ] En la BD, los montos de los movimientos de préstamo cumplen `^v1\.`. `prestamos` no tiene columnas de monto.
- [ ] Ninguna ruta devuelve texto de Postgres en `mensaje`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún monto ni tasa pasa por `number` en un cálculo.
- [ ] `docs/api/prestamos.md` existe y `README.md` lo enlaza.

## Decisiones

- **Sí:** se enmienda REGLAS §7 para que entren deudas y préstamos.
- **Sí:** un préstamo es una cuenta de tipo `prestamo_otorgado` o `deuda_contraida` más una fila 1:1 en `prestamos` (RN-08). El saldo, el patrimonio y el resumen reutilizan `calcularSaldo` y `patrimonioEn`. **No:** columnas de tasa en `cuentas` (ensucian una tabla que no las usa). **No:** una tabla propia con `movimientos.prestamo_id` (reescribe saldo y patrimonio).
- **Sí:** la persona es el nombre de la cuenta, único por usuario y tipo. **No:** una tabla `personas`. Llega si la captura rápida asocia personas.
- **Sí:** prestar otra vez a la misma persona en el mismo sentido suma al mismo préstamo, que se reabre si estaba saldado.
- **Sí:** dos rutas, `POST /prestamos` (nuevo) y `POST /prestamos/:id/desembolsos` (existente). **No:** una ruta que busque por nombre y decida.
- **Sí:** intereses causados derivados en el dominio: interés simple, mes de 30 días, sobre tramos de capital, desde el último abono con interés. Cuadra con el diseño (6.667). **No:** acumulado menos pagado (daría 4.467). **No:** guardar causados.
- **Sí:** un interés cobrado salda lo causado hasta su fecha, sea cual sea su monto. La propuesta lo calcula y el usuario la ajusta.
- **Sí:** con capital 0 los causados son 0. Saldar o condonar todo deja de cobrarlos sin registrar gasto: nunca entraron al patrimonio (N-69).
- **Sí:** el interés es un movimiento normal (ingreso o gasto) enlazado en `prestamos_intereses`, con `movimiento_capital_id on delete set null (columna)`. **No:** una columna en `movimientos`.
- **Sí:** «Intereses» de ingreso y de gasto en la semilla, con backfill, como categoría por defecto del abono y reemplazable por `categoriaInteresId`. **No:** categoría obligatoria, porque frena la captura (REGLAS §1, diez segundos).
- **Sí:** tasa en centésimas de punto, `integer`, sin cifrar: no es un monto. **No:** `numeric` ni coma flotante.
- **Sí:** la tasa queda fija desde el alta, garantizado por permisos de columna. Solo `fecha_acordada` es actualizable en `prestamos`.
- **Sí:** el nombre se cambia en `cuentas` por RLS directa, y la fecha acordada en `prestamos`. Los dos cambios quedan en `prestamos_cambios` por trigger (RN-13).
- **Sí:** `crear_prestamo` y `registrar_abono` como funciones `security definer` en `privado`, con envoltura, que reutilizan `registrar_movimiento`. Cuenta, préstamo y desembolso (o capital e interés) son atómicos. **No:** varias llamadas desde la API.
- **Sí:** desembolso adicional y condonación por `registrar_movimiento` directo: son un solo movimiento.
- **Sí:** una cuenta de préstamo solo nace en `crear_prestamo`: la política de INSERT de `cuentas` excluye esos tipos. Un trigger impide cambiar el tipo de un préstamo.
- **Sí:** los préstamos no salen en `GET /cuentas` ni en `/cuentas/:id`, pero suman al patrimonio. `GET /cuentas` agrega `prestamos` para que `patrimonioNeto` cuadre. **No:** mostrarlos como líneas de Cuentas en este spec.
- **Sí:** `CUENTA_DE_PRESTAMO` en `POST /movimientos` y `/recurrentes`. Todo movimiento de préstamo nace en Deudas. Se valida en el servicio porque `registrar_movimiento` es compartido. **No:** prohibirlo en la BD, porque obligaría a duplicar `registrar_movimiento`.
- **Sí:** los movimientos de préstamo se editan y borran desde Movimientos (RN-13), sin cambiar tipo ni préstamo y sin dejar el capital negativo.
- **Sí:** la condonación es un `gasto` con origen la cuenta del préstamo, fecha hoy y categoría elegida (RN-17). Deshacer es `DELETE /movimientos/:id`. **No:** un tipo de movimiento nuevo.
- **Sí:** el cliente arma la vista previa «Qué cambia» con `patrimonioNeto` y el monto. La API valida al registrar.
- **Sí:** una parte mayor que el pendiente se rechaza (`CONDONACION_EXCEDE_CAPITAL`). **No:** recortarla en silencio como el prototipo (RN-13).
- **Sí:** lista y detalle por separado, más un endpoint de propuesta. **No:** traer todos los historiales en `GET /prestamos`.
- **Sí:** «Ver movimientos» usa el historial del detalle. **No:** un filtro nuevo en `GET /movimientos`.
- **Sí:** las descripciones de los movimientos las fija el servicio.
- **Sí:** un solo spec, aunque toca cuentas, movimientos y recurrentes. Esos cambios son guardas pequeñas sin las que el módulo no es coherente. **No:** separar la condonación, que reutiliza todo lo demás.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `crear_prestamo` y `registrar_abono` son `security definer` y saltan la RLS | Fuerzan `auth.uid()`, filtran por usuario, delegan en `registrar_movimiento` y usan FK compuestas. La prueba de aislamiento las ataca con datos ajenos. |
| Un cliente llama a `registrar_movimiento` por PostgREST con una cuenta de préstamo y se salta `CUENTA_DE_PRESTAMO` | Solo afecta a sus propios datos (RN-12 intacta). El dominio tolera cualquier movimiento sobre la cuenta. `CAPITAL_NEGATIVO` y las clases se recalculan en cada lectura. |
| Las lecturas de cuentas que no filtren los tipos nuevos fallan en `aTipo` | El paso 9 filtra en `cuentas.repository.ts` y amplía `resumen.repository.ts`. Las e2e existentes cubren cuentas, captura y resumen. |
| El redondeo de causados difiere entre la propuesta y lo mostrado | Una sola función (`causadosEn`) con una división final, mitad hacia arriba, y pruebas de borde. |
| Cambiar la zona horaria mueve `hoy`, los días y los causados | Lo mismo que en SPEC 06 y SPEC 07. Se documenta. |
| `GET /prestamos` lee todos los movimientos de préstamo e intereses | Solo las columnas necesarias, en paralelo. A escala personal sobra. |
| Borrar el capital de un abono deja un interés suelto | Por diseño: queda como fila `interes`, cobrado y visible. Para borrarlo, `DELETE /movimientos/:id` de su id. |

## Lo que **no** entra en este spec

- TRM, avisos y entradas a otros módulos.
- Préstamos en USD.
- Persona en la captura rápida.
- Préstamos como líneas en la pantalla Cuentas.
- Cambiar la tasa, eliminar un préstamo o condonar una deuda contraída.
- Abonos recurrentes a deudas.
- Consulta del historial de préstamos.
- Interés compuesto u otras periodicidades de tasa.

Cada uno, si llega, va en su propio spec.
