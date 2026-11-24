# Cuentas

> **Spec de origen:** SPEC 03 (saldo con movimientos y `CUENTA_CON_MOVIMIENTOS`: SPEC 04; `CUENTA_CON_RECURRENTES`: SPEC 07; préstamos en el patrimonio: SPEC 08; inversiones, `moneda` y TRM: SPEC 10; `CUENTA_CON_METAS`: SPEC 13; `GET /cuentas/:id`, historial, conciliación, ajuste de saldo, ciclo y condiciones de la tarjeta: SPEC 14) · **Necesidades:** `specs/necesidades/cuentas.md`, `specs/necesidades/detalle-cuenta.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Cuentas del usuario agrupadas en activos y pasivos, con saldos, totales y
patrimonio neto calculados por la API. Alta, edición, orden, archivo,
restauración y borrado.

**Hoy existen:** `efectivo`, `banco` y `tarjeta_credito` (con sus condiciones
y su ciclo, SPEC 14), en COP, y las **inversiones** (SPEC 10), en COP o USD.
**Todavía no:** préstamos como líneas de esta pantalla.

**Detalle de una cuenta** (SPEC 14): efectivo y banco tienen historial con saldo
corrido, conciliación por cuenta y ajuste de saldo; la tarjeta tiene su ciclo de
facturación. Ver [Detalle de cuenta](#detalle-de-cuenta-spec-14) y
[Tarjeta de crédito con ciclo](#tarjeta-de-crédito-con-ciclo-spec-14). Una
inversión mantiene su detalle en [`inversiones.md`](inversiones.md).

**Inversiones** (SPEC 10): una inversión es una cuenta de tipo `inversion` que
va en `activos`, con su `saldo` a **valor de mercado en COP**. Nace en
[`POST /inversiones`](inversiones.md), no en `POST /cuentas`; su detalle,
operaciones y precios viven en [`inversiones.md`](inversiones.md). Aquí se
renombra, se le cambia el detalle o el efectivo inicial, se ordena, se archiva
y se restaura como cualquier otra.

**Préstamos y deudas con personas** (SPEC 08) viven en
[`prestamos.md`](prestamos.md). No salen en los grupos ni en ninguna ruta de
`/cuentas`, pero su capital entra en `patrimonioNeto` (campo `prestamos`). Los movimientos viven en
[`movimientos.md`](movimientos.md). El cliente no debe dibujar datos
de esas funciones como si vinieran de la API.

---

## Resumen de endpoints

| Método y ruta | Cuerpo | Éxito |
|---|---|---|
| [`GET /cuentas`](#get-cuentas) | — | `200 ListaCuentasDto` |
| [`GET /cuentas/archivadas`](#get-cuentasarchivadas) | — | `200 { cuentas: CuentaDto[] }` |
| [`GET /cuentas/:id`](#get-cuentasid) | — | `200 CuentaDto`, también archivada |
| [`POST /cuentas`](#post-cuentas) | `AltaCuenta` | `201 CuentaDto` |
| [`PATCH /cuentas/:id`](#patch-cuentasid) | `EdicionCuenta` | `200 CuentaDto` |
| [`DELETE /cuentas/:id`](#delete-cuentasid) | — | `204` sin cuerpo |
| [`PUT /cuentas/orden`](#put-cuentasorden) | `{ naturaleza, ids }` | `204` sin cuerpo |
| [`POST /cuentas/:id/archivar`](#post-cuentasidarchivar) | — | `200 CuentaDto` |
| [`POST /cuentas/:id/restaurar`](#post-cuentasidrestaurar) | `{ nombre? }` (opcional) | `200 CuentaDto` |
| [`GET /cuentas/:id/historial`](#get-cuentasidhistorial) | `?desde=&hasta=` | `200 HistorialDto` |
| [`PUT /cuentas/:id/conciliacion`](#put-cuentasidconciliacion) | `{ movimientoIds, conciliado }` | `204` sin cuerpo |
| [`POST /cuentas/:id/ajustes`](#post-cuentasidajustes) | `{ saldoReal, conciliarHastaHoy? }` | `201 MovimientoDto` |
| [`GET /cuentas/:id/ciclo`](#get-cuentasidciclo) | `?compra=` | `200 CicloDto` |

`:id` es un UUID. Uno mal formado responde `400 ENTRADA_INVALIDA`; uno que no
existe, es de otro usuario o es el de un préstamo, `404 CUENTA_NO_ENCONTRADA`.

---

## Tipos

```ts
type TipoCuenta = "efectivo" | "banco" | "tarjeta_credito" | "inversion"; // inversion: solo la crea POST /inversiones
type Naturaleza = "activo" | "pasivo"; // efectivo, banco e inversion → activo; tarjeta_credito → pasivo
type Moneda = "COP" | "USD";

type CuentaDto = {
  id: string;                 // UUID
  nombre: string;
  tipo: TipoCuenta;
  moneda: Moneda;             // "COP" salvo en una inversión en dólares; fija
  naturaleza: Naturaleza;     // la calcula la API desde el tipo
  detalle: string | null;     // texto libre ≤ 60 (ej. "Ahorros ·· 4821")
  saldo: string;              // saldo actual; en un pasivo, la DEUDA vigente, positiva;
                              // en una inversión, su valor de mercado en COP ("0" si es USD y no hay TRM)
  saldoInicial: string;       // en un pasivo, la deuda inicial; en una inversión, el efectivo inicial en su moneda
  tarjeta: TarjetaDto | null; // solo en tarjeta_credito; null en las demás
  inversion: {                // solo en una inversión; null en las demás. En su moneda
    efectivo: string;
    valorMercado: string;     // efectivo + posiciones
    tasa: string | null;      // TRM aplicada ("4120.00"); null en COP o sin TRM
  } | null;
  archivadaEn: string | null; // ISO 8601; null = no archivada
};

