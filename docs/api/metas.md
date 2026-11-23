# Metas de ahorro

> **Spec de origen:** SPEC 13 · **Necesidades:** `specs/necesidades/metas.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Metas de ahorro sobre una cuenta real, con su avance, ritmo, historial y
cumplimiento. Dos modos:

- **`apartado`**: separa parte del saldo de una cuenta de **efectivo o banco**.
  Varias metas por apartado pueden compartir cuenta.
- **`cuenta`**: toma la cuenta entera (**efectivo, banco o inversión**): su
  saldo, o su valor de mercado en COP si es inversión. Es exclusiva: una
  cuenta con una meta de modo `cuenta` sin archivar no admite otra meta, en
  ningún modo.

**Todo lo calcula la API**: avance, falta, porcentaje, cumplimiento, uso,
ritmo, saldo libre, historial, totales y orden. El cliente muestra lo que llega
y arma las frases («faltan 1.200.000 en 34 días», «alrededor de mayo de 2028»,
«El dinero se usó el 14 sep en el taller», «Nubank tiene 2.500.000: …»).

**Todavía no:** aportes a una meta sobre inversión (el cliente lleva a «Ver
inversiones»), cuenta de origen en USD, objetivo en otra moneda que COP, avisos
de metas, metas en el resumen del mes o saldo libre en la pantalla Cuentas, y
consultar el historial de cambios de una meta.

---

## Resumen de endpoints

| Método y ruta | Cuerpo | Éxito |
|---|---|---|
| [`GET /metas`](#get-metas) | — | `200 MetasDto` |
| [`GET /metas/archivadas`](#get-metasarchivadas) | — | `200 MetaDto[]` |
| [`GET /metas/:id`](#get-metasid) | — | `200 MetaDetalleDto` |
| [`POST /metas`](#post-metas) | `MetaCuerpo` | `201 MetaDetalleDto` |
| [`PATCH /metas/:id`](#patch-metasid) | `MetaCambio` | `200 MetaDetalleDto` |
| [`DELETE /metas/:id`](#delete-metasid) | — | `204` sin cuerpo |
| [`POST /metas/:id/archivar`](#post-metasidarchivar) | — | `200 MetaDto` |
| [`POST /metas/:id/restaurar`](#post-metasidrestaurar) | — | `200 MetaDetalleDto` |
| [`POST /metas/:id/aportes`](#post-metasidaportes) | `AporteCuerpo` | `201 MetaDetalleDto` |
| [`PUT /metas/:id/aportes/:aporteId`](#put-metasidaportesaporteid) | `AporteCambio` | `200 MetaDetalleDto` |
| [`DELETE /metas/:id/aportes/:aporteId`](#delete-metasidaportesaporteid) | — | `204` sin cuerpo |

`:id` y `:aporteId` son UUID. Uno mal formado responde `400
ENTRADA_INVALIDA`. Una meta que no existe o es de otro usuario responde `404
META_NO_ENCONTRADA` en todas las rutas; un aporte que no es de esa meta, `404
APORTE_NO_ENCONTRADO`.

---

## Conceptos

### Aportar no es mover dinero

En modo `apartado`:

- Un **aporte sin cuenta de origen** solo marca dinero que ya está en la
  cuenta. No puede superar el **saldo libre** (`SALDO_LIBRE_INSUFICIENTE`).
- Un **aporte con cuenta de origen** además registra la transferencia real del
  origen a la cuenta de la meta (RN-16): sale en `/movimientos` como
  `transferencia` sin categoría, con descripción `Aporte a <meta>`. El aporte
  **no guarda monto propio**: lo lee de su transferencia. Si se edita en
  `PUT /movimientos/:id`, la meta lo refleja.
- Un **retiro** libera lo apartado (motivo opcional). No registra ningún
  gasto: si el dinero se gastó, el gasto se registra aparte en `/movimientos`.

En modo `cuenta`, un aporte es una transferencia común hacia la cuenta (exige
origen). No hay retiros: el avance es el saldo de la cuenta. Sobre una
inversión no hay aportes: el avance sigue a la inversión.

### Avance

No se guarda (RN-01), se calcula en cada lectura:

| Meta | Avance |
|---|---|
| `apartado` | Σ aportes − Σ retiros. |
| `cuenta` en efectivo o banco | Saldo de la cuenta (el mismo de `GET /cuentas`). |
| `cuenta` en inversión | Valor de mercado en COP a la TRM de hoy. Una inversión USD sin TRM: `avance: null`. |

El objetivo es siempre COP.

### Saldo libre

`saldo de la cuenta − Σ lo apartado en sus metas por apartado` (sin
archivar). Un gasto **nunca** se bloquea por lo apartado (RN-16): el saldo
libre puede quedar negativo y entonces `apartados.excedido` es `true`.

### Cumplimiento

Una meta pasa sola a cumplida la primera vez que su avance llega al objetivo,
y lo sigue siendo:

- `apartado`: el primer día en que lo apartado al cierre del día llega al
  objetivo. Se deriva: corregir un aporte puede volverla activa.
- `cuenta` en efectivo o banco: el primer día, desde la creación de la meta, en
  que el saldo al cierre llega al objetivo. También se deriva.
- `cuenta` en inversión: se **guarda** la primera vez que una lectura
  (`GET /metas` o `GET /metas/:id`) lo detecta, con la fecha de hoy y el avance
  de ese momento. No se revierte aunque el valor baje.

Una cumplida muestra el **avance que tenía al cumplirse**: los retiros
posteriores no lo bajan. `uso` trae el primer retiro desde el cumplimiento
(«el dinero se usó el … en …»). Una cumplida no admite aportes
(`META_CUMPLIDA`) ni se edita; sí admite retiros y correcciones de sus
aportes.

### Ritmo (solo activas)

| Fecha meta | `ritmo` |
|---|---|
| Día (`"2026-12-15"`) | `{ tipo: "dias", falta, dias, vencida }`, con `dias` los que quedan hasta la fecha (0 si pasó). |
| Mes (`"2027-12"`) | `{ tipo: "meses", falta, meses, cuotaMensual, vencida }`. `meses`: meses calendario de hoy a la fecha; `cuotaMensual = ceil(falta ÷ meses)`, o `falta` si quedan 0. |
| Sin fecha | `{ tipo: "promedio", promedioMensual, mesEstimado }`: el avance neto promedio de los últimos 6 meses calendario (el actual incluido, o los que lleva la meta si son menos), y el mes estimado de llegada `"YYYY-MM"`. Sin avance neto positivo, los dos son `null`. |

`vencida`: la fecha meta ya pasó (un mes se cuenta hasta su último día).
Una meta con `avance: null` trae `ritmo: null`.

Ejemplos del diseño: 1.900.000 apartados de 7.500.000 en 6 meses →
`promedioMensual: "316667"`, falta 5.600.000 → 18 meses → `mesEstimado`
`"2028-05"` (desde nov 2026). 13.070.000 de nov 2026 a dic 2027 → 13 meses →
`cuotaMensual: "1005385"`.

### Porcentaje

Entero en **centésimas, truncado**: `floor(avance × 10000 ÷ objetivo)`.
1.900.000 de 7.500.000 → `2533` → «25,3 %» (el cliente muestra un decimal
truncado y topa la barra en 100 %). Un avance negativo cuenta como 0. Puede
pasar de `10000`.

### Cambiar la cuenta de una meta por apartado

Lo apartado se mueve con la meta y debe caber en el saldo libre de la nueva
cuenta. Los aportes con origen conservan su transferencia hacia la cuenta
anterior: la transferencia es la historia de cómo llegó el dinero; la
asignación cuenta en la cuenta vigente de la meta.

### Historial (RN-13)

Toda edición de la meta y de sus aportes, y su eliminación, queda registrada
en la base, sin endpoint de lectura por ahora. Los cambios de la
transferencia de un aporte quedan en el historial de movimientos.

---

## Tipos

```ts
type ModoMeta = "apartado" | "cuenta";

