# Movimientos

> **Spec de origen:** SPEC 04 (confirmados de recurrentes: SPEC 07) · **Necesidades:** `specs/necesidades/captura-rapida.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Gastos, ingresos y transferencias: registrar, listar por mes, editar y
eliminar. Cada movimiento afecta el saldo de sus cuentas (`GET /cuentas` lo
refleja en la siguiente lectura). Toda edición y eliminación queda registrada
en la base (RN-13), sin endpoint de lectura por ahora.

**Hoy:** todo en COP (`moneda: "COP"`, `tasa: "1"`). **Todavía no:** USD y
TRM, persona asociada (préstamos), recurrentes ni ajustes de saldo.

---

## Resumen de endpoints

| Método y ruta | Cuerpo / consulta | Éxito |
|---|---|---|
| [`GET /movimientos`](#get-movimientos) | `?mes=YYYY-MM` (opcional) | `200 { mes, movimientos: MovimientoDto[] }` |
| [`POST /movimientos`](#post-movimientos) | `MovimientoCuerpo` | `201 MovimientoDto` |
| [`PUT /movimientos/:id`](#put-movimientosid) | `MovimientoCuerpo` con `fecha` | `200 MovimientoDto` |
| [`DELETE /movimientos/:id`](#delete-movimientosid) | — | `204` sin cuerpo |

`:id` es un UUID. Uno mal formado responde `400 ENTRADA_INVALIDA`; uno que no
existe o es de otro usuario, `404 MOVIMIENTO_NO_ENCONTRADO`.

---

## Tipos

```ts
type TipoMovimiento = "gasto" | "ingreso" | "transferencia";
type Ref = { id: string; nombre: string };