type Ref = { id: string; nombre: string };

type TarjetaDto = {
  cupo: string;               // cupo total
  disponible: string;         // cupo − deuda; puede ser negativo si la deuda excede el cupo
  porcentajeUsado: number;    // entero 0–100, truncado (32,1 % → 32), acotado a 100
  // Condiciones (SPEC 14). Una tarjeta creada antes de SPEC 14 las trae todas en null.
  diaCorte: number | null;          // 1–31; en un mes más corto, su último día
  diaPago: number | null;           // 1–31
  tasaMensual: number | null;       // centésimas de punto: 198 = 1,98 % M.V.
  tasaEfectivaAnual: number | null; // centésimas de punto, truncado: 2652 = 26,52 % E.A.
  cuotaManejo: string | null;       // pesos al mes
  cuentaPago: Ref | null;           // efectivo o banco desde la que se paga
};

type GrupoCuentasDto = {
  total: string;              // suma de los saldos del grupo; "0" si está vacío
  cuentas: CuentaDto[];       // en el orden del usuario
};

type ListaCuentasDto = {
  fechaSaldos: string;        // "YYYY-MM-DD": hoy en la zona horaria del perfil
  activos: GrupoCuentasDto;
  pasivos: GrupoCuentasDto;
  prestamos: {                // capital pendiente de los préstamos (SPEC 08); no salen en los grupos
    teDeben: string;          // Σ préstamos otorgados
    debes: string;            // Σ deudas contraídas, positiva
  };
  patrimonioNeto: string;     // activos.total − pasivos.total + prestamos.teDeben − prestamos.debes; puede ser negativo
  trm: TrmDto | null;         // TRM de hoy (ver trm.md), para la cabecera; null si nunca se obtuvo
  trmDesactualizada: boolean; // true: la fuente falló y trm es la última conocida
};
```

### Inversiones en la lista

- `saldo` es el valor de mercado en COP: con la TRM de hoy si la cuenta es USD.
  Así `activos.total` y `patrimonioNeto` incluyen las inversiones a mercado.
- El cliente muestra el valor en su moneda con `inversion.valorMercado`, el
  equivalente con `saldo` y la tasa con `inversion.tasa` (REGLAS §6).
- Una inversión USD sin TRM nunca obtenida vale `"0"` en `saldo` y trae
  `inversion.tasa: null`: el cliente indica que falta la tasa.
- `tarjeta` es `null`.

### Saldo de un pasivo: lo pone el cliente

El saldo de un pasivo viaja **positivo** porque es la deuda. El signo «−» y la
leyenda «deuda» son presentación y los pone el cliente según `naturaleza`:

| `naturaleza` | `saldo` | Se muestra |
|---|---|---|
| `activo` | `"20321"` | `20.321 COP` |
| `pasivo` | `"1284300"` | `−1.284.300 COP` · deuda |

`pasivos.total` también viaja positivo. `patrimonioNeto` ya viene con su signo
(`"-1263979"`) y se muestra tal cual.

### Saldo actual

`saldo` = `saldoInicial` + efecto de **todos** los movimientos de la cuenta
(SPEC 04), también los de fecha futura. En un activo, un gasto lo baja y un
ingreso lo sube; en un pasivo (tarjeta), un gasto sube la deuda y una
transferencia hacia la tarjeta (pago) la baja. Se recalcula en cada lectura:
tras crear, editar o eliminar un movimiento, `GET /cuentas` ya lo refleja.

El cliente usa siempre `saldo` para mostrar y `saldoInicial` solo para
editarlo.

---

## `GET /cuentas`

Cuentas **no archivadas**, agrupadas, en el orden del usuario, con totales y
patrimonio.

**200**

```json
{
  "fechaSaldos": "2026-11-18",
  "activos": {
    "total": "20321",
    "cuentas": [
      {
        "id": "0f9c6c1e-3a52-4c51-9a7e-2b1f0d6f5a11",
        "nombre": "Nequi",
        "tipo": "banco",
        "moneda": "COP",
        "naturaleza": "activo",
        "detalle": null,
        "saldo": "20321",
        "saldoInicial": "20321",
        "tarjeta": null,
        "inversion": null,
        "archivadaEn": null
      }
    ]
  },
  "pasivos": {
    "total": "1284300",
    "cuentas": [
      {
        "id": "7d2b8e40-91c3-4f0e-8b6a-5c4d3e2f1a09",
        "nombre": "Tarjeta",
        "tipo": "tarjeta_credito",
        "moneda": "COP",
        "naturaleza": "pasivo",
        "detalle": "Visa ·· 1234",
        "saldo": "1284300",
        "saldoInicial": "1284300",
        "tarjeta": { "cupo": "4000000", "disponible": "2715700", "porcentajeUsado": 32 },
        "inversion": null,
        "archivadaEn": null
      }
    ]
  },
  "prestamos": { "teDeben": "0", "debes": "0" },
  "patrimonioNeto": "-1263979",
  "trm": { "valor": "4120.00", "vigenteDesde": "2026-11-18", "vigenteHasta": "2026-11-18", "fuente": "Superintendencia Financiera de Colombia" },
  "trmDesactualizada": false
}
```

**Usuario sin cuentas:** también `200`, con los dos grupos vacíos:

```json
{
  "fechaSaldos": "2026-11-18",
  "activos": { "total": "0", "cuentas": [] },
  "pasivos": { "total": "0", "cuentas": [] },
  "prestamos": { "teDeben": "0", "debes": "0" },
  "patrimonioNeto": "0",
  "trm": null,
  "trmDesactualizada": false
}
```

- El orden de `cuentas` dentro de cada grupo es el que eligió el usuario, igual
  en web y celular. El cliente no reordena: dibuja el arreglo como llega.
- Una cuenta nueva o restaurada aparece al final de su grupo.
- `fechaSaldos` es la fecha a la que están los saldos («Saldos al 18 nov»).
- `prestamos`: lo que te deben y lo que debes a personas (SPEC 08). Solo entra
  en el patrimonio; el detalle está en [`GET /prestamos`](prestamos.md). Los
  intereses causados no se suman.

Errores: solo los comunes (`401`, `500`).

---

## `GET /cuentas/archivadas`

**200** `{ "cuentas": CuentaDto[] }`, la archivada más reciente primero. Cada
una trae `archivadaEn`. Lista vacía: `{ "cuentas": [] }`.

Errores: solo los comunes.

---

## `GET /cuentas/:id`

Una cuenta (SPEC 14), **también archivada**, con su saldo y, si es tarjeta, sus
condiciones. Una inversión se valora como en `GET /cuentas`.

**200** `CuentaDto`.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `CUENTA_NO_ENCONTRADA` | No existe, es de otro usuario o es un préstamo. |

---

## `POST /cuentas`

Crea una cuenta. Queda al final de su grupo.

```ts
type AltaCuenta = {
  nombre: string;          // obligatorio; se recortan espacios; 1–60 caracteres
  tipo: TipoCuenta;        // obligatorio
  detalle?: string;        // opcional; ≤ 60; "" equivale a no enviarlo (queda null)
  saldoInicial: string;    // obligatorio; entero ≥ 0, ^\d{1,19}$. En la tarjeta, la deuda inicial
  cupo?: string;           // obligatorio y > 0 en tarjeta_credito; prohibido en las demás
  tarjeta?: CondicionesTarjeta; // obligatorio con diaCorte y diaPago en tarjeta_credito; prohibido en las demás
};

