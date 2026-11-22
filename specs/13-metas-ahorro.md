# SPEC 13 — Metas de ahorro

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05, SPEC 09, SPEC 10, SPEC 11
> **Fecha:** 2026-11-22
> **Objetivo:** Que la API lleve metas de ahorro sobre una cuenta, por apartado o con toda la cuenta, con su avance, ritmo, historial y cumplimiento calculados.

## Por qué existe este spec

REGLAS §7 se enmendó en los dos repos para que entren las metas de ahorro.

Fija cuatro patrones:

- **Una meta vive sobre una cuenta real.** En modo `apartado` separa parte del saldo de una cuenta de efectivo o banco. En modo `cuenta` toma la cuenta entera: su saldo, o su valor de mercado en COP si es inversión.
- **Apartar no es mover dinero.** Un aporte sin origen solo marca dinero que ya está en la cuenta. Con cuenta de origen, además se registra la transferencia real (RN-16). Ese aporte no guarda monto propio: lo lee de su movimiento, que es la única fuente.
- **El avance no se guarda** (RN-01). En `apartado` es aportes − retiros. En `cuenta` es el saldo o el valor de mercado.
- **El cumplimiento es híbrido.** Donde la serie diaria es exacta (apartado, efectivo, banco) se deriva. En una inversión se guarda la primera vez que una lectura lo detecta, como SPEC 11 guarda precios al leer.

Cubre el inventario `specs/necesidades/metas.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con:
  - las tablas `metas`, `metas_movimientos` y `metas_cambios`;
  - las funciones `crear_meta` y `registrar_aporte`;
  - los triggers de validación y de historial.
  - Todo con RLS.
- `GET /metas`, `GET /metas/archivadas` y `GET /metas/:id`.
- `POST /metas`, `PATCH /metas/:id` y `DELETE /metas/:id`.
- `POST /metas/:id/archivar` y `POST /metas/:id/restaurar`.
- `POST /metas/:id/aportes`, `PUT` y `DELETE /metas/:id/aportes/:aporteId`.
- Cambios en módulos existentes:
  - `POST /cuentas/:id/archivar` y `DELETE /cuentas/:id` responden `CUENTA_CON_METAS` si la cuenta tiene metas sin archivar;
  - `PUT /movimientos/:id` no cambia el `tipo` de la transferencia de un aporte (`MOVIMIENTO_DE_META`).
- Dominio puro en `src/domain/meta/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/metas.e2e-spec.ts`.
- `docs/api/metas.md` y su fila en `README.md`. Se actualizan `cuentas.md` y `movimientos.md`.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- TRM, avisos, captura rápida y navegación (N-01 a N-04, N-64): ya cubiertos o del cliente.
- Endpoint para consultar `metas_cambios`. Ninguna N-xx lo pide.
- Aportes a una meta sobre inversión. El diseño lleva a «Ver inversiones».
- Cuenta de origen en USD para un aporte.
- Objetivo en otra moneda que COP.
- Avisos de metas (ritmo atrasado, fecha cercana).
- Metas en el resumen del mes o en la pantalla Cuentas (saldo libre).

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_metas.sql`. Los montos son `text` cifrado (SPEC 05). La API genera el `id` de metas y aportes antes de cifrar.

### Constantes (`src/domain/meta/meta.ts`)

- `MODOS_META = ['apartado', 'cuenta']`.
- `TIPOS_APORTE = ['aporte', 'retiro']`.
- `TIPOS_CUENTA_APARTADO = ['efectivo', 'banco']`.
- `TIPOS_CUENTA_MODO_CUENTA = ['efectivo', 'banco', 'inversion']`.
- `VENTANA_RITMO_MESES = 6`.

En SQL se repiten las listas.

### Tabla `public.metas`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `nombre` | `text` | not null, `check (char_length(btrim(nombre)) between 1 and 60)` |
| `cuenta_id` | `uuid` | not null |
| `modo` | `text` | not null, `check (modo in ('apartado','cuenta'))` |
| `objetivo` | `text` | not null. Cifrado, AAD `metas\|objetivo\|<id>`. |
| `fecha_meta` | `date` | nullable |
| `fecha_meta_es_mes` | `boolean` | not null, default `false` |
| `cumplida_en` | `date` | nullable. Solo en metas sobre inversión. |
| `avance_cumplida` | `text` | nullable. Cifrado, AAD `metas\|avance_cumplida\|<id>`. |
| `archivada_en` | `timestamptz` | nullable |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `unique (usuario_id, id)` (`metas_usuario_id_id_key`).
- FK `(usuario_id, cuenta_id) → cuentas (usuario_id, id) on delete restrict` (`metas_cuenta_fkey`).
- Checks:
  - `metas_fecha_mes_check`: `not fecha_meta_es_mes or (fecha_meta is not null and fecha_meta = (date_trunc('month', fecha_meta) + interval '1 month - 1 day')::date)`. Un mes se guarda como su último día.
  - `metas_cumplida_check`: `(cumplida_en is null) = (avance_cumplida is null)`.
- Índices:
  - `metas_usuario_idx (usuario_id)`;
  - `metas_cuenta_idx (usuario_id, cuenta_id)`;
  - `metas_cuenta_exclusiva` único `(cuenta_id) where modo = 'cuenta' and archivada_en is null` (N-56).