type CuentaMetaDto = {
  id: string;
  nombre: string;
  tipo: "efectivo" | "banco" | "inversion"; // icono del tipo
  moneda: "COP" | "USD";
};

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
  avance: string | null;       // null: inversión USD sin TRM. En una cumplida, el del cumplimiento.
  falta: string | null;        // max(0, objetivo − avance)
  porcentaje: number | null;   // centésimas, truncado
  fechaMeta: string | null;    // "YYYY-MM-DD" o "YYYY-MM"
  cumplidaEl: string | null;   // "YYYY-MM-DD"
  uso: { fecha: string; motivo: string | null } | null; // primer retiro desde el cumplimiento
  ritmo: RitmoDto | null;      // null en cumplidas
  creadaEl: string;            // "YYYY-MM-DD" en la zona del usuario
  archivadaEn: string | null;  // ISO 8601 UTC
};

type MetasDto = {
  fechaHoy: string;
  trm: TrmDto | null;          // la de hoy (ver trm.md)
  totales: {
    avance: string;            // Σ avance de las activas
    objetivo: string;          // Σ objetivo de las activas
    incompleto: boolean;       // alguna activa con avance null no sumó
  };
  activas: MetaDto[];
  cumplidas: MetaDto[];
};

type FilaAporteDto = {
  id: string;
  tipo: "aporte" | "retiro";
  fecha: string;
  monto: string;               // positivo; el signo lo pone el cliente según tipo
  acumulado: string;           // lo apartado tras esta fila
  inicial: boolean;            // «Apartado inicial»
  motivo: string | null;
  cuentaOrigen: { id: string; nombre: string } | null; // «Aporte desde Bancolombia»
  movimientoId: string | null; // la transferencia, editable en /movimientos
};