type CondicionesTarjeta = {
  diaCorte?: number;              // entero 1–31
  diaPago?: number;               // entero 1–31
  tasaMensual?: number | null;    // entero 0–10000, centésimas de punto
  cuotaManejo?: string | null;    // ^\d{1,19}$
  cuentaPagoId?: string | null;   // UUID de una cuenta efectivo o banco propia y no archivada
};
```

```json
{
  "nombre": "Tarjeta", "tipo": "tarjeta_credito", "detalle": "Visa ·· 1234",
  "saldoInicial": "1284300", "cupo": "4000000",
  "tarjeta": { "diaCorte": 15, "diaPago": 30, "tasaMensual": 198, "cuotaManejo": "26990", "cuentaPagoId": "0f9c…" }
}
```

> **Cambio de SPEC 14:** una tarjeta sin `tarjeta` (o sin `diaCorte` o
> `diaPago`) responde `400 CONDICIONES_REQUERIDAS`. La tarjeta y sus
> condiciones se crean en una sola transacción.

**201** `CuentaDto` de la cuenta creada.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `NOMBRE_REQUERIDO` | `nombre` | Falta, o queda vacío tras recortar. |
| 400 | `NOMBRE_LARGO` | `nombre` | Más de 60 caracteres. |
| 409 | `NOMBRE_DUPLICADO` | `nombre` | Ya hay una cuenta **no archivada** con ese nombre, sin distinguir mayúsculas («nequi» = «Nequi»). |
| 400 | `TIPO_INVALIDO` | `tipo` | Falta, o no es uno de los tres tipos (`inversion` tampoco: nace en `POST /inversiones`). |
| 400 | `DETALLE_LARGO` | `detalle` | Más de 60 caracteres. |
| 400 | `MONTO_INVALIDO` | `saldoInicial` o `cupo` | No es un string de entero no negativo: `"12.5"`, `"-1"`, `"1.000"`, `5` (number), etc. |
| 400 | `CUPO_REQUERIDO` | `cupo` | Tarjeta sin cupo o con cupo `"0"`. |
| 400 | `CUPO_NO_PERMITIDO` | `cupo` | Cupo en efectivo o banco. |
| 400 | `CONDICIONES_REQUERIDAS` | `tarjeta` | Tarjeta sin `tarjeta`, o sin `diaCorte` o `diaPago`. |
| 400 | `CONDICIONES_NO_PERMITIDAS` | `tarjeta` | `tarjeta` en efectivo o banco. |
| 400 | `DIA_INVALIDO` | `tarjeta.diaCorte` o `tarjeta.diaPago` | No es un entero de 1 a 31. |
| 400 | `TASA_INVALIDA` | `tarjeta.tasaMensual` | No es un entero de 0 a 10000. |
| 400 | `MONTO_INVALIDO` | `tarjeta.cuotaManejo` | No es un string de entero no negativo. |
| 422 | `CUENTA_PAGO_INVALIDA` | `tarjeta.cuentaPagoId` | No es una cuenta efectivo o banco propia y no archivada. |
| 400 | `ENTRADA_INVALIDA` | — | El cuerpo no es un objeto JSON. |

**Para el formulario:** el usuario escribe con el formato colombiano
(`1.284.300`); el cliente quita los separadores y envía `"1284300"`. El campo
de cupo solo aparece si el tipo es tarjeta de crédito.

---

## `PATCH /cuentas/:id`

Edita una cuenta **no archivada**. Se envían solo los campos que cambian; al
menos uno.

```ts
type EdicionCuenta = {
  nombre?: string;          // mismas reglas que en el alta
  tipo?: TipoCuenta;        // solo dentro de la misma naturaleza: efectivo ↔ banco
  detalle?: string | null;  // null (o "") lo borra
  saldoInicial?: string;    // mismas reglas que en el alta
  cupo?: string;            // solo si la cuenta es tarjeta_credito; > 0
  tarjeta?: CondicionesTarjeta; // solo en tarjeta_credito; parcial; null en un opcional lo borra
};
```

**200** `CuentaDto` actualizada.

- `tarjeta` (SPEC 14) cambia solo los campos enviados. Una tarjeta sin
  condiciones (creada antes de SPEC 14) exige `diaCorte` y `diaPago` la
  primera vez (`CONDICIONES_REQUERIDAS`). Cada cambio de condición queda en el
  historial de la base (`tarjetas_cambios`, sin endpoint de lectura).
- Si la cuenta de pago se archiva o se elimina, la tarjeta queda sin cuenta de
  pago (`cuentaPago: null`), con su fila en el historial.

- Cambiar `saldoInicial` cambia `saldo` y queda registrado en el historial de la
  base (valor anterior, nuevo y fecha). Hoy no hay endpoint para leer ese
  historial.
- Una tarjeta no puede quedar sin cupo, y efectivo/banco no pueden pasar a
  tarjeta. En la interfaz conviene ofrecer como opciones de tipo solo las de la
  misma naturaleza.
- En una inversión (SPEC 10), `saldoInicial` es el efectivo inicial en su
  moneda. Bajarlo hasta dejar el efectivo negativo algún día responde
  `EFECTIVO_INSUFICIENTE`. El tipo no cambia y no lleva cupo.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `SIN_CAMBIOS` | — | Cuerpo vacío `{}`. |
| 422 | `CAMBIO_DE_NATURALEZA` | `tipo` | Activo → pasivo o al revés (banco → tarjeta, tarjeta → efectivo…). |
| 422 | `TIPO_DE_INVERSION_FIJO` | `tipo` | Cambiar el tipo de una inversión. |
| 422 | `EFECTIVO_INSUFICIENTE` | — | El nuevo saldo inicial de una inversión deja su efectivo negativo algún día. |
| 400 | `CUPO_NO_PERMITIDO` | `cupo` | `cupo` en una cuenta que no es tarjeta. |
| 400 | `CUPO_REQUERIDO` | `cupo` | `cupo: "0"` en una tarjeta. |
| 409 | `CUENTA_ARCHIVADA` | — | La cuenta está archivada: hay que restaurarla primero. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe o es de otro usuario. |
| 400 / 409 | Los de validación del alta | | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `NOMBRE_DUPLICADO`, `TIPO_INVALIDO`, `DETALLE_LARGO`, `MONTO_INVALIDO`, `ENTRADA_INVALIDA`. |
| 400 / 422 | Los de las condiciones | `tarjeta…` | `CONDICIONES_NO_PERMITIDAS` (no es tarjeta), `CONDICIONES_REQUERIDAS`, `DIA_INVALIDO`, `TASA_INVALIDA`, `CUENTA_PAGO_INVALIDA`. |

---

## `DELETE /cuentas/:id`

Borra la cuenta definitivamente, archivada o no, junto con su historial de
cambios. **La confirmación la pide el cliente** antes de llamar.

**204** sin cuerpo.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `CUENTA_NO_ENCONTRADA` | No existe o es de otro usuario. |
| 409 | `CUENTA_CON_MOVIMIENTOS` | La cuenta tiene movimientos: no se borra, se archiva (con saldo cero). |
| 409 | `CUENTA_CON_RECURRENTES` | Alguna plantilla recurrente usa la cuenta: hay que cambiarla o eliminarla primero (ver [`recurrentes.md`](recurrentes.md)). |
| 409 | `CUENTA_CON_METAS` | La cuenta tiene metas de ahorro (también archivadas): hay que eliminarlas primero; con metas sin archivar, archivarlas o eliminarlas (ver [`metas.md`](metas.md)). |

Si era la cuenta predeterminada del perfil, el perfil queda sin elegida.

Archivar una cuenta **no** pausa las plantillas recurrentes que la usan: siguen
generando ocurrencias y confirmarlas responde `409 CUENTA_ARCHIVADA` (ver
[`recurrentes.md`](recurrentes.md)).

---

## `PUT /cuentas/orden`

Guarda el orden de **un grupo**. `ids` debe traer **todas** las cuentas no
archivadas de ese grupo (las de `GET /cuentas`, sin préstamos), cada una una
sola vez, en el orden nuevo. Es atómico:
si falla, el orden anterior queda intacto.

```json
{ "naturaleza": "activo", "ids": ["0f9c6c1e-…", "a41e…", "c3d2…"] }
```

**204** sin cuerpo. El siguiente `GET /cuentas` devuelve ese orden.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 422 | `ORDEN_INVALIDO` | `ids` | Falta una cuenta del grupo, hay un id repetido, un id es del otro grupo, de una archivada, de un préstamo o de otro usuario. |
| 400 | `ENTRADA_INVALIDA` | `naturaleza` o `ids.N` | `naturaleza` no es `activo`/`pasivo`, o un id no es UUID. |

**Para el modo «Ordenar»:** mover una cuenta solo dentro de su grupo. Al
terminar, enviar el grupo completo (y otra petición para el otro grupo si
también cambió). Si llega `ORDEN_INVALIDO`, la lista local está desactualizada:
recargar con `GET /cuentas`.

---

## `POST /cuentas/:id/archivar`

Archiva una cuenta con **saldo cero**. Sale de `GET /cuentas` (sin afectar
totales ni patrimonio) y aparece en `GET /cuentas/archivadas`. Su nombre queda
libre para una cuenta nueva.

Sin cuerpo. **200** `CuentaDto` con `archivadaEn`.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 409 | `CUENTA_CON_METAS` | La cuenta tiene metas de ahorro sin archivar: archívalas o elimínalas primero (ver [`metas.md`](metas.md)). |
| 409 | `SALDO_NO_CERO` | El saldo no es cero. En una inversión: tiene efectivo o posiciones abiertas. |
| 409 | `CUENTA_ARCHIVADA` | Ya estaba archivada. |
| 404 | `CUENTA_NO_ENCONTRADA` | No existe o es de otro usuario. |

---

## `POST /cuentas/:id/restaurar`

Restaura una cuenta archivada. Vuelve al **final** de su grupo.

Cuerpo opcional: `{ "nombre"?: string }`. Si viene, la cuenta se restaura con
ese nombre (mismas reglas que en el alta).

**200** `CuentaDto` con `archivadaEn: null`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 409 | `NOMBRE_DUPLICADO` | `nombre` | Mientras estaba archivada se creó otra cuenta con el mismo nombre. |
| 409 | `CUENTA_NO_ARCHIVADA` | — | No estaba archivada. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe o es de otro usuario. |
| 400 | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO` | `nombre` | `nombre` enviado pero inválido. |