- RLS: `metas_select_propia`, `metas_insert_propia`, `metas_update_propia` y `metas_delete_propia`, todas con `usuario_id = auth.uid()`.
- Triggers:
  - `marcar_actualizado`;
  - `validar_meta()`, `before insert or update of cuenta_id, modo, archivada_en`:
    - la cuenta no puede ser de un tipo que el modo no admite (`CUENTA_NO_ADMITIDA`);
    - en un insert, o si cambia la cuenta, la cuenta no puede estar archivada (`CUENTA_ARCHIVADA`);
    - si `new.archivada_en is null`, no puede haber otra meta sin archivar en la misma cuenta cuando alguna de las dos es de modo `cuenta` (`CUENTA_CON_META_EXCLUSIVA`). El índice cubre dos de modo `cuenta`; el trigger, la mezcla;
    - si cambia `modo` y la meta tiene filas en `metas_movimientos`, lanza `META_CON_APORTES`;
  - `registrar_cambio_meta()`, ver `metas_cambios`.

### Tabla `public.metas_movimientos`

Un aporte o un retiro de una meta por apartado.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `meta_id` | `uuid` | not null |
| `tipo` | `text` | not null, `check (tipo in ('aporte','retiro'))` |
| `monto` | `text` | nullable. Cifrado, AAD `metas_movimientos\|monto\|<id>`. |
| `fecha` | `date` | nullable |
| `motivo` | `text` | nullable, `check (char_length(btrim(motivo)) between 1 and 80)` |
| `inicial` | `boolean` | not null, default `false`. «Apartado inicial». |
| `movimiento_id` | `uuid` | nullable, unique. La transferencia de un aporte con origen. |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- FK `(usuario_id, meta_id) → metas (usuario_id, id) on delete cascade`.
- FK `(usuario_id, movimiento_id) → movimientos (usuario_id, id) on delete cascade`. Borrar la transferencia borra el aporte.
- Checks:
  - `metas_movimientos_fuente_check`: `(movimiento_id is null) = (monto is not null and fecha is not null)`. Con transferencia, monto y fecha se leen de ella;
  - `metas_movimientos_origen_check`: `movimiento_id is null or tipo = 'aporte'`.
- Índices:
  - `metas_movimientos_usuario_idx (usuario_id)`;
  - `metas_movimientos_meta_idx (usuario_id, meta_id)`;
  - `metas_movimientos_inicial_idx` único `(meta_id) where inicial`.
- RLS: `select`, `insert`, `update` y `delete` propios.
- Triggers `marcar_actualizado` y `registrar_cambio_aporte()`.

### Tabla `public.metas_cambios`

Historial (RN-13), con la forma de `cuentas_cambios`. Sin endpoint de lectura.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `meta_id` | `uuid` | not null, **sin FK** |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `entidad` | `text` | not null, `check (entidad in ('meta','aporte'))` |
| `entidad_id` | `uuid` | not null |
| `campo` | `text` | not null |
| `valor_anterior` | `text` | nullable |
| `valor_nuevo` | `text` | nullable |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `metas_cambios_usuario_idx (usuario_id)` y `metas_cambios_meta_idx (meta_id)`.
- RLS: solo `metas_cambios_select_propio`.
- Triggers, `security definer` con `set search_path = ''`:
  - `registrar_cambio_meta()`, `after update or delete on metas`. En update, una fila por campo que cambió entre `nombre`, `cuenta_id`, `modo`, `objetivo`, `fecha_meta`, `fecha_meta_es_mes` y `archivada_en`. En delete, una fila `campo = 'eliminada'`;
  - `registrar_cambio_aporte()`, `after update or delete on metas_movimientos`. En update, una fila por campo entre `monto`, `fecha` y `motivo`. En delete, una fila `campo = 'eliminado'` con el monto anterior.
- Los montos se copian cifrados y conservan la AAD de su fila de origen.
- Los cambios de la transferencia de un aporte quedan en `movimientos_cambios`.

### Función `crear_meta`

`privado.crear_meta(p_id uuid, p_nombre text, p_cuenta_id uuid, p_modo text, p_objetivo text, p_fecha_meta date, p_fecha_meta_es_mes boolean, p_aporte jsonb) returns uuid`. Es `security definer` con `set search_path = ''` y tiene una envoltura `security invoker` en `public` con la misma firma. Permisos como `registrar_movimiento`.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Inserta la meta. Los triggers validan cuenta y modo.
3. Si `p_aporte` no es nulo, llama a `registrar_aporte` con sus campos e `inicial = true`.
4. Todo en una transacción. Devuelve `p_id`.

### Función `registrar_aporte`

`privado.registrar_aporte(p_id uuid, p_meta_id uuid, p_tipo text, p_monto text, p_fecha date, p_motivo text, p_inicial boolean, p_movimiento_id uuid, p_monto_movimiento text, p_cuenta_origen_id uuid, p_descripcion text) returns uuid`. Mismo esquema de seguridad, envoltura y permisos.

1. Si `auth.uid()` es nulo, lanza `NO_AUTENTICADO`.
2. Lee la meta del usuario. Si no existe, lanza `META_NO_ENCONTRADA`.
3. Sin `p_cuenta_origen_id`: inserta `(p_id, p_meta_id, p_tipo, p_monto, p_fecha, p_motivo, p_inicial)`.
4. Con `p_cuenta_origen_id`:
   - llama a `privado.registrar_movimiento(p_movimiento_id, 'transferencia', p_monto_movimiento, p_fecha, p_descripcion, null, p_cuenta_origen_id, <cuenta de la meta>, null, null)`. Esa llamada valida origen, préstamo, archivada y RN-03;
   - inserta `(p_id, p_meta_id, 'aporte', null, null, p_motivo, p_inicial, p_movimiento_id)`.
