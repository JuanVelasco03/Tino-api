# Recurrentes

> **Spec de origen:** SPEC 07 (`CUENTA_DE_PRESTAMO`: SPEC 08; `CUENTA_DE_INVERSION`: SPEC 10) · **Necesidades:** `specs/necesidades/recurrentes.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Plantillas de gastos, ingresos y transferencias que se repiten (arriendo,
servicios, salario, abonos). La API deriva sus **ocurrencias** desde el
calendario de cada plantilla: la bandeja por confirmar, el comprometido del mes
y los ingresos esperados. **Una ocurrencia no es un movimiento:** no toca
saldos hasta que el usuario la confirma (RN-10). Al confirmar nace un
movimiento normal, que sale en `/movimientos`, `/cuentas` y `/resumen`.

**Todo lo calcula la API** (estados, importes estimados, sumas). El cliente
muestra lo que llega y arma el texto relativo («mañana», «en 3 días») con
`fechaHoy`.

**Todavía no:** plantillas en USD, abonos a deudas con personas, avisos de
vencimiento, confirmar una ocurrencia programada (fuera de la ventana) o
cambiar su fecha al confirmar, dividir la categoría de una plantilla, consultar
el historial de cambios de una plantilla, comprometido de otro mes.

---

## Resumen de endpoints

| Método y ruta | Cuerpo | Éxito |
|---|---|---|
| [`GET /recurrentes`](#get-recurrentes) | — | `200 RecurrentesDto` |
| [`POST /recurrentes`](#post-recurrentes) | `RecurrenteCuerpo` | `201 RecurrenteDto` |
| [`PUT /recurrentes/:id`](#put-recurrentesid) | `RecurrenteCuerpo` | `200 RecurrenteDto` |
| [`PATCH /recurrentes/:id`](#patch-recurrentesid) | `{ pausada: boolean }` | `200 RecurrenteDto` |
| [`DELETE /recurrentes/:id`](#delete-recurrentesid) | — | `204` sin cuerpo |
| [`POST /recurrentes/:id/confirmar`](#post-recurrentesidconfirmar) | `{ vencimiento, monto? }` | `201 MovimientoDto` |
| [`POST /recurrentes/:id/omitir`](#post-recurrentesidomitir) | `{ vencimiento }` | `204` sin cuerpo |
| [`DELETE /recurrentes/:id/omisiones/:vencimiento`](#delete-recurrentesidomisionesvencimiento) | — | `204` sin cuerpo |

Deshacer una confirmación es `DELETE /movimientos/:id` con el `id` del
`MovimientoDto` que devolvió `confirmar` (ver [`movimientos.md`](movimientos.md)).

---

## Conceptos

### Ocurrencia

Una ocurrencia es `recurrenteId` + `vencimiento` (`"YYYY-MM-DD"` en la zona del
usuario). No tiene id propio: las rutas de ocurrencia van bajo la plantilla y
la identifican por `vencimiento`.

### Calendario

| `periodicidad` | Vencimientos |
|---|---|
| `semanal` | `primerVencimiento` + 7 días, + 14, … |
| `quincenal` | El día 15 y el último día de cada mes, desde `primerVencimiento`. |
| `mensual`, `bimestral`, `trimestral`, `anual` | Cada 1, 2, 3 o 12 meses desde el mes de `primerVencimiento`. |

- En las de un mes o más, el día es el de `primerVencimiento`. Si el mes es más
  corto, cae el último día: ancla 31 → 28 de febrero → 31 de marzo.
- Con `ultimoDia: true`, cae siempre el último día del mes. Solo en
  periodicidades de un mes o más.

### Estados

| `estado` | Cuándo |
|---|---|
| `pagada` | Se confirmó: tiene un movimiento (`movimientoId`). |
| `omitida` | Se omitió. |
| `vencida` | Sin cerrar y con vencimiento anterior a hoy. |
| `por_confirmar` | Sin cerrar, vence entre hoy y hoy + `ventanaDias` (7). |
| `programada` | Sin cerrar, vence después de la ventana. |

Solo `vencida` y `por_confirmar` se confirman u omiten: son la **bandeja**.
Las vencidas se quedan en la bandeja hasta que el usuario las cierre, sin
importar el mes.

### Importe mostrado (`OcurrenciaDto.monto`)

- `pagada`: el monto actual de su movimiento.
- Plantilla fija: su `monto`.
- Plantilla variable: el monto del **último confirmado** (`ultimoConfirmado`)
  o, si no hay ninguno, el de la plantilla. Va con `estimado: true`.

Si se edita el movimiento confirmado, cambian `ultimoConfirmado` y el estimado.

### Pausa

- **Pausar** deja `pausadaDesde` = mañana. Lo que vence hasta hoy sigue en la
  bandeja. No hay ocurrencias desde `pausadaDesde`.
- **Reanudar** genera ocurrencias desde hoy. Los vencimientos del tiempo en
  pausa no vuelven, tampoco los vencidos que quedaban sin cerrar.
- Las ocurrencias ya cerradas (pagadas u omitidas) siempre se conservan.

---

## Tipos

```ts
type Ref = { id: string; nombre: string };
type EstadoOcurrencia = "pagada" | "omitida" | "vencida" | "por_confirmar" | "programada";
type Periodicidad = "semanal" | "quincenal" | "mensual" | "bimestral" | "trimestral" | "anual";