**Flujo sugerido:** restaurar sin cuerpo; si llega `NOMBRE_DUPLICADO`, pedir
un nombre nuevo al usuario y reintentar con `{ "nombre": "Nequi vieja" }`.

---

## Detalle de cuenta (SPEC 14)

Solo **efectivo** y **banco**. Otro tipo responde `422 TIPO_NO_ADMITIDO`.

- **Conciliación por cuenta:** cada movimiento tiene un estado por lado. Conciliar
  en Efectivo una transferencia desde Bancolombia no la concilia en Bancolombia.
- Conciliar y desconciliar quedan en el historial de la base (RN-13).
- Editar el **monto, la fecha o el tipo** de un movimiento
  (`PUT /movimientos/:id`) lo devuelve a pendiente en sus dos lados; cambiar
  **una cuenta**, solo en ese lado. Editar la nota o la descripción no lo toca.
- Una cuenta **archivada** se lee (cuenta e historial), pero no se concilia ni se
  ajusta: `409 CUENTA_ARCHIVADA`.

### `GET /cuentas/:id/historial`

| Consulta | |
|---|---|
| `desde` | `"YYYY-MM-DD"`, inclusive. Sin él: hoy − 30 días. |
| `hasta` | `"YYYY-MM-DD"`, inclusive. Sin él: **sin tope** (entran los movimientos futuros). |