5. Todo en una transacción. Devuelve `p_id`.

El aporte a una meta de modo `cuenta` es una transferencia común: el repositorio llama a `registrar_movimiento` sin fila en `metas_movimientos`. Editar o borrar el aporte con origen usa `reemplazar_movimiento` y el `DELETE` de `movimientos`.

### Reglas del dominio (`src/domain/meta/`)

Fechas `"YYYY-MM-DD"` en la zona del perfil. `hoy` sale de `fechaLocal`. `creadaEl` es `fechaLocal(creado_en)`.

- **Monto de un aporte** (`avance.ts`): el propio, o el `monto` de su transferencia. La fecha, igual.
- **Acumulado a la fecha F** (apartado): Σ aportes − Σ retiros con fecha ≤ F, por `fecha` y luego por `creadoEn`.
- **Apartado vigente:** el acumulado con todas las filas.
- **Avance de una meta activa:**
  - `apartado`: el apartado vigente;
  - `cuenta` en efectivo o banco: `calcularSaldo` de la cuenta;
  - `cuenta` en inversión: `aCop(valorMercado, moneda, trm de hoy)`. Sin TRM, `null`.
- **Cumplimiento:**
  - `apartado`: el primer día en que el acumulado al cierre llega al objetivo;
  - `cuenta` en efectivo o banco: el primer día, desde `creadaEl`, en que el saldo al cierre llega al objetivo;
  - en los dos, el avance de la cumplida es el de ese día. Corregir un aporte puede volverla activa;
  - `cuenta` en inversión: `cumplida_en` y `avance_cumplida` guardados. Si son nulos, la meta no está archivada y el avance de hoy llega al objetivo, la lectura los guarda con `hoy` y ese avance. No se revierte.
- **Uso de una cumplida** (N-22): el primer retiro con fecha ≥ `cumplidaEl`: su fecha y su motivo.
- **Falta:** `max(0, objetivo − avance)`.
- **Porcentaje:** `floor(avance × 10000 ÷ objetivo)` en centésimas, con avance negativo como 0. El cliente muestra un decimal truncado y topa la barra en 100 %. Ejemplo: 1.900.000 de 7.500.000 → `2533` → «25,3 %».
- **Ritmo** (`ritmo.ts`), solo en activas:
  - con fecha de día: `{ tipo: 'dias', falta, dias }`, con `dias = max(0, fechaMeta − hoy)`;
  - con fecha de mes: `{ tipo: 'meses', falta, meses, cuotaMensual }`. `meses` es la diferencia de meses calendario entre hoy y la fecha. `cuotaMensual = ceil(falta ÷ meses)`, o `falta` si `meses` es 0. Ejemplo: 13.070.000 de nov 2026 a dic 2027 → 13 meses → 1.005.385;
  - en los dos, `vencida = fechaMeta < hoy`. La fecha guardada de un mes es su último día;
  - sin fecha: `{ tipo: 'promedio', promedioMensual, mesEstimado }`.
    - La ventana son los últimos `VENTANA_RITMO_MESES` meses calendario, el actual incluido, o los meses desde `creadaEl` si son menos.
    - `promedioMensual = redondear((avance(hoy) − avance(fin del mes anterior a la ventana)) ÷ meses de la ventana)`, con avance 0 antes de `creadaEl`.
    - Si `promedioMensual > 0`: `mesEstimado = mes actual + ceil(falta ÷ promedioMensual)`. Si no, los dos son `null`.
    - Ejemplo: 1.900.000 en jun–nov → 316.667 al mes → falta 5.600.000 → 18 meses → `"2028-05"`.
- **Saldo libre** (`apartados.ts`): `saldo de la cuenta − Σ apartado vigente` de todas sus metas por apartado. Puede ser negativo: entonces `excedido = true` (N-25).
- **Historial de una meta por apartado:** sus filas, la más reciente primero, con el acumulado tras cada una.
- **Historial de una meta de modo `cuenta`:** una fila `cierre` por cada fin de mes desde el mes de `creadaEl` hasta el anterior a hoy, y una fila `hoy`. La primera es `creadaEl` si no es fin de mes.
  - `valor`: el avance en esa fecha, en COP. En una inversión, con el precio vigente y la TRM de esa fecha.
  - `variacion`: `valor − valor de la fila anterior`; nula en la primera.
  - Los cierres faltantes de precios automáticos se completan con `PreciosService.completarHistorico` y las TRM con `TrmService.enFechas`, como el patrimonio de SPEC 10.
- **Orden** (`orden.ts`):
  - activas: `fechaMeta` asc, sin fecha al final, empate por `creadoEn` asc;
  - cumplidas: `cumplidaEl` desc;
  - archivadas: `archivadaEn` desc.
- **Totales:** Σ avance y Σ objetivo de las activas. Una activa con avance nulo no suma y deja `incompleto = true`.

### Validaciones (`validar.ts`)