type FilaValorDto = {
  tipo: "cierre" | "hoy";
  fecha: string;
  valor: string | null;        // avance en esa fecha, en COP
  variacion: string | null;    // valor − valor de la fila anterior; null en la primera
  trm: TrmDto | null;          // solo en "hoy" de una cuenta USD
};

type MetaDetalleDto = MetaDto & {
  historial: FilaAporteDto[] | FilaValorDto[]; // por modo
  apartados: {                 // solo en "apartado"
    saldoCuenta: string;
    apartadoAqui: string;
    otras: { metaId: string; nombre: string; apartado: string }[];
    libre: string;             // puede ser negativo
    excedido: boolean;
  } | null;
  inversion: {                 // solo sobre una inversión
    valorMercado: string;      // en la moneda de la cuenta
    moneda: "COP" | "USD";
    trm: TrmDto | null;        // la aplicada, en USD
  } | null;
};
```

---

## `GET /metas`

Metas **no archivadas**, en dos grupos. El cliente oculta el grupo vacío y,
sin ninguna, muestra el estado vacío.

- `activas`: por `fechaMeta` más cercana; sin fecha al final; empate por
  creación.
- `cumplidas`: por `cumplidaEl`, la más reciente primero.

Valora las inversiones como `GET /cuentas` (trae antes los precios
automáticos vencidos) y guarda el cumplimiento de una meta sobre inversión
cuando lo detecta.

```json
{
  "fechaHoy": "2026-11-11",
  "trm": { "valor": "4120.00", "vigenteDesde": "2026-11-11", "vigenteHasta": "2026-11-11", "fuente": "Superintendencia Financiera de Colombia" },
  "totales": { "avance": "34430000", "objetivo": "54300000", "incompleto": false },
  "activas": [
    {
      "id": "8c1f…", "nombre": "Viaje a Cartagena", "modo": "apartado",
      "cuenta": { "id": "a41e…", "nombre": "Nubank", "tipo": "banco", "moneda": "COP" },
      "objetivo": "1800000", "avance": "600000", "falta": "1200000", "porcentaje": 3333,
      "fechaMeta": "2026-12-15", "cumplidaEl": null, "uso": null,
      "ritmo": { "tipo": "dias", "falta": "1200000", "dias": 34, "vencida": false },
      "creadaEl": "2026-09-20", "archivadaEn": null
    }
  ],
  "cumplidas": []
}
```

---

## `GET /metas/archivadas`

Metas archivadas, la archivada más recientemente primero. `200 MetaDto[]`.

---

## `GET /metas/:id`

Detalle, también de una archivada. Refresca los precios de su inversión como
`GET /inversiones/:id`.

- **Historial de una meta por apartado:** sus aportes y retiros, el más
  reciente primero, con el acumulado tras cada uno.
- **Historial de una meta de modo `cuenta`:** una fila `cierre` por cada fin de
  mes desde el mes de creación hasta el anterior a hoy, y una fila `hoy`. La
  primera fila es la fecha de creación si no es fin de mes. En una inversión,
  cada valor usa el precio vigente y la TRM de su fecha (los cierres faltantes
  de precios automáticos se completan al leer).
- **`apartados`**: la nota de apartado compartido (N-24) y si lo apartado
  supera el saldo (`excedido`).
- **`inversion`**: valor de mercado en la moneda de la cuenta y TRM aplicada.

---

## `POST /metas`

```ts
type MetaCuerpo = {
  nombre: string;              // 1 a 60 tras recortar
  cuentaId: string;
  modo: "apartado" | "cuenta";
  objetivo: string;            // pesos, > 0
  fechaMeta?: string | null;   // "YYYY-MM-DD" (no anterior a hoy) o "YYYY-MM" (no anterior al mes actual)
  aporteInicial?: {            // solo en "apartado"; fecha = hoy
    monto: string;
    cuentaOrigenId?: string | null;
  } | null;
};
```

Nombres repetidos se admiten. **201** `MetaDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `NOMBRE_INVALIDO` | `nombre` | Vacío o de más de 60 caracteres. |
| 400 | `MONTO_INVALIDO` | `objetivo` o `aporteInicial.monto` | No es un entero en pesos mayor que 0. |
| 400 | `MODO_INVALIDO` | `modo` | No es `apartado` ni `cuenta`. |
| 400 | `FECHA_INVALIDA` | `fechaMeta` | No es `YYYY-MM-DD` ni `YYYY-MM` válida. |
| 422 | `FECHA_META_PASADA` | `fechaMeta` | Día anterior a hoy o mes anterior al actual. |
| 422 | `APORTE_INICIAL_NO_ADMITIDO` | `aporteInicial` | `aporteInicial` en modo `cuenta`. |
| 422 | `CUENTA_INVALIDA` | `cuentaId` | La cuenta no existe o es de otro usuario. |
| 422 | `CUENTA_NO_ADMITIDA` | `cuentaId` | Tipo que el modo no admite (tarjeta, préstamo; inversión en `apartado`). |
| 409 | `CUENTA_ARCHIVADA` | `cuentaId` | La cuenta está archivada. |
| 409 | `CUENTA_CON_META_EXCLUSIVA` | `cuentaId` | La cuenta ya tiene una meta de modo `cuenta`, o se pide una de modo `cuenta` sobre una cuenta con metas por apartado. |
| 422 | `SALDO_LIBRE_INSUFICIENTE` | `monto` | El apartado inicial sin origen supera el saldo libre. |
| 422 | `CUENTA_INVALIDA` | `cuentaOrigenId` | El origen no existe, no es COP, es la cuenta de la meta o es un préstamo. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaOrigenId` | El origen está archivado. |
| 422 | `EFECTIVO_INSUFICIENTE` | — | El origen es una inversión y quedaría con efectivo negativo. |

---

## `PATCH /metas/:id`

```ts
type MetaCambio = {
  nombre?: string;
  cuentaId?: string;
  modo?: "apartado" | "cuenta";
  objetivo?: string;
  fechaMeta?: string | null;   // null la quita
};
```

Ausente no toca el campo. Mismas reglas que el alta para cada campo enviado.
**200** `MetaDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 409 | `META_ARCHIVADA` | — | La meta está archivada. |
| 409 | `META_CUMPLIDA` | — | La meta ya se cumplió. |
| 409 | `META_CON_APORTES` | `modo` | Cambio de modo con aportes o retiros registrados. |
| 422 | `SALDO_LIBRE_INSUFICIENTE` | `monto` | Lo apartado no cabe en el saldo libre de la nueva cuenta. |
| … | los del alta | | `NOMBRE_INVALIDO`, `MONTO_INVALIDO`, `MODO_INVALIDO`, `FECHA_INVALIDA`, `FECHA_META_PASADA`, `CUENTA_INVALIDA`, `CUENTA_NO_ADMITIDA`, `CUENTA_ARCHIVADA`, `CUENTA_CON_META_EXCLUSIVA`. |