Atajos del cliente: «Últimos 30 días» sin `desde` ni `hasta`; mes actual con
`desde` el día 1 y sin `hasta`; mes anterior con los dos; rango libre con los dos.

```ts
type FilaHistorialDto = {
  movimientoId: string;
  tipo: "gasto" | "ingreso" | "transferencia" | "ajuste";
  fecha: string;                  // "YYYY-MM-DD"
  descripcion: string | null;
  efecto: string;                 // con signo: + entra a la cuenta, − sale
  saldo: string;                  // saldo corrido tras la fila
  conciliado: boolean;            // en ESTA cuenta
  categoria: Ref | null;          // en un ajuste, «Ajuste»
  partes: { categoria: Ref; monto: string }[];
  contraparte: (Ref & { sentido: "desde" | "hacia" }) | null; // solo transferencias: la otra cuenta
};

type HistorialDto = {
  fechaHoy: string;
  desde: string;
  hasta: string | null;
  saldo: string;                  // actual, con futuros (= CuentaDto.saldo)
  saldoHoy: string;               // sin futuros: el «Saldo en TINO» del panel de ajuste
  conciliacion: {
    saldo: string | null;         // saldo tras el último movimiento conciliado con todo lo anterior conciliado
    al: string | null;            // fecha de ese movimiento
    pendientes: number;           // movimientos de la cuenta, de cualquier fecha, pendientes en ella
  };
  entradas: string;               // Σ de lo que entró en el rango
  salidas: string;                // Σ de lo que salió en el rango, POSITIVO; el «−» lo pone el cliente
  saldoInicioRango: string;       // saldo antes de `desde` («Saldo al 12 oct»)
  filas: FilaHistorialDto[];      // las del rango, la más reciente primero
};
```