- **Alta:**
  - `nombre` de 1 a 60 caracteres tras recortar (`NOMBRE_INVALIDO`);
  - `objetivo` string `^\d{1,19}$` mayor que 0 (`MONTO_INVALIDO`);
  - `modo` en `MODOS_META` (`MODO_INVALIDO`);
  - `cuentaId` UUID de una cuenta del usuario (`CUENTA_INVALIDA`), de un tipo que el modo admite (`CUENTA_NO_ADMITIDA`) y no archivada (`CUENTA_ARCHIVADA`);
  - `fechaMeta` opcional, `YYYY-MM-DD` o `YYYY-MM` válida (`FECHA_INVALIDA`). Un día no anterior a hoy y un mes no anterior al actual (`FECHA_META_PASADA`);
  - `aporteInicial` opcional, solo en `apartado` (`APORTE_INICIAL_NO_ADMITIDO`). Sigue las reglas de un aporte con fecha hoy.
- **Aporte o retiro:**
  - meta no archivada (`META_ARCHIVADA`);
  - `monto` string `^\d{1,19}$` mayor que 0 (`MONTO_INVALIDO`);
  - `fecha` `YYYY-MM-DD`, no anterior a `creadaEl` (`FECHA_ANTERIOR_A_META`) ni posterior a hoy (`FECHA_FUTURA`);
  - `motivo` opcional de 1 a 80 caracteres (`MOTIVO_INVALIDO`);
  - un aporte en una cumplida: `META_CUMPLIDA`. Un retiro sí se admite;
  - un aporte sin origen no supera el saldo libre (`SALDO_LIBRE_INSUFICIENTE`);
  - ningún día el acumulado al cierre queda negativo (`APARTADO_INSUFICIENTE`). Se comprueba al crear, editar y borrar;
  - `cuentaOrigenId` solo en aportes (`ORIGEN_NO_ADMITIDO`). Cuenta COP del usuario, distinta de la de la meta, no préstamo ni inversión USD (`CUENTA_INVALIDA`);
  - en modo `cuenta`: el retiro no se admite (`RETIRO_NO_ADMITIDO`), el aporte exige `cuentaOrigenId` (`ORIGEN_REQUERIDO`) y en una inversión no se admite (`META_DE_INVERSION`).
- **Edición de un aporte:** no agrega ni quita la cuenta de origen (`ORIGEN_FIJO`). Las mismas reglas de monto, fecha, motivo, saldo libre y acumulado.
- **Edición de la meta:**
  - una cumplida o archivada no se edita (`META_CUMPLIDA`, `META_ARCHIVADA`);
  - mismas reglas que el alta para cada campo enviado;
  - cambiar de cuenta con apartado vigente exige que quepa en el saldo libre de la nueva (`SALDO_LIBRE_INSUFICIENTE`);
  - cambiar de modo con aportes: `META_CON_APORTES`.
- **Archivar:** solo una cumplida (`META_NO_CUMPLIDA`). En `apartado`, con apartado vigente 0 (`APARTADO_NO_CERO`).
- **Restaurar:** solo una archivada (`META_NO_ARCHIVADA`). Los triggers validan la cuenta archivada y la exclusividad.

### Descripción de la transferencia de un aporte

`Aporte a <nombre de la meta>`, recortada a 80 caracteres.

### Contrato HTTP

Montos en string entero de pesos. Los que pueden ser negativos (`variacion`, `libre`) llevan `-`.

