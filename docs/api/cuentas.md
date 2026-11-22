# Cuentas

> **Spec de origen:** SPEC 03 (saldo con movimientos y `CUENTA_CON_MOVIMIENTOS`: SPEC 04; `CUENTA_CON_RECURRENTES`: SPEC 07; préstamos en el patrimonio: SPEC 08) · **Necesidades:** `specs/necesidades/cuentas.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Cuentas del usuario agrupadas en activos y pasivos, con saldos, totales y
patrimonio neto calculados por la API. Alta, edición, orden, archivo,
restauración y borrado.

**Hoy existen:** `efectivo`, `banco` y `tarjeta_credito` (sin ciclo), todas en
COP. **Todavía no:** USD y TRM, inversiones, préstamos como líneas de esta
pantalla ni ciclo de la tarjeta (corte, pago límite).

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
| [`POST /cuentas`](#post-cuentas) | `AltaCuenta` | `201 CuentaDto` |
| [`PATCH /cuentas/:id`](#patch-cuentasid) | `EdicionCuenta` | `200 CuentaDto` |
| [`DELETE /cuentas/:id`](#delete-cuentasid) | — | `204` sin cuerpo |
| [`PUT /cuentas/orden`](#put-cuentasorden) | `{ naturaleza, ids }` | `204` sin cuerpo |
| [`POST /cuentas/:id/archivar`](#post-cuentasidarchivar) | — | `200 CuentaDto` |
| [`POST /cuentas/:id/restaurar`](#post-cuentasidrestaurar) | `{ nombre? }` (opcional) | `200 CuentaDto` |

`:id` es un UUID. Uno mal formado responde `400 ENTRADA_INVALIDA`; uno que no
existe, es de otro usuario o es el de un préstamo, `404 CUENTA_NO_ENCONTRADA`.

---

## Tipos

```ts
type TipoCuenta = "efectivo" | "banco" | "tarjeta_credito";
type Naturaleza = "activo" | "pasivo"; // efectivo y banco → activo; tarjeta_credito → pasivo

type CuentaDto = {
  id: string;                 // UUID
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: Naturaleza;     // la calcula la API desde el tipo
  detalle: string | null;     // texto libre ≤ 60 (ej. "Ahorros ·· 4821")
  saldo: string;              // saldo actual; en un pasivo, la DEUDA vigente, positiva
  saldoInicial: string;       // en un pasivo, la deuda inicial
  tarjeta: {                  // solo en tarjeta_credito; null en las demás
    cupo: string;             // cupo total
    disponible: string;       // cupo − deuda; puede ser negativo si la deuda excede el cupo
    porcentajeUsado: number;  // entero 0–100, truncado (32,1 % → 32), acotado a 100
  } | null;
  archivadaEn: string | null; // ISO 8601; null = no archivada
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
};
```

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
        "naturaleza": "activo",
        "detalle": null,
        "saldo": "20321",
        "saldoInicial": "20321",
        "tarjeta": null,
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
        "naturaleza": "pasivo",
        "detalle": "Visa ·· 1234",
        "saldo": "1284300",
        "saldoInicial": "1284300",
        "tarjeta": { "cupo": "4000000", "disponible": "2715700", "porcentajeUsado": 32 },
        "archivadaEn": null
      }
    ]
  },
  "prestamos": { "teDeben": "0", "debes": "0" },
  "patrimonioNeto": "-1263979"
}
```

**Usuario sin cuentas:** también `200`, con los dos grupos vacíos:

```json
{
  "fechaSaldos": "2026-11-18",
  "activos": { "total": "0", "cuentas": [] },
  "pasivos": { "total": "0", "cuentas": [] },
  "prestamos": { "teDeben": "0", "debes": "0" },
  "patrimonioNeto": "0"
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

## `POST /cuentas`

Crea una cuenta. Queda al final de su grupo.

```ts
type AltaCuenta = {
  nombre: string;          // obligatorio; se recortan espacios; 1–60 caracteres
  tipo: TipoCuenta;        // obligatorio
  detalle?: string;        // opcional; ≤ 60; "" equivale a no enviarlo (queda null)
  saldoInicial: string;    // obligatorio; entero ≥ 0, ^\d{1,19}$. En la tarjeta, la deuda inicial
  cupo?: string;           // obligatorio y > 0 en tarjeta_credito; prohibido en las demás
};
```

```json
{ "nombre": "Tarjeta", "tipo": "tarjeta_credito", "detalle": "Visa ·· 1234", "saldoInicial": "1284300", "cupo": "4000000" }
```

**201** `CuentaDto` de la cuenta creada.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `NOMBRE_REQUERIDO` | `nombre` | Falta, o queda vacío tras recortar. |
| 400 | `NOMBRE_LARGO` | `nombre` | Más de 60 caracteres. |
| 409 | `NOMBRE_DUPLICADO` | `nombre` | Ya hay una cuenta **no archivada** con ese nombre, sin distinguir mayúsculas («nequi» = «Nequi»). |
| 400 | `TIPO_INVALIDO` | `tipo` | Falta, o no es uno de los tres tipos. |
| 400 | `DETALLE_LARGO` | `detalle` | Más de 60 caracteres. |
| 400 | `MONTO_INVALIDO` | `saldoInicial` o `cupo` | No es un string de entero no negativo: `"12.5"`, `"-1"`, `"1.000"`, `5` (number), etc. |
| 400 | `CUPO_REQUERIDO` | `cupo` | Tarjeta sin cupo o con cupo `"0"`. |
| 400 | `CUPO_NO_PERMITIDO` | `cupo` | Cupo en efectivo o banco. |
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
};
```

**200** `CuentaDto` actualizada.

- Cambiar `saldoInicial` cambia `saldo` y queda registrado en el historial de la
  base (valor anterior, nuevo y fecha). Hoy no hay endpoint para leer ese
  historial.
- Una tarjeta no puede quedar sin cupo, y efectivo/banco no pueden pasar a
  tarjeta. En la interfaz conviene ofrecer como opciones de tipo solo las de la
  misma naturaleza.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `SIN_CAMBIOS` | — | Cuerpo vacío `{}`. |
| 422 | `CAMBIO_DE_NATURALEZA` | `tipo` | Activo → pasivo o al revés (banco → tarjeta, tarjeta → efectivo…). |
| 400 | `CUPO_NO_PERMITIDO` | `cupo` | `cupo` en una cuenta que no es tarjeta. |
| 400 | `CUPO_REQUERIDO` | `cupo` | `cupo: "0"` en una tarjeta. |
| 409 | `CUENTA_ARCHIVADA` | — | La cuenta está archivada: hay que restaurarla primero. |
| 404 | `CUENTA_NO_ENCONTRADA` | — | No existe o es de otro usuario. |
| 400 / 409 | Los de validación del alta | | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `NOMBRE_DUPLICADO`, `TIPO_INVALIDO`, `DETALLE_LARGO`, `MONTO_INVALIDO`, `ENTRADA_INVALIDA`. |

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
| 409 | `SALDO_NO_CERO` | El saldo no es cero. |
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

Más los comunes: `NO_AUTENTICADO`, `ENTRADA_INVALIDA`, `ERROR_INTERNO`.

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