---

## `DELETE /metas/:id`

Borra la meta y sus aportes y retiros, en cualquier estado. Libera lo
apartado. **Las transferencias de sus aportes siguen en `/movimientos`**:
eran dinero real. **La confirmación la pide el cliente.** **204** sin cuerpo.

---

## `POST /metas/:id/archivar`

Archiva una **cumplida**: sale de `GET /metas` y aparece en
`GET /metas/archivadas`. En modo `apartado` exige lo apartado en 0 (primero un
retiro). Sin cuerpo. **200** `MetaDto` con `archivadaEn`.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 409 | `META_NO_CUMPLIDA` | La meta no está cumplida. |
| 409 | `APARTADO_NO_CERO` | Por apartado, con dinero todavía apartado. |
| 409 | `META_ARCHIVADA` | Ya estaba archivada. |

Una archivada no admite aportes, retiros ni ediciones (`META_ARCHIVADA`).

---

## `POST /metas/:id/restaurar`

La meta vuelve a `GET /metas`. Sin cuerpo. **200** `MetaDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 409 | `META_NO_ARCHIVADA` | — | No estaba archivada. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaId` | Su cuenta está archivada. |
| 409 | `CUENTA_CON_META_EXCLUSIVA` | `cuentaId` | Mientras estaba archivada, la cuenta recibió una meta que la excluye. |