type MovimientoDto = {
  id: string;
  tipo: TipoMovimiento;
  monto: string;                // SIEMPRE positivo; el signo lo pone el cliente según tipo
  moneda: "COP";
  tasa: string;                 // decimal como texto; hoy "1"
  fecha: string;                // "YYYY-MM-DD", día contable del usuario
  descripcion: string | null;
  nota: string | null;
  cuentaOrigen: Ref | null;     // gasto y transferencia
  cuentaDestino: Ref | null;    // ingreso y transferencia
  categoria: Ref | null;        // null y partes vacío = «sin clasificar»
  partes: { categoria: Ref; monto: string }[]; // [] si no está dividido
  creadoEn: string;             // ISO 8601 UTC
  actualizadoEn: string;
};
```

### Forma por tipo

| `tipo` | `cuentaOrigen` | `cuentaDestino` | `categoria` / `partes` |
|---|---|---|---|
| `gasto` | obligatoria | no | opcional: una categoría de gasto, o partes |
| `ingreso` | no | obligatoria | opcional: una categoría de ingreso, o partes |
| `transferencia` | obligatoria | obligatoria, distinta | ninguna (RN-05) |

Pagar la tarjeta es una **transferencia** hacia la tarjeta (RN-07), no un gasto.

### Presentación en la lista

- **Importe:** gasto `−`, ingreso `+`, transferencia sin signo.
- **Categoría:** `categoria.nombre`; si `partes` no está vacío, el movimiento
  está dividido (mostrar las partes); si ambas faltan y no es transferencia,
  «sin clasificar»; en una transferencia, que es transferencia.
- **Cuenta:** `cuentaOrigen` o `cuentaDestino`; en una transferencia, «origen →
  destino». Los nombres vienen embebidos también si la cuenta fue archivada
  después.

---

## `GET /movimientos`

Movimientos de un mes, por `fecha` descendente y, a igual fecha, el último
registrado primero (el recién creado queda arriba). Sin paginación.

| Consulta | |
|---|---|
| `mes` | `"YYYY-MM"`. Opcional: sin él, el mes actual en la zona del usuario. |

**200**

```json
{
  "mes": "2026-11",
  "movimientos": [
    {
      "id": "3c2a…",
      "tipo": "gasto",
      "monto": "30000",
      "moneda": "COP",
      "tasa": "1",
      "fecha": "2026-11-19",
      "descripcion": "Almuerzo y mercado",
      "nota": null,
      "cuentaOrigen": { "id": "8f0e…", "nombre": "Nequi" },
      "cuentaDestino": null,
      "categoria": null,
      "partes": [
        { "categoria": { "id": "bb9f…", "nombre": "Comida" }, "monto": "20000" },
        { "categoria": { "id": "bb4e…", "nombre": "Mercado" }, "monto": "10000" }
      ],
      "creadoEn": "2026-11-19T17:02:11.104Z",
      "actualizadoEn": "2026-11-19T17:02:11.104Z"
    }
  ]
}
```

Un mes sin movimientos: `"movimientos": []`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `MES_INVALIDO` | `mes` | No es `YYYY-MM` o el mes no existe (`2026-13`). |

---

## `POST /movimientos`

```ts
type MovimientoCuerpo = {
  tipo: TipoMovimiento;
  monto: string;                // ^\d{1,19}$, > 0
  fecha?: string;               // "YYYY-MM-DD". POST: opcional (hoy en la zona del usuario). PUT: obligatoria
  descripcion?: string | null;  // ≤ 80; "" = sin descripción; se recortan espacios
  nota?: string | null;         // ≤ 500; "" = sin nota
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  categoriaId?: string | null;  // null o ausente = sin clasificar
  partes?: { categoriaId: string; monto: string }[] | null; // null, ausente o [] = sin dividir
};
```

```json
{ "tipo": "gasto", "monto": "15000", "descripcion": "Almuerzo", "cuentaOrigenId": "8f0e…", "categoriaId": "bb9f…" }
```

- Cualquier fecha vale, pasada o futura, y todas cuentan en el saldo.
- Una cadena vacía en un id de cuenta o categoría equivale a no informarlo.
- **División:** dos o más partes, cada una con una categoría distinta del tipo
  del movimiento y monto > 0, que sumen exactamente `monto`. Con partes no se
  envía `categoriaId`.

**201** `MovimientoDto` recién creado.

Errores (llega el primero):

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `TIPO_MOVIMIENTO_INVALIDO` | `tipo` | Falta o no es gasto, ingreso ni transferencia. |
| 400 | `MONTO_REQUERIDO` | `monto` o `partes.N.monto` | Falta o es `"0"`. |
| 400 | `MONTO_INVALIDO` | `monto` o `partes.N.monto` | No es un string de entero: `"1.5"`, `"-1"`, `1500` (number). |
| 400 | `FECHA_INVALIDA` | `fecha` | No es `YYYY-MM-DD` o no existe (`2026-02-30`). |
| 400 | `DESCRIPCION_LARGA` | `descripcion` | Más de 80 caracteres. |
| 400 | `NOTA_LARGA` | `nota` | Más de 500 caracteres. |
| 400 | `ORIGEN_REQUERIDO` | `cuentaOrigenId` | Gasto o transferencia sin cuenta de origen. |
| 400 | `DESTINO_REQUERIDO` | `cuentaDestinoId` | Ingreso o transferencia sin cuenta de destino. |
| 400 | `ORIGEN_NO_PERMITIDO` | `cuentaOrigenId` | Ingreso con cuenta de origen. |
| 400 | `DESTINO_NO_PERMITIDO` | `cuentaDestinoId` | Gasto con cuenta de destino. |
| 400 | `CUENTAS_IGUALES` | `cuentaDestinoId` | Transferencia con origen = destino. |
| 400 | `CATEGORIA_NO_PERMITIDA` | `categoriaId` | Transferencia con categoría. |
| 400 | `DIVISION_NO_PERMITIDA` | `partes` | Transferencia con partes. |
| 400 | `PARTES_CON_CATEGORIA` | `partes` | Partes y `categoriaId` a la vez. |
| 400 | `PARTES_INSUFICIENTES` | `partes` | Una sola parte. |
| 400 | `PARTES_REPETIDAS` | `partes` | Dos partes con la misma categoría. |
| 400 | `ENTRADA_INVALIDA` | el campo | Un id que no es UUID, `partes` que no es lista, cuerpo que no es objeto. |
| 422 | `PARTES_NO_SUMAN` | `partes` | Las partes no suman `monto`. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaId` o `partes` | No existe, es de otro usuario o es de otro tipo (categoría de ingreso en un gasto). |
| 422 | `CUENTA_INVALIDA` | `cuentaOrigenId` o `cuentaDestinoId` | No existe o es de otro usuario. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaOrigenId` o `cuentaDestinoId` | La cuenta está archivada. |

---

## `PUT /movimientos/:id`

Reemplazo **completo**: se envía el movimiento entero, como en el `POST`, con
`fecha` obligatoria. Puede cambiar el tipo; valen las reglas del tipo
resultante (pasar a transferencia exige destino y quita categoría y partes).

**200** `MovimientoDto` actualizado. Los saldos de las cuentas anteriores y
nuevas se ajustan solos.

Si el cuerpo es idéntico al estado actual, responde `200` y no registra cambio.

Errores: los del `POST`, más:

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 404 | `MOVIMIENTO_NO_ENCONTRADO` | — | No existe o es de otro usuario. |
| 409 | `CUENTA_ARCHIVADA` | — | Alguna cuenta **actual** del movimiento está archivada: no se modifica. |

---

## `DELETE /movimientos/:id`

Elimina el movimiento. El saldo vuelve a como estaba. **La confirmación la
pide el cliente.** «Deshacer» un registro recién hecho es esta misma llamada.

Si el movimiento nació al confirmar una ocurrencia recurrente
(`POST /recurrentes/:id/confirmar`), borrarlo devuelve esa ocurrencia a la
bandeja: vuelve a `vencida` o `por_confirmar` y deja de contar como pagada
(ver [`recurrentes.md`](recurrentes.md)). Es el «Deshacer» de una confirmación.
Editarlo (`PUT`) cambia el `ultimoConfirmado` de la plantilla y, si es
variable, su estimado.

**204** sin cuerpo.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `MOVIMIENTO_NO_ENCONTRADO` | No existe o es de otro usuario. |
| 409 | `CUENTA_ARCHIVADA` | Alguna cuenta del movimiento está archivada. |

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `TIPO_MOVIMIENTO_INVALIDO` | 400 | `tipo` | Elige gasto, ingreso o transferencia. |
| `MONTO_REQUERIDO` | 400 | `monto` o `partes.N.monto` | Escribe un monto mayor que cero. |
| `MONTO_INVALIDO` | 400 | `monto` o `partes.N.monto` | Escribe un valor en pesos, sin decimales. |
| `FECHA_INVALIDA` | 400 | `fecha` | Escribe una fecha válida. |
| `MES_INVALIDO` | 400 | `mes` | Escribe un mes válido (AAAA-MM). |
| `DESCRIPCION_LARGA` | 400 | `descripcion` | La descripción admite hasta 80 caracteres. |
| `NOTA_LARGA` | 400 | `nota` | La nota admite hasta 500 caracteres. |
| `ORIGEN_REQUERIDO` | 400 | `cuentaOrigenId` | Elige la cuenta de origen. |
| `DESTINO_REQUERIDO` | 400 | `cuentaDestinoId` | Elige la cuenta de destino. |
| `ORIGEN_NO_PERMITIDO` | 400 | `cuentaOrigenId` | Un ingreso no tiene cuenta de origen. |
| `DESTINO_NO_PERMITIDO` | 400 | `cuentaDestinoId` | Un gasto no tiene cuenta de destino. |
| `CUENTAS_IGUALES` | 400 | `cuentaDestinoId` | Origen y destino deben ser cuentas distintas. |
| `CATEGORIA_NO_PERMITIDA` | 400 | `categoriaId` | Una transferencia no lleva categoría. |
| `DIVISION_NO_PERMITIDA` | 400 | `partes` | Una transferencia no se divide. |
| `PARTES_CON_CATEGORIA` | 400 | `partes` | Usa una categoría o divide, no ambas. |
| `PARTES_INSUFICIENTES` | 400 | `partes` | Divide en al menos dos partes. |
| `PARTES_REPETIDAS` | 400 | `partes` | Cada parte debe tener una categoría distinta. |
| `PARTES_NO_SUMAN` | 422 | `partes` | Las partes deben sumar el monto total. |
| `CATEGORIA_INVALIDA` | 422 | `categoriaId` o `partes` | La categoría no existe o no corresponde al tipo. |
| `CUENTA_INVALIDA` | 422 | `cuentaOrigenId` o `cuentaDestinoId` | La cuenta no existe. |
| `CUENTA_ARCHIVADA` | 409 | según el caso | La cuenta está archivada. Restáurala para modificarla. |
| `MOVIMIENTO_NO_ENCONTRADO` | 404 | — | El movimiento no existe. |

Más los comunes: `NO_AUTENTICADO`, `ENTRADA_INVALIDA`, `ERROR_INTERNO`.

---

## Necesidades → contrato

Las `N-xx` son de `specs/necesidades/captura-rapida.md`.

| N-xx | Dónde está |
|---|---|
| N-04, N-05 | `GET /movimientos` sin `mes` (mes actual) o con `?mes=`; `MES_INVALIDO`. |
| N-06 | Orden de `movimientos`: `fecha` desc, `creadoEn` desc. |
| N-07, N-08 | `fecha`, `descripcion`. |
| N-09, N-12 | `categoria`, `partes`, `tipo`. |
| N-10 | `cuentaOrigen`, `cuentaDestino`. |
| N-11 | `tipo` + `monto` positivo; el signo lo pone el cliente. |
| N-13 | `movimientos: []`. |
| N-14, N-49 | Estados HTTP + `ErrorApi` con `campo`. |
| N-15 | `MovimientoDto.id`. |
| N-16, N-17 | `PUT /movimientos/:id` y sus errores. |
| N-18, N-46 | `DELETE /movimientos/:id`; confirmación y plazo de deshacer en el cliente. |
| N-19 | Historial en la base (`movimientos_cambios`), sin endpoint de lectura. |
| N-20, N-35 | `GET /cuentas` → `saldo` ya incluye los movimientos; la vista previa es del cliente. |
| N-21 | `tipo`; el defecto «gasto» lo pone el cliente. |
| N-22 | `MONTO_REQUERIDO`, `MONTO_INVALIDO`. |
| N-23 | `moneda`, `tasa`. |
| N-24, N-40 | `descripcion` y `nota` opcionales. |
| N-29, N-30, N-31 | `categoriaId` opcional; `CATEGORIA_INVALIDA`. |
| N-36, N-37, N-38 | `CUENTA_INVALIDA`, `CUENTA_ARCHIVADA`, `ORIGEN_REQUERIDO`, `DESTINO_REQUERIDO`, `CUENTAS_IGUALES`, `CATEGORIA_NO_PERMITIDA`. |
| N-39 | `fecha` opcional en `POST`, cualquier fecha; `FECHA_INVALIDA`. |
| N-41, N-42, N-43 | `partes` y sus errores; `DIVISION_NO_PERMITIDA`. |
| N-45 | `POST /movimientos` → `201 MovimientoDto`. |
| N-52, N-53 | Montos string entero; cada usuario solo ve lo suyo. |
| N-55 | `DELETE /cuentas/:id` → `CUENTA_CON_MOVIMIENTOS` (ver [`cuentas.md`](cuentas.md)). |