type OcurrenciaDto = {
  recurrenteId: string;
  vencimiento: string;          // "YYYY-MM-DD"
  estado: EstadoOcurrencia;
  monto: string;                // pagada: el del movimiento; si no, fijo o estimado
  estimado: boolean;            // variable y no pagada
  movimientoId: string | null;  // solo en pagada
};

type RecurrenteDto = {
  id: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  concepto: string;
  monto: string;                // el de la plantilla
  variable: boolean;
  periodicidad: Periodicidad;
  primerVencimiento: string;
  ultimoDia: boolean;
  cuentaOrigen: Ref | null;     // gasto y transferencia
  cuentaDestino: Ref | null;    // ingreso y transferencia
  categoria: Ref | null;        // null en transferencia o sin clasificar
  pausada: boolean;
  pausadaDesde: string | null;
  ultimoConfirmado: { monto: string; vencimiento: string } | null;
  ocurrenciasDelMes: OcurrenciaDto[];   // del mes actual, por vencimiento
  proximoVencimiento: string | null;    // primera sin cerrar desde hoy; null si no hay
  creadoEn: string;                     // ISO 8601 UTC
  actualizadoEn: string;
};

type GrupoDto = { monto: string; cantidad: number };

type RecurrentesDto = {
  fechaHoy: string;             // hoy en la zona del usuario
  mes: string;                  // "YYYY-MM", mes actual
  ventanaDias: number;          // 7
  bandeja: OcurrenciaDto[];     // vencida y por_confirmar
  comprometido: {
    total: string;
    pagado: GrupoDto;
    porConfirmar: GrupoDto;     // vencidas y por confirmar
    programado: GrupoDto;
  };
  ingresosEsperados: OcurrenciaDto[];
  recurrentes: RecurrenteDto[];
};