---

## `POST /metas/:id/aportes`

```ts
type AporteCuerpo = {
  tipo: "aporte" | "retiro";
  monto: string;                 // pesos, > 0
  fecha: string;                 // "YYYY-MM-DD", entre la creación de la meta y hoy
  cuentaOrigenId?: string | null; // solo en aportes
  motivo?: string | null;        // 1 a 80
};
```

**201** `MetaDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 409 | `META_ARCHIVADA` | — | La meta está archivada. |
| 409 | `META_CUMPLIDA` | — | Un aporte a una cumplida (un retiro sí se admite). |
| 422 | `RETIRO_NO_ADMITIDO` | `tipo` | Retiro en una meta de modo `cuenta`. |
| 422 | `META_DE_INVERSION` | — | Aporte a una meta sobre inversión. |
| 422 | `ORIGEN_REQUERIDO` | `cuentaOrigenId` | Aporte a una meta de modo `cuenta` sin origen. |
| 422 | `ORIGEN_NO_ADMITIDO` | `cuentaOrigenId` | Un retiro con origen. |
| 400 | `MONTO_INVALIDO` | `monto` | No es un entero en pesos mayor que 0. |
| 400 | `FECHA_INVALIDA` | `fecha` | No es una fecha válida. |
| 422 | `FECHA_ANTERIOR_A_META` | `fecha` | Anterior a la creación de la meta. |
| 400 | `FECHA_FUTURA` | `fecha` | Posterior a hoy. |
| 400 | `MOTIVO_INVALIDO` | `motivo` | Vacío o de más de 80 caracteres. |
| 422 | `SALDO_LIBRE_INSUFICIENTE` | `monto` | Aporte sin origen que supera el saldo libre. |
| 422 | `APARTADO_INSUFICIENTE` | `monto` | El retiro deja lo apartado negativo algún día. |
| 422 | `CUENTA_INVALIDA` | `cuentaOrigenId` | El origen no existe, no es COP, es la cuenta de la meta o es un préstamo. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaOrigenId` | El origen está archivado. |
| 422 | `EFECTIVO_INSUFICIENTE` | — | El origen es una inversión y quedaría con efectivo negativo. |