```ts
type ModoMeta = "apartado" | "cuenta";

type CuentaMetaDto = { id: string; nombre: string; tipo: "efectivo" | "banco" | "inversion"; moneda: "COP" | "USD" };

type RitmoDto =
  | { tipo: "dias"; falta: string; dias: number; vencida: boolean }
  | { tipo: "meses"; falta: string; meses: number; cuotaMensual: string; vencida: boolean }
  | { tipo: "promedio"; promedioMensual: string | null; mesEstimado: string | null }; // "YYYY-MM"

type MetaDto = {
  id: string;
  nombre: string;
  modo: ModoMeta;
  cuenta: CuentaMetaDto;
  objetivo: string;
  avance: string | null;        // null: inversión USD sin TRM
  falta: string | null;
  porcentaje: number | null;    // centésimas, truncado
  fechaMeta: string | null;     // "YYYY-MM-DD" o "YYYY-MM"
  cumplidaEl: string | null;
  uso: { fecha: string; motivo: string | null } | null;
  ritmo: RitmoDto | null;       // null en cumplidas
  creadaEl: string;
  archivadaEn: string | null;
};

type MetasDto = {
  fechaHoy: string;
  trm: TrmDto | null;
  totales: { avance: string; objetivo: string; incompleto: boolean };
  activas: MetaDto[];
  cumplidas: MetaDto[];
};

type FilaAporteDto = {
  id: string;
  tipo: "aporte" | "retiro";
  fecha: string;
  monto: string;
  acumulado: string;
  inicial: boolean;
  motivo: string | null;
  cuentaOrigen: { id: string; nombre: string } | null;
  movimientoId: string | null;
};

type FilaValorDto = {
  tipo: "cierre" | "hoy";
  fecha: string;
  valor: string | null;
  variacion: string | null;
  trm: TrmDto | null;           // solo en "hoy" de una cuenta USD
};

type MetaDetalleDto = MetaDto & {
  historial: FilaAporteDto[] | FilaValorDto[];
  apartados: {
    saldoCuenta: string;
    apartadoAqui: string;
    otras: { metaId: string; nombre: string; apartado: string }[];
    libre: string;
    excedido: boolean;
  } | null;                     // solo en "apartado"
  inversion: { valorMercado: string; moneda: "COP" | "USD"; trm: TrmDto | null } | null;
};
```

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /metas` | — | `200 MetasDto` |
| `GET /metas/archivadas` | — | `200 MetaDto[]` |
| `GET /metas/:id` | — | `200 MetaDetalleDto`, también archivada |
| `POST /metas` | `{ nombre, cuentaId, modo, objetivo, fechaMeta?, aporteInicial?: { monto, cuentaOrigenId? } }` | `201 MetaDetalleDto` |
| `PATCH /metas/:id` | `{ nombre?, cuentaId?, modo?, objetivo?, fechaMeta?: string \| null }` | `200 MetaDetalleDto` |
| `DELETE /metas/:id` | — | `204` |
| `POST /metas/:id/archivar` | — | `200 MetaDto` |
| `POST /metas/:id/restaurar` | — | `200 MetaDetalleDto` |
| `POST /metas/:id/aportes` | `{ tipo, monto, fecha, cuentaOrigenId?, motivo? }` | `201 MetaDetalleDto` |
| `PUT /metas/:id/aportes/:aporteId` | `{ monto, fecha, cuentaOrigenId?, motivo? }` | `200 MetaDetalleDto` |
| `DELETE /metas/:id/aportes/:aporteId` | — | `204` |

- `GET /metas` valora las inversiones como `GET /cuentas`. `GET /metas/:id` refresca los precios de su inversión como `GET /inversiones/:id`.
- Las dos lecturas guardan el cumplimiento de una inversión cuando lo detectan.
- Borrar un aporte con origen borra su transferencia, con historial (RN-13).
- Borrar una meta borra sus aportes. Sus transferencias siguen en movimientos.
- El cliente arma las frases del ritmo, del uso y de las notas con estos campos.

### Cambios en contratos existentes

- `POST /cuentas/:id/archivar` y `DELETE /cuentas/:id`: `409 CUENTA_CON_METAS` si la cuenta tiene metas sin archivar.
- `PUT /movimientos/:id` de la transferencia de un aporte: el `tipo` sigue siendo `transferencia` (`422 MOVIMIENTO_DE_META`). Montos, fecha y cuentas sí cambian. `DELETE` borra también el aporte.

### Errores nuevos

| Código | HTTP | Campo | Mensaje sugerido |
|---|---|---|---|
| `META_NO_ENCONTRADA` | 404 | — | Esa meta no existe. |
| `APORTE_NO_ENCONTRADO` | 404 | — | Ese aporte no existe. |
| `NOMBRE_INVALIDO` | 400 | `nombre` | Escribe un nombre de 1 a 60 caracteres. |
| `MODO_INVALIDO` | 400 | `modo` | Elige apartado o toda la cuenta. |
| `MOTIVO_INVALIDO` | 400 | `motivo` | El motivo tiene de 1 a 80 caracteres. |
| `CUENTA_NO_ADMITIDA` | 422 | `cuentaId` | Esa cuenta no admite este tipo de meta. |
| `FECHA_META_PASADA` | 422 | `fechaMeta` | La fecha meta no puede estar en el pasado. |
| `FECHA_ANTERIOR_A_META` | 422 | `fecha` | La fecha no puede ser anterior a la creación de la meta. |
| `FECHA_FUTURA` | 422 | `fecha` | La fecha no puede ser futura. |
| `APORTE_INICIAL_NO_ADMITIDO` | 422 | `aporteInicial` | Solo una meta por apartado lleva apartado inicial. |
| `SALDO_LIBRE_INSUFICIENTE` | 422 | `monto` | La cuenta no tiene saldo libre suficiente. |
| `APARTADO_INSUFICIENTE` | 422 | `monto` | Lo apartado no alcanza para ese retiro. |
| `ORIGEN_NO_ADMITIDO` | 422 | `cuentaOrigenId` | Un retiro no lleva cuenta de origen. |
| `ORIGEN_REQUERIDO` | 422 | `cuentaOrigenId` | Elige la cuenta desde la que aportas. |
| `ORIGEN_FIJO` | 422 | `cuentaOrigenId` | No se puede agregar ni quitar la cuenta de origen. |
| `RETIRO_NO_ADMITIDO` | 422 | `tipo` | Una meta de toda la cuenta no tiene retiros. |
| `META_DE_INVERSION` | 422 | — | El avance de esta meta sigue a la inversión. |
| `META_CUMPLIDA` | 409 | — | La meta ya se cumplió. |
| `META_ARCHIVADA` | 409 | — | La meta está archivada. |
| `META_NO_CUMPLIDA` | 409 | — | Solo se archiva una meta cumplida. |
| `META_NO_ARCHIVADA` | 409 | — | La meta no está archivada. |
| `APARTADO_NO_CERO` | 409 | — | Retira lo apartado antes de archivar. |
| `META_CON_APORTES` | 409 | `modo` | Una meta con aportes no cambia de modo. |
| `CUENTA_CON_META_EXCLUSIVA` | 409 | `cuentaId` | Esa cuenta ya tiene una meta de toda la cuenta. |
| `CUENTA_CON_METAS` | 409 | — | La cuenta tiene metas: archívalas o elimínalas primero. |
| `MOVIMIENTO_DE_META` | 422 | `tipo` | La transferencia de un aporte no cambia de tipo. |

Se reusan `ENTRADA_INVALIDA`, `MONTO_INVALIDO`, `FECHA_INVALIDA`, `CUENTA_INVALIDA` y `CUENTA_ARCHIVADA`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_metas.sql
src/domain/meta/
  meta.ts               Tipos y constantes.
  avance.ts             Acumulado, avance, cumplimiento, uso.
  ritmo.ts              Días, meses y promedio.
  historial.ts          Filas de aportes y de valor.
  apartados.ts          Saldo libre y nota.
  orden.ts              Orden de los grupos.
  validar.ts            Validaciones.
  fixtures.test-utils.ts
  *.test.ts
src/repositories/supabase/metas.repository.ts
src/metas/
  metas.module.ts
  metas.controller.ts
  metas.service.ts
  esquemas.ts
  dto.ts
src/cuentas/cuentas.service.ts          CUENTA_CON_METAS.
src/movimientos/movimientos.service.ts  MOVIMIENTO_DE_META.
src/app.module.ts                       Registra MetasModule.
test/metas.e2e-spec.ts
test/aislamiento.e2e-spec.ts            Ampliada.
docs/api/metas.md
docs/api/README.md, cuentas.md, movimientos.md
```