type RecurrenteCuerpo = {       // POST y PUT
  tipo: "gasto" | "ingreso" | "transferencia";
  concepto: string;             // 1 a 80 caracteres tras recortar espacios
  monto: string;                // ^\d{1,19}$, > 0
  variable: boolean;
  periodicidad: Periodicidad;
  primerVencimiento: string;    // "YYYY-MM-DD", no anterior a hoy
  ultimoDia?: boolean;          // default false
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  categoriaId?: string | null;
};
```

`MovimientoDto`: ver [`movimientos.md`](movimientos.md).

---

## `GET /recurrentes`

Toda la pantalla en una llamada. Solo lee.

**200** `RecurrentesDto`.

- `bandeja`: ocurrencias `vencida` y `por_confirmar` de todas las plantillas,
  por `vencimiento` ascendente y luego por concepto. `bandeja.length` es el
  contador. Vacía: «nada por confirmar».
- `bandeja` e `ingresosEsperados` traen solo `recurrenteId`. Concepto, cuentas,
  categoría, periodicidad y `ultimoConfirmado` se toman de `recurrentes`.
- `comprometido`: **salidas** (gastos y transferencias) con vencimiento en el
  mes actual. Lo pagado cuenta con el monto de su movimiento; lo pendiente y lo
  programado, con el fijo o el estimado. Las omitidas y los ingresos no cuentan.
  `total` = `pagado` + `porConfirmar` + `programado`. Una transferencia es
  salida comprometida, no gasto: el resumen del mes no cambia.
- `ingresosEsperados`: ocurrencias de ingreso del mes actual sin cerrar, una por
  línea, por vencimiento.
- `recurrentes`: primero las que tienen ocurrencias en el mes, por el
  vencimiento de la primera. Después las demás, por `proximoVencimiento` (las
  que no tienen, al final). Desempate por concepto.

```json
{
  "fechaHoy": "2026-11-11",
  "mes": "2026-11",
  "ventanaDias": 7,
  "bandeja": [
    { "recurrenteId": "7c1…", "vencimiento": "2026-11-12", "estado": "por_confirmar", "monto": "89900", "estimado": false, "movimientoId": null },
    { "recurrenteId": "a40…", "vencimiento": "2026-11-14", "estado": "por_confirmar", "monto": "31870", "estimado": true, "movimientoId": null }
  ],
  "comprometido": {
    "total": "1618170",
    "pagado": { "monto": "1396220", "cantidad": 5 },
    "porConfirmar": { "monto": "191150", "cantidad": 4 },
    "programado": { "monto": "30800", "cantidad": 2 }
  },
  "ingresosEsperados": [
    { "recurrenteId": "f02…", "vencimiento": "2026-11-30", "estado": "programada", "monto": "4200000", "estimado": false, "movimientoId": null }
  ],
  "recurrentes": [ /* RecurrenteDto[] */ ]
}
```

---

## `POST /recurrentes`

Crea una plantilla. Empieza activa y genera ocurrencias desde
`primerVencimiento`. No crea movimientos.

**201** `RecurrenteDto`.

Forma por tipo, igual que un movimiento:

| `tipo` | `cuentaOrigenId` | `cuentaDestinoId` | `categoriaId` |
|---|---|---|---|
| `gasto` | obligatoria | no | opcional, de gasto |
| `ingreso` | no | obligatoria | opcional, de ingreso |
| `transferencia` | obligatoria | obligatoria, distinta | no |

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `TIPO_MOVIMIENTO_INVALIDO` | `tipo` | Tipo fuera de la lista. |
| 400 | `CONCEPTO_REQUERIDO` | `concepto` | Falta o está vacío. |
| 400 | `CONCEPTO_LARGO` | `concepto` | Más de 80 caracteres. |
| 400 | `MONTO_REQUERIDO` | `monto` | Falta o es cero. |
| 400 | `MONTO_INVALIDO` | `monto` | No es un entero sin separadores. |
| 400 | `PERIODICIDAD_INVALIDA` | `periodicidad` | Fuera de la lista. |
| 400 | `FECHA_INVALIDA` | `primerVencimiento` | No es una fecha real. |
| 400 | `PRIMER_VENCIMIENTO_PASADO` | `primerVencimiento` | Anterior a hoy. |
| 400 | `ULTIMO_DIA_NO_PERMITIDO` | `ultimoDia` | `ultimoDia: true` con semanal o quincenal. |
| 400 | `ORIGEN_REQUERIDO`, `DESTINO_REQUERIDO`, `ORIGEN_NO_PERMITIDO`, `DESTINO_NO_PERMITIDO`, `CUENTAS_IGUALES` | la cuenta | Forma de cuentas por tipo. |
| 400 | `CATEGORIA_NO_PERMITIDA` | `categoriaId` | Transferencia con categoría. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaId` | No existe, es de otro usuario o de otro tipo. |
| 422 | `CUENTA_INVALIDA` | la cuenta | No existe o es de otro usuario. |
| 409 | `CUENTA_ARCHIVADA` | la cuenta | La cuenta está archivada. |
| 422 | `CUENTA_DE_PRESTAMO` | la cuenta | La cuenta es un préstamo: sus movimientos se registran desde Deudas ([`prestamos.md`](prestamos.md)). |
| 422 | `CUENTA_DE_INVERSION` | la cuenta | La cuenta es una inversión: no admite recurrentes ([`inversiones.md`](inversiones.md)). |

---

## `PUT /recurrentes/:id`

Reemplazo completo, mismo cuerpo y mismos errores que `POST`, más
`404 RECURRENTE_NO_ENCONTRADO`. No cambia la pausa.

**200** `RecurrenteDto`.

- Si cambia `periodicidad`, `primerVencimiento` o `ultimoDia`, el calendario se
  reinicia: `primerVencimiento` no puede ser anterior a hoy
  (`PRIMER_VENCIMIENTO_PASADO`) y las ocurrencias sin cerrar anteriores
  desaparecen. Las pagadas y omitidas se conservan.
- Si no cambian, el calendario no se toca: se admite un `primerVencimiento`
  pasado (el que ya tenía).
- Las ocurrencias sin cerrar reflejan siempre los valores actuales de la
  plantilla (monto, cuentas, concepto). Los movimientos ya confirmados no
  cambian.
- Cada cambio queda en el historial de la plantilla (RN-13). Un `PUT` idéntico
  no registra nada.

---

## `PATCH /recurrentes/:id`