---

## `PUT /metas/:id/aportes/:aporteId`

Reemplaza un aporte o retiro de una meta por apartado. El `tipo` es fijo.

```ts
type AporteCambio = {
  monto: string;
  fecha: string;
  cuentaOrigenId?: string | null; // obligatorio si el aporte tiene origen; prohibido si no
  motivo?: string | null;
};
```

Con origen, cambia la transferencia (monto, fecha, cuenta de origen) con su
historial. Se admite en una cumplida: corregir puede volverla activa. **200**
`MetaDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 404 | `APORTE_NO_ENCONTRADO` | — | No es un aporte de esa meta. |
| 422 | `ORIGEN_FIJO` | `cuentaOrigenId` | Se agrega o se quita la cuenta de origen. |
| … | los del `POST` | | Monto, fecha, motivo, saldo libre, `APARTADO_INSUFICIENTE`, cuenta de origen, `META_ARCHIVADA`. |

---

## `DELETE /metas/:id/aportes/:aporteId`

Borra un aporte o retiro. **Con origen, borra también su transferencia**, con
historial (RN-13): es corregir un registro. **204** sin cuerpo.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `APORTE_NO_ENCONTRADO` | No es un aporte de esa meta. |
| 409 | `META_ARCHIVADA` | La meta está archivada. |
| 422 | `APARTADO_INSUFICIENTE` | Borrarlo deja lo apartado negativo algún día (p. ej. el aporte que pagó un retiro posterior). |

---

## Efectos en otros módulos

- `POST /cuentas/:id/archivar` y `DELETE /cuentas/:id`: `409 CUENTA_CON_METAS`
  si la cuenta tiene metas sin archivar. `DELETE` también con metas
  archivadas (hay que eliminarlas). Ver [`cuentas.md`](cuentas.md).
- `PUT /movimientos/:id` de la transferencia de un aporte: el `tipo` sigue
  siendo `transferencia` (`422 MOVIMIENTO_DE_META`); montos, fecha y cuentas
  sí cambian. `DELETE` borra también el aporte. Ver
  [`movimientos.md`](movimientos.md).

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `META_NO_ENCONTRADA` | 404 | — | Esa meta no existe. |
| `APORTE_NO_ENCONTRADO` | 404 | — | Ese aporte no existe. |
| `NOMBRE_INVALIDO` | 400 | `nombre` | Escribe un nombre de 1 a 60 caracteres. |
| `MODO_INVALIDO` | 400 | `modo` | Elige apartado o toda la cuenta. |
| `MOTIVO_INVALIDO` | 400 | `motivo` | El motivo tiene de 1 a 80 caracteres. |
| `MONTO_INVALIDO` | 400 | según el caso | Escribe un valor en pesos, sin decimales. |
| `FECHA_INVALIDA` | 400 | `fecha` o `fechaMeta` | Escribe una fecha válida. |
| `FECHA_FUTURA` | 400 | `fecha` | La fecha no puede ser futura. |
| `CUENTA_INVALIDA` | 422 | `cuentaId` o `cuentaOrigenId` | La cuenta no existe. |
| `CUENTA_NO_ADMITIDA` | 422 | `cuentaId` | Esa cuenta no admite este tipo de meta. |
| `CUENTA_ARCHIVADA` | 409 | `cuentaId` o `cuentaOrigenId` | La cuenta está archivada. Restáurala para modificarla. |
| `FECHA_META_PASADA` | 422 | `fechaMeta` | La fecha meta no puede estar en el pasado. |
| `FECHA_ANTERIOR_A_META` | 422 | `fecha` | La fecha no puede ser anterior a la creación de la meta. |
| `APORTE_INICIAL_NO_ADMITIDO` | 422 | `aporteInicial` | Solo una meta por apartado lleva apartado inicial. |
| `SALDO_LIBRE_INSUFICIENTE` | 422 | `monto` | La cuenta no tiene saldo libre suficiente. |
| `APARTADO_INSUFICIENTE` | 422 | `monto` | Lo apartado no alcanza para ese retiro. |
| `ORIGEN_NO_ADMITIDO` | 422 | `cuentaOrigenId` | Un retiro no lleva cuenta de origen. |
| `ORIGEN_REQUERIDO` | 400 | `cuentaOrigenId` | Elige la cuenta de origen. |
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
| `EFECTIVO_INSUFICIENTE` | 422 | — | No hay efectivo suficiente en la cuenta. Registra primero el fondeo. |

Más los comunes: `NO_AUTENTICADO`, `ENTRADA_INVALIDA`, `ERROR_INTERNO`.
`CUENTA_CON_METAS` y `MOVIMIENTO_DE_META` salen en Cuentas y Movimientos.

---

## Necesidades → contrato

Las `N-xx` son de `specs/necesidades/metas.md`.

| N-xx | Dónde está |
|---|---|
| N-05, N-06 | `MetasDto.totales`. |
| N-07 | `POST /metas`. |
| N-08, N-61 | `MetasDto.activas` y `cumplidas`; el cliente oculta el grupo vacío y muestra el estado vacío. |
| N-09 | Orden de `activas` y `cumplidas`. |
| N-10 a N-14, N-33 | `nombre`, `avance`, `objetivo`, `porcentaje`, `fechaMeta`, `cumplidaEl`, `creadaEl`, `cuenta`. |
| N-15 | `cumplidaEl` y el grupo. |
| N-16 | `GET /metas/:id`. |
| N-17, N-62 | `cuenta` (`tipo`) y `modo`. |
| N-18 | `falta`. |
| N-19 a N-21, N-63 | `ritmo`. |
| N-22, N-23 | `cumplidaEl`, `uso`; `avance` de la cumplida. |
| N-24, N-25 | `MetaDetalleDto.apartados`. |
| N-26, N-42 | `MetaDetalleDto.inversion`; `cuenta.id` lleva a la inversión. |
| N-27 a N-29 | `FilaAporteDto`. |
| N-30 a N-32 | `FilaValorDto`. |
| N-34, N-35, N-41 | `POST /metas/:id/aportes`. |
| N-36, N-37 | `SALDO_LIBRE_INSUFICIENTE`, `MONTO_INVALIDO`. |
| N-38, N-39 | `tipo: "retiro"`; `APARTADO_INSUFICIENTE`. |
| N-40, N-46 | `PUT` y `DELETE /metas/:id/aportes/:aporteId`; historial en la base. |
| N-43 | `META_CUMPLIDA`; el cliente oculta las acciones con `cumplidaEl`. |
| N-44, N-45 | `PATCH /metas/:id`; `SALDO_LIBRE_INSUFICIENTE`, `META_CON_APORTES`. |
| N-47 | `DELETE /metas/:id`. |
| N-48, N-49, N-65 | `archivar`, `GET /metas/archivadas`, `restaurar`. |
| N-50 a N-54 | Validaciones del alta. |
| N-55 | `aporteInicial`; `FilaAporteDto.inicial`. |
| N-56 | `CUENTA_CON_META_EXCLUSIVA`. |
| N-57, N-59 | Objetivo en COP; `avance: null` y `totales.incompleto`. |
| N-58 | Cumplimiento. |
| N-60 | `CUENTA_CON_METAS` en Cuentas. |