- Orden cronológico de los movimientos: fecha, luego registro.
- Sin conciliados al principio: `conciliacion.saldo` y `al` en `null` («—»).
- Rango sin movimientos: `filas: []` con `saldoInicioRango`.
- La suma de la selección (barra «N seleccionados · suma») la calcula el
  cliente con los `efecto` de las filas.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `FECHA_INVALIDA` | `desde` o `hasta` | No es `YYYY-MM-DD` válida. |
| 400 | `RANGO_INVALIDO` | `hasta` | `hasta` anterior a `desde`. |
| 422 | `TIPO_NO_ADMITIDO` | — | La cuenta no es efectivo ni banco. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe, es de otro usuario o es un préstamo. |

### `PUT /cuentas/:id/conciliacion`

Concilia o desconcilia, **en esta cuenta**, uno o varios movimientos.

```json
{ "movimientoIds": ["3c2a…", "8f0e…"], "conciliado": true }
```

- `movimientoIds`: de 1 a 500 UUID sin repetir.
- Los que ya estaban en ese estado no cambian ni dejan historial: repetir la
  petición es inofensivo.
- Todo o nada: si un id no toca la cuenta, no cambia ninguno.

**204** sin cuerpo. El cliente recarga el historial.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Lista vacía, más de 500, ids repetidos o mal formados, `conciliado` no booleano. |
| 404 | `MOVIMIENTO_NO_ENCONTRADO` | Algún id no es un movimiento del usuario que toque la cuenta. |
| 409 | `CUENTA_ARCHIVADA` | La cuenta está archivada. |
| 422 | `TIPO_NO_ADMITIDO` | La cuenta no es efectivo ni banco. |
| 404 | `CUENTA_NO_ENCONTRADA` | No existe, es de otro usuario o es un préstamo. |

### `POST /cuentas/:id/ajustes`

Ajuste de saldo (RN-14): el usuario escribe lo que contó y la API registra la
diferencia contra el **saldo a hoy** (`saldoHoy`, sin futuros) como un
movimiento de tipo `ajuste`, con fecha hoy, descripción `Ajuste de saldo` y
la categoría reservada «Ajuste». Nace conciliado.

```json
{ "saldoReal": "41500", "conciliarHastaHoy": true }
```

- `saldoReal`: entero ≥ 0 en pesos.
- `conciliarHastaHoy` (por defecto `true`): concilia también todos los
  movimientos de la cuenta con fecha hasta hoy.
- Si el saldo sube, el ajuste trae `cuentaDestino`; si baja, `cuentaOrigen`.
- Un ajuste **no cuenta como ingreso ni gasto** en el resumen (RN-14). Se edita
  y elimina en [`movimientos.md`](movimientos.md), sin cambiar de tipo.

**201** `MovimientoDto` del ajuste (ver [`movimientos.md`](movimientos.md)).

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `MONTO_INVALIDO` | `saldoReal` | No es un string de entero no negativo. |
| 422 | `SIN_DIFERENCIA` | `saldoReal` | Es igual al saldo a hoy. |
| 409 | `CUENTA_ARCHIVADA` | — | La cuenta está archivada. |
| 422 | `TIPO_NO_ADMITIDO` | — | La cuenta no es efectivo ni banco. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe, es de otro usuario o es un préstamo. |

---

## Tarjeta de crédito con ciclo (SPEC 14)

Las condiciones vienen en `CuentaDto.tarjeta`; el ciclo se calcula en cada
lectura (RN-01).

- **Corte:** el día de corte de cada mes; en un mes más corto, su último día
  (corte 31 → 28 feb). El ciclo en curso va del día siguiente al corte anterior
  hasta el próximo corte, **inclusive**: un consumo del día del corte entra en
  ese ciclo.
- **Pago límite:** el día de pago posterior al corte, ese mes o el siguiente
  (corte 25, pago 10 → día 10 del mes siguiente).
- **Abonos:** lo que entra a la tarjeta (pagos, devoluciones).
- **Cargos del banco:** gastos con categoría «Intereses» o «Cuota de manejo».
  Son gastos (RN-09) y cuentan en el resumen; solo se agrupan aparte. Un gasto
  dividido no es cargo.
- **Consumos:** las demás salidas, incluidos los avances (transferencias que
  salen de la tarjeta).

### `GET /cuentas/:id/ciclo`

| Consulta | |
|---|---|
| `compra` | Opcional. Entero > 0 en pesos: simula «¿Puedo comprar esto?». |