## Plan de implementación

1. Migración `<timestamp>_metas.sql`: tablas, índices, RLS, triggers y funciones. **El autor la revisa antes de aplicarla** (REGLAS §8). Se aplica y se regeneran los tipos en `src/repositories/supabase/tipos.ts`.
2. `src/domain/meta/meta.ts`, `validar.ts` y sus pruebas.
3. `avance.ts` (acumulado, avance, cumplimiento, uso) y sus pruebas.
4. `ritmo.ts`, `apartados.ts`, `orden.ts` y sus pruebas, con los ejemplos del diseño.
5. `historial.ts` y sus pruebas: filas de aportes y cierres mensuales.
6. `metas.repository.ts`: leer metas y aportes con su transferencia, cifrar y descifrar, llamar a `crear_meta`, `registrar_aporte`, `registrar_movimiento` y `reemplazar_movimiento`.
7. Módulo `src/metas/` de lectura: `GET /metas`, `GET /metas/archivadas` y `GET /metas/:id`, con la escritura del cumplimiento de inversiones. Registrado en `app.module.ts`.
8. Escrituras de la meta: `POST`, `PATCH`, `DELETE`, `archivar` y `restaurar`.
9. Aportes: `POST`, `PUT` y `DELETE /metas/:id/aportes`.
10. Cambios en Cuentas (`CUENTA_CON_METAS`) y Movimientos (`MOVIMIENTO_DE_META`).
11. Prueba de aislamiento con `metas`, `metas_movimientos` y `metas_cambios`, y `test/metas.e2e-spec.ts`.
12. `docs/api/metas.md`, fila en `README.md`, y notas en `cuentas.md` y `movimientos.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | SPEC 09. |
| N-02 | SPEC 12. |
| N-03 | Navegación del cliente. |
| N-04 | SPEC 04. |
| N-05 | `MetasDto.totales.avance`. |
| N-06 | `MetasDto.totales.objetivo`. |
| N-07 | `POST /metas`. |
| N-08 | `MetasDto.activas` y `cumplidas`; el cliente oculta el grupo vacío. |
| N-09 | Orden de `activas` y `cumplidas` (`orden.ts`). |
| N-10 | `MetaDto.nombre`. |
| N-11 | `MetaDto.avance`, calculado. |
| N-12 | `MetaDto.objetivo`. |
| N-13 | `MetaDto.porcentaje`, en centésimas truncado. |
| N-14 | `MetaDto.fechaMeta` y `cumplidaEl`. |
| N-15 | `cumplidaEl` y el grupo. |
| N-16 | `GET /metas/:id` con `MetaDto.id`. |
| N-17 | `MetaDto.cuenta` (`tipo`) y `modo`. |
| N-18 | `MetaDto.falta`. |
| N-19 | `RitmoDto` `dias`. |
| N-20 | `RitmoDto` `meses`. |
| N-21 | `RitmoDto` `promedio`. |
| N-22 | `cumplidaEl` y `MetaDto.uso`. |
| N-23 | Avance de la cumplida: el del día de cumplimiento o `avance_cumplida`. |
| N-24 | `MetaDetalleDto.apartados`. |
| N-25 | `apartados.excedido`. |
| N-26 | `MetaDetalleDto.inversion`. |
| N-27 | `FilaAporteDto`: `fecha`, `tipo`, `inicial`, `cuentaOrigen`, `motivo`. |
| N-28 | `FilaAporteDto.monto` y `tipo`. |
| N-29 | `FilaAporteDto.acumulado`. |
| N-30 | `FilaValorDto` `cierre` y `hoy`. |
| N-31 | `FilaValorDto.variacion`. |
| N-32 | `FilaValorDto.trm`. |
| N-33 | `cuenta`, `objetivo`, `fechaMeta`, `cumplidaEl` y `creadaEl`. |
| N-34 | `POST /metas/:id/aportes` con `tipo: "aporte"`. |
| N-35 | `registrar_aporte` con `cuentaOrigenId`. |
| N-36 | `SALDO_LIBRE_INSUFICIENTE`. |
| N-37 | `MONTO_INVALIDO`. |
| N-38 | `POST /metas/:id/aportes` con `tipo: "retiro"`. |
| N-39 | `APARTADO_INSUFICIENTE`. |
| N-40 | `PUT` y `DELETE /metas/:id/aportes/:aporteId`; `metas_cambios` y `movimientos_cambios`. |
| N-41 | `POST /metas/:id/aportes` en modo `cuenta`: transferencia común. |
| N-42 | `MetaDto.cuenta.id` con `tipo: "inversion"`. |
| N-43 | `META_CUMPLIDA`; el cliente oculta las acciones con `cumplidaEl`. |
| N-44 | `PATCH /metas/:id`. |
| N-45 | `SALDO_LIBRE_INSUFICIENTE` al cambiar de cuenta; `META_CON_APORTES` al cambiar de modo. |
| N-46 | `metas_cambios`. |
| N-47 | `DELETE /metas/:id`. |
| N-48 | `POST /metas/:id/archivar`. |
| N-49 | `GET /metas/archivadas`. |
| N-50 | `NOMBRE_INVALIDO`. |
| N-51 | `MONTO_INVALIDO`. |
| N-52 | `CUENTA_INVALIDA`, `CUENTA_NO_ADMITIDA`, `CUENTA_ARCHIVADA`. |
| N-53 | `MODO_INVALIDO`. |
| N-54 | `fechaMeta` `YYYY-MM-DD` o `YYYY-MM`; `FECHA_META_PASADA`. |
| N-55 | `aporteInicial` en `POST /metas`; `FilaAporteDto.inicial`. |
| N-56 | `metas_cuenta_exclusiva` y `validar_meta`: `CUENTA_CON_META_EXCLUSIVA`. |
| N-57 | `objetivo` en COP; avance con `aCop` y la TRM de hoy. |
| N-58 | Cumplimiento híbrido (`avance.ts`, `cumplida_en`). |
| N-59 | `MetaDto.avance: null`; `totales.incompleto`. |
| N-60 | `CUENTA_CON_METAS` al archivar o eliminar la cuenta. |
| N-61 | `activas` y `cumplidas` vacías; el cliente muestra el estado vacío. |
| N-62 | `MetaDto.cuenta`. |
| N-63 | `MetaDto.ritmo` en la lista. |
| N-64 | Navegación del cliente. |
| N-65 | `POST /metas/:id/restaurar`. |

## Criterios de aceptación

- [ ] La migración aplica limpia y la prueba de aislamiento cubre `metas`, `metas_movimientos` y `metas_cambios`.
- [ ] `metas.objetivo`, `metas.avance_cumplida` y `metas_movimientos.monto` solo guardan texto cifrado.
- [ ] Crear una meta por apartado sobre una tarjeta responde `422 CUENTA_NO_ADMITIDA`. Sobre una inversión, también.
- [ ] Crear una meta de modo `cuenta` sobre una inversión USD responde `201`, con avance en COP a la TRM de hoy.
- [ ] Una segunda meta sobre una cuenta con meta de modo `cuenta` sin archivar responde `409 CUENTA_CON_META_EXCLUSIVA`, en cualquier modo.
- [ ] Dos metas por apartado sobre la misma cuenta conviven.
- [ ] `fechaMeta: "2027-12"` se guarda como `2027-12-31` y vuelve como `"2027-12"`.
- [ ] `fechaMeta` de ayer responde `422 FECHA_META_PASADA`.
- [ ] Un aporte sin origen mayor que el saldo libre responde `422 SALDO_LIBRE_INSUFICIENTE`.
- [ ] Un aporte con origen crea una transferencia del origen a la cuenta de la meta, sin categoría, que sale en `GET /movimientos`.
- [ ] Editar en `PUT /movimientos/:id` el monto de esa transferencia cambia el monto del aporte en `GET /metas/:id`.
- [ ] Cambiar en `PUT /movimientos/:id` su tipo a gasto responde `422 MOVIMIENTO_DE_META`.
- [ ] `DELETE /metas/:id/aportes/:aporteId` de un aporte con origen borra también su transferencia.
- [ ] Un retiro mayor que lo apartado responde `422 APARTADO_INSUFICIENTE`. Borrar el aporte que pagó un retiro posterior, también.
- [ ] Un gasto que deja la cuenta por debajo de lo apartado se registra, y `GET /metas/:id` trae `apartados.excedido: true`.
- [ ] Con los datos del fondo de emergencia del diseño, `GET /metas/:id` trae `porcentaje: 2533`, `promedioMensual: "316667"` y `mesEstimado: "2028-05"`.
- [ ] Con los del viaje, `ritmo` trae `{ tipo: "dias", falta: "1200000", dias: 34 }` a 34 días de la fecha.
- [ ] Una meta por apartado que llega al objetivo pasa a `cumplidas` con `cumplidaEl` del día del aporte que la completó.
- [ ] Un retiro posterior deja la cumplida en `cumplidas`, con el mismo avance y `uso` con su fecha y motivo.
- [ ] Un aporte a una cumplida responde `409 META_CUMPLIDA`.
- [ ] Una meta sobre inversión cuyo valor llega al objetivo queda con `cumplida_en` guardado y sigue cumplida si el valor baja.
- [ ] El historial de una meta de modo `cuenta` trae un cierre por mes desde su creación y la fila de hoy, con la variación de cada una.
- [ ] Archivar una cumplida con apartado responde `409 APARTADO_NO_CERO`. Con apartado 0, sale de `GET /metas` y aparece en `GET /metas/archivadas`.
- [ ] Restaurar la devuelve a `GET /metas`.
- [ ] Cambiar el modo de una meta con aportes responde `409 META_CON_APORTES`.
- [ ] Cambiar la cuenta de una meta por apartado mueve su apartado y valida el saldo libre de la nueva.
- [ ] `DELETE /metas/:id` libera lo apartado y conserva las transferencias de sus aportes.
- [ ] Editar el objetivo y borrar un aporte dejan filas en `metas_cambios`.
- [ ] Archivar o eliminar una cuenta con metas sin archivar responde `409 CUENTA_CON_METAS`.
- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `docs/api/metas.md` documenta todos los endpoints y errores, y `README.md` lo enlaza.
- [ ] La tabla de cobertura no tiene filas vacías.

## Decisiones

- **Sí:** modo `apartado` y modo `cuenta`, con los tipos de cuenta que admite cada uno. **No:** apartado dentro de una inversión, que mezcla el valor de mercado con dinero asignado.
- **Sí:** aporte = asignación; con origen, además la transferencia real (RN-16). **No:** todo aporte como transferencia, que impide apartar dinero que ya está en la cuenta. **No:** solo asignación, que dejaría el origen como texto y sin movimiento.
- **Sí:** el aporte con origen lee monto y fecha de su transferencia. **No:** duplicar el monto, que diverge si se edita la transferencia en `/movimientos`.
- **Sí:** borrar un aporte con origen borra su transferencia: es corregir un registro. **No:** borrar solo la asignación.
- **Sí:** el aporte se bloquea si supera el saldo libre; el gasto nunca (RN-16). **No:** bloquear gastos por lo apartado.
- **Sí:** cumplimiento derivado en apartado, efectivo y banco, y guardado en inversión. **No:** derivar también la inversión, que exige valor diario con precio y TRM de cada día desde la creación. **No:** guardarlo siempre, que no se corrige al editar un aporte erróneo.
- **Sí:** la cumplida queda con el avance de su cumplimiento. **No:** el avance actual, que pondría en 0 a la meta cuyo dinero ya se usó.
- **Sí:** `fecha_meta` + `fecha_meta_es_mes`, con el mes como su último día. **No:** precisión en texto o dos columnas.
- **Sí:** fecha meta no anterior a hoy al guardarla. **No:** fechas libres.
- **Sí:** exclusividad del modo `cuenta` en la BD (índice y trigger), entre metas sin archivar. **No:** solo en el dominio sobre «activa», que no cabe en un índice porque el cumplimiento es derivado.
- **Sí:** editar nombre, objetivo, fecha y cuenta; el modo solo sin aportes. **No:** cambio de modo que descarte aportes.
- **Sí:** archivar solo cumplidas con apartado 0, y restaurar. **No:** archivar con dinero apartado, que lo esconde del saldo libre.
- **Sí:** una cuenta con metas sin archivar no se archiva ni se elimina. **No:** archivar sus metas en cascada.
- **Sí:** `metas_cambios` por trigger, una tabla para meta y aportes, sin endpoint. **No:** dos tablas.
- **Sí:** `/metas/:id/aportes` con `tipo`. **No:** rutas separadas para retiros.
- **Sí:** la lista trae el ritmo y el detalle agrega historial y notas. La API da cifras y el cliente arma frases, como SPEC 12. **No:** lista mínima, que obliga al móvil a pedir cada detalle.
- **Sí:** porcentaje en centésimas truncado, como SPEC 10. **No:** décimas, que abren una segunda convención.
- **Sí:** nombres de meta repetidos se admiten. Ninguna N-xx pide unicidad.
- **Sí:** aportes y retiros con fecha entre la creación y hoy. Así el cumplimiento y el acumulado no dependen del futuro.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El saldo libre se valida en el servicio y dos aportes simultáneos pueden pasarlo | Escala personal. Si pasa, la meta muestra `excedido` y el usuario retira. |
| El historial de una meta de modo `cuenta` sobre inversión pide cierres y TRM de muchos meses | Usa `completarHistorico` y `TrmService.enFechas` como el patrimonio: un rango por activo y una consulta de TRM. |
| `GET /metas` escribe el cumplimiento de una inversión | Solo la primera vez, con `cumplida_en is null` en el `update`. Como SPEC 11 con los precios. |
| La serie diaria de saldo en modo `cuenta` recorre los movimientos desde la creación | Ya están en memoria para el saldo (`efectos`). Se recorre por día una sola vez. |
| Cambiar la cuenta de una meta deja aportes cuya transferencia fue a la cuenta anterior | La asignación cuenta en la cuenta vigente de la meta. La transferencia es historia de cómo llegó el dinero. Queda documentado en `docs/api/metas.md`. |

## Lo que **no** entra en este spec

- Endpoint de lectura de `metas_cambios`.
- Aportes a metas sobre inversión.
- Cuenta de origen en USD.
- Objetivo en otra moneda que COP.
- Avisos de metas.
- Metas en el resumen o saldo libre en Cuentas.

Cada uno, si llega, va en su propio spec.