Pausa (`{ "pausada": true }`) o reanuda (`{ "pausada": false }`). Ver
[Pausa](#pausa). Pedir el estado que ya tiene responde `200` sin cambios.

**200** `RecurrenteDto`.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | `pausada` falta o no es booleano. |
| 404 | `RECURRENTE_NO_ENCONTRADO` | No existe o es de otro usuario. |

---

## `DELETE /recurrentes/:id`

Borra la plantilla y sus cierres. **Los movimientos confirmados se quedan**
(en `/movimientos` y en los saldos). La confirmación la pide el cliente.

**204** sin cuerpo.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `RECURRENTE_NO_ENCONTRADO` | No existe o es de otro usuario. |

---

## `POST /recurrentes/:id/confirmar`

Confirma una ocurrencia de la bandeja. Crea un movimiento con `fecha` =
`vencimiento`, `descripcion` = concepto y las cuentas y la categoría de la
plantilla. Desde ese momento cuenta en el saldo, aunque la fecha sea futura.

```json
{ "vencimiento": "2026-11-14", "monto": "35120" }
```

- Sin `monto`, usa el importe mostrado. Con `monto` («Ajustar»), usa ese.

**201** `MovimientoDto`. Su `id` sirve para deshacer: `DELETE /movimientos/:id`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `FECHA_INVALIDA` | `vencimiento` | No es una fecha real. |
| 400 | `MONTO_REQUERIDO` | `monto` | `"0"`. |
| 400 | `MONTO_INVALIDO` | `monto` | No es un entero sin separadores. |
| 404 | `RECURRENTE_NO_ENCONTRADO` | — | No existe o es de otro usuario. |
| 422 | `OCURRENCIA_INVALIDA` | `vencimiento` | No es un vencimiento de la plantilla o está programado. |
| 409 | `OCURRENCIA_CERRADA` | `vencimiento` | Ya se confirmó u omitió. No se crea un segundo movimiento. |
| 409 | `CUENTA_ARCHIVADA` | la cuenta | Una cuenta de la plantilla se archivó. No se crea nada: editar la plantilla, omitir o pausar. |

---

## `POST /recurrentes/:id/omitir`

Cierra una ocurrencia de la bandeja sin movimiento: sale de la bandeja y del
comprometido. El mensaje («Omitido», con deshacer) es del cliente.

```json
{ "vencimiento": "2026-11-14" }
```

**204** sin cuerpo. Errores: los de `confirmar` salvo los de monto y cuenta.

---

## `DELETE /recurrentes/:id/omisiones/:vencimiento`

Deshace una omisión: la ocurrencia vuelve a su estado según la fecha.

**204** sin cuerpo.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `FECHA_INVALIDA` | `vencimiento` | No es una fecha real. |
| 404 | `RECURRENTE_NO_ENCONTRADO` | — | No existe o es de otro usuario. |
| 404 | `OMISION_NO_ENCONTRADA` | — | No hay una omisión en esa fecha. |

---

## Efectos en otros módulos

- `DELETE /movimientos/:id` de un movimiento confirmado devuelve la ocurrencia
  a la bandeja y queda en su historial de movimientos.
- `DELETE /cuentas/:id` de una cuenta que usa alguna plantilla responde
  `409 CUENTA_CON_RECURRENTES`.
- Archivar una cuenta no pausa sus plantillas. Confirmar responde
  `409 CUENTA_ARCHIVADA`.

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `RECURRENTE_NO_ENCONTRADO` | 404 | — | El recurrente no existe. |
| `CONCEPTO_REQUERIDO` | 400 | `concepto` | Escribe un concepto. |
| `CONCEPTO_LARGO` | 400 | `concepto` | El concepto admite hasta 80 caracteres. |
| `PERIODICIDAD_INVALIDA` | 400 | `periodicidad` | Elige una periodicidad válida. |
| `PRIMER_VENCIMIENTO_PASADO` | 400 | `primerVencimiento` | El primer vencimiento no puede ser anterior a hoy. |
| `ULTIMO_DIA_NO_PERMITIDO` | 400 | `ultimoDia` | "Último día" solo aplica a periodicidades de un mes o más. |
| `OCURRENCIA_INVALIDA` | 422 | `vencimiento` | Esa fecha no es un vencimiento por confirmar. |
| `OCURRENCIA_CERRADA` | 409 | `vencimiento` | Ese vencimiento ya se confirmó u omitió. |
| `OMISION_NO_ENCONTRADA` | 404 | — | No hay una omisión para ese vencimiento. |
| `CUENTA_CON_RECURRENTES` | 409 | — | La cuenta tiene recurrentes. Cámbialos o elimínalos primero. |

Reutilizados: `TIPO_MOVIMIENTO_INVALIDO`, `MONTO_REQUERIDO`, `MONTO_INVALIDO`,
`FECHA_INVALIDA`, `ORIGEN_REQUERIDO`, `DESTINO_REQUERIDO`,
`ORIGEN_NO_PERMITIDO`, `DESTINO_NO_PERMITIDO`, `CUENTAS_IGUALES`,
`CATEGORIA_NO_PERMITIDA`, `CATEGORIA_INVALIDA`, `CUENTA_INVALIDA`,
`CUENTA_ARCHIVADA` (ver [`movimientos.md`](movimientos.md) y
[`cuentas.md`](cuentas.md)), `CUENTA_DE_PRESTAMO` (ver
[`prestamos.md`](prestamos.md)) y `CUENTA_DE_INVERSION` (ver
[`inversiones.md`](inversiones.md)). Más los comunes: `NO_AUTENTICADO`,
`ENTRADA_INVALIDA`, `ERROR_INTERNO`.