```ts
type FilaCicloDto = {
  movimientoId: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  fecha: string;
  descripcion: string | null;
  monto: string;
  categoria: Ref | null;
  partes: { categoria: Ref; monto: string }[];
  contraparte: Ref | null;        // la otra cuenta de una transferencia
};

type CicloDto = {
  fechaHoy: string;
  ciclo: {
    inicio: string;               // día siguiente al corte anterior
    corte: string;                // próximo corte (≥ hoy)
    pagoLimite: string;           // pago límite de ese corte
    diasHastaCorte: number;
    diasHastaPago: number;
    corteAnterior: { fecha: string; saldo: string }; // deuda al corte anterior
    abonos: FilaCicloDto[];
    saldoAnteriorPendiente: string; // corteAnterior.saldo − abonos; negativo si se pagó de más
    pagoSugerido: string;         // max(0, saldoAnteriorPendiente): monto de «Registrar pago»
    consumos: FilaCicloDto[];     // orden cronológico
    totalConsumos: string;
    cargos: (FilaCicloDto & { clase: "intereses" | "cuota_manejo" })[];
    totalCargos: string;
    deudaAlCorte: string;         // saldoAnteriorPendiente + totalConsumos + totalCargos
  } | null;                       // null: tarjeta sin condiciones
  compra: {
    monto: string;
    cabe: boolean;                // monto ≤ disponible
    disponibleTras: string | null;  // si cabe
    porcentajeTras: number | null;  // si cabe: uso tras la compra, truncado, acotado a 100
    falta: string | null;           // si no cabe
  } | null;                       // solo con ?compra=
};
```

- La compra entra al `ciclo.corte` y se paga hasta `ciclo.pagoLimite`.
- «Registrar pago» abre la captura de una transferencia desde
  `tarjeta.cuentaPago` hacia la tarjeta por `pagoSugerido` y se registra con
  `POST /movimientos` (RN-07: un pago es transferencia, nunca gasto).
- «Cargo fijo» y «Sobre N» los arma el cliente con `clase` y
  `saldoAnteriorPendiente`. La E.A. viene en `tarjeta.tasaEfectivaAnual`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `MONTO_INVALIDO` | `compra` | No es un entero mayor que 0. |
| 422 | `TIPO_NO_ADMITIDO` | — | La cuenta no es tarjeta. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe, es de otro usuario o es un préstamo. |

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `NOMBRE_REQUERIDO` | 400 | `nombre` | Escribe un nombre. |
| `NOMBRE_LARGO` | 400 | `nombre` | El nombre admite hasta 60 caracteres. |
| `NOMBRE_DUPLICADO` | 409 | `nombre` | Ya tienes una cuenta con ese nombre. |
| `TIPO_INVALIDO` | 400 | `tipo` | Elige efectivo, banco o tarjeta de crédito. |
| `DETALLE_LARGO` | 400 | `detalle` | El detalle admite hasta 60 caracteres. |
| `MONTO_INVALIDO` | 400 | `saldoInicial` o `cupo` | Escribe un valor en pesos, sin decimales. |
| `CUPO_REQUERIDO` | 400 | `cupo` | La tarjeta necesita un cupo mayor que cero. |
| `CUPO_NO_PERMITIDO` | 400 | `cupo` | Solo las tarjetas tienen cupo. |
| `SIN_CAMBIOS` | 400 | — | No hay nada que actualizar. |
| `CAMBIO_DE_NATURALEZA` | 422 | `tipo` | Una cuenta no puede pasar de activo a pasivo ni al revés. |
| `ORDEN_INVALIDO` | 422 | `ids` | El orden debe incluir cada cuenta del grupo una sola vez. |
| `CUENTA_NO_ENCONTRADA` | 404 | — | La cuenta no existe. |
| `CUENTA_ARCHIVADA` | 409 | — | La cuenta está archivada. Restáurala para modificarla. |
| `CUENTA_NO_ARCHIVADA` | 409 | — | La cuenta no está archivada. |
| `SALDO_NO_CERO` | 409 | — | Solo puedes archivar una cuenta con saldo cero. |
| `CUENTA_CON_MOVIMIENTOS` | 409 | — | La cuenta tiene movimientos. Archívala en lugar de eliminarla. |
| `CUENTA_CON_RECURRENTES` | 409 | — | La cuenta tiene recurrentes. Cámbialos o elimínalos primero. |
| `CUENTA_CON_METAS` | 409 | — | La cuenta tiene metas: archívalas o elimínalas primero. |
| `TIPO_DE_INVERSION_FIJO` | 422 | `tipo` | Una cuenta de inversión no cambia de tipo. |
| `EFECTIVO_INSUFICIENTE` | 422 | — | No hay efectivo suficiente en la cuenta. Registra primero el fondeo. |
| `TIPO_NO_ADMITIDO` | 422 | — | Esta operación no está disponible para este tipo de cuenta. |
| `RANGO_INVALIDO` | 400 | `hasta` | La fecha final no puede ser anterior a la inicial. |
| `SIN_DIFERENCIA` | 422 | `saldoReal` | El saldo contado es igual al de TINO: no hay nada que ajustar. |
| `DIA_INVALIDO` | 400 | `tarjeta.diaCorte` o `tarjeta.diaPago` | Elige un día entre 1 y 31. |
| `TASA_INVALIDA` | 400 | `tarjeta.tasaMensual` | La tasa es un porcentaje entre 0 y 100, con hasta dos decimales. |
| `CUENTA_PAGO_INVALIDA` | 422 | `tarjeta.cuentaPagoId` | Elige una cuenta de efectivo o banco activa. |
| `CONDICIONES_REQUERIDAS` | 400 | `tarjeta` | La tarjeta necesita día de corte y día de pago. |
| `CONDICIONES_NO_PERMITIDAS` | 400 | `tarjeta` | Solo las tarjetas tienen condiciones. |

Más los comunes: `NO_AUTENTICADO`, `ENTRADA_INVALIDA`, `ERROR_INTERNO`. El
detalle también usa `FECHA_INVALIDA`, `MONTO_INVALIDO` y
`MOVIMIENTO_NO_ENCONTRADO`.

---

## Necesidades → contrato

Para la tabla de cobertura del spec de la web. Las `N-xx` son de
`specs/necesidades/cuentas.md`.

| N-xx | Dónde está |
|---|---|
| N-06, N-07 | `ListaCuentasDto.fechaSaldos` (zona del perfil). |
| N-09 | `activos` / `pasivos`; `CuentaDto.naturaleza`. |
| N-10, N-23 | `activos.total`, `pasivos.total`. |
| N-11, N-12, N-13 | `nombre`, `tipo` (decide el ícono), `detalle`. |
| N-14 | `saldo`. |
| N-15 | `naturaleza` + `saldo` positivo; el «−» y «deuda» los pone el cliente. |
| N-16, N-17, N-18 | `tarjeta.cupo`, `tarjeta.porcentajeUsado`, `tarjeta.disponible`. |
| N-24 | `patrimonioNeto`. |
| N-25, N-28 | Orden del arreglo `cuentas`; las nuevas y restauradas van al final. |
| N-26, N-27 | `PUT /cuentas/orden` (por grupo; `ORDEN_INVALIDO`). |
| N-29 | `CuentaDto.id`. |
| N-30 a N-37 | `POST /cuentas` y sus errores. |
| N-38, N-39 | `PATCH /cuentas/:id`; `CAMBIO_DE_NATURALEZA`. |
| N-40 | Registro automático en la base al cambiar `saldoInicial` (sin endpoint de lectura). |
| N-41 | `DELETE /cuentas/:id`; confirmación en el cliente. |
| N-42, N-43 | `POST /cuentas/:id/archivar`; `SALDO_NO_CERO`. |
| N-44, N-45 | `GET /cuentas` excluye archivadas; `GET /cuentas/archivadas`. |
| N-46 | `POST /cuentas/:id/restaurar` con `nombre?`; `NOMBRE_DUPLICADO`. |
| N-47, N-48 | Grupos con `cuentas: []` y `total: "0"`. |
| N-49, N-50 | Estados HTTP + `ErrorApi` (`codigo`, `mensaje`, `campo`). |
| N-51 | Montos como string entero en unidades menores. |
| N-52 | Cada usuario solo ve lo suyo; un id ajeno da `404`. |
| Fuera de alcance | N-01 a N-05, N-08, N-19 a N-22: la API aún no los ofrece. |

### Detalle de cuenta y tarjeta (SPEC 14)

Las `N-xx` son de `specs/necesidades/detalle-cuenta.md`.

| N-xx | Dónde está |
|---|---|
| N-01 | `CuentaDto.id` y `tipo`: efectivo/banco → historial; tarjeta → ciclo. |
| N-02, N-45 | `GET /cuentas/:id`: `nombre`, `tipo`, `detalle`, `naturaleza`. |
| N-03 | `HistorialDto.saldo`. |
| N-04, N-05, N-06, N-38 | `HistorialDto.conciliacion`. |
| N-07, N-08 | `entradas`, `salidas`. |
| N-09, N-10, N-11, N-39 | `?desde=&hasta=` y su eco; sin `hasta` entran los futuros. |
| N-12 a N-17 | `HistorialDto.filas`: `fecha`, `descripcion`, `categoria`, `partes`, `contraparte`, `efecto`, `saldo`. |
| N-18, N-19, N-22, N-24, N-40 | `FilaHistorialDto.conciliado`; `PUT /cuentas/:id/conciliacion`. |
| N-20, N-37 | `saldoInicioRango`; `filas: []`. |
| N-21, N-23 | Estado del cliente; suma de `efecto`. |
| N-25 a N-35 | `saldoHoy`; `POST /cuentas/:id/ajustes`; `SIN_DIFERENCIA`; `TIPO_NO_ADMITIDO`. |
| N-36, N-43 | `CUENTA_NO_ENCONTRADA`; archivada: lectura sí, escritura `CUENTA_ARCHIVADA`. |
| N-41, N-42 | Ver [`movimientos.md`](movimientos.md): desconciliar al editar y ajustes. |
| N-46 a N-49, N-66 | `TarjetaDto.cupo`, `disponible`, `porcentajeUsado`; `CuentaDto.saldo`. |
| N-50 a N-54 | `GET /cuentas/:id/ciclo?compra=`: `compra`. |
| N-55 a N-65, N-82 | `CicloDto.ciclo`. |
| N-67 a N-71, N-81 | `TarjetaDto`: `tasaMensual`, `tasaEfectivaAnual`, `cuotaManejo`, `diaCorte`, `diaPago`, `cuentaPago`. |
| N-72 | `pagoSugerido` + `cuentaPago` + `POST /movimientos`. |
| N-73 a N-76, N-83, N-84 | `tarjeta` en `POST`/`PATCH /cuentas` y sus errores; historial en la base. |
| N-77, N-78, N-80 | Reglas del ciclo (ver arriba). |
| N-79 | `TarjetaDto.diaCorte: null` y `CicloDto.ciclo: null`. |
| N-44 | Montos como string entero; formato en el cliente. |
