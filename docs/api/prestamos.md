# Deudas y préstamos

> **Spec de origen:** SPEC 08 (`CUENTA_DE_INVERSION`: SPEC 10) · **Necesidades:** `specs/necesidades/deudas.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Préstamos con personas en los dos sentidos: lo que **te deben**
(`prestamo_otorgado`) y lo que **debes** (`deuda_contraida`). Desembolsos,
abonos con capital e interés aparte, intereses causados, condonación,
consolidado y detalle con historial.

**Todo lo calcula la API**: capital pendiente, estado, intereses causados,
vencido, totales, orden y consolidado. El cliente muestra lo que llega y arma
los textos relativos («hace 27 días», «89 días») con `fechaHoy`.

**Todavía no:** préstamos en USD, persona en la captura rápida, préstamos como
líneas en la pantalla Cuentas, cambiar la tasa, eliminar un préstamo, condonar
una deuda contraída, abonos recurrentes, consultar el historial de cambios del
préstamo, interés compuesto u otras periodicidades de tasa.

---

## Resumen de endpoints

| Método y ruta | Cuerpo / consulta | Éxito |
|---|---|---|
| [`GET /prestamos`](#get-prestamos) | — | `200 PrestamosDto` |
| [`GET /prestamos/:id`](#get-prestamosid) | — | `200 PrestamoDetalleDto` |
| [`POST /prestamos`](#post-prestamos) | `PrestamoCuerpo` | `201 PrestamoDetalleDto` |
| [`POST /prestamos/:id/desembolsos`](#post-prestamosiddesembolsos) | `DesembolsoCuerpo` | `201 PrestamoDetalleDto` |
| [`PATCH /prestamos/:id`](#patch-prestamosid) | `PrestamoCambio` | `200 PrestamoDetalleDto` |
| [`GET /prestamos/:id/propuesta-abono`](#get-prestamosidpropuesta-abono) | `?fecha=YYYY-MM-DD&monto=` | `200 PropuestaAbonoDto` |
| [`POST /prestamos/:id/abonos`](#post-prestamosidabonos) | `AbonoCuerpo` | `201 PrestamoDetalleDto` |
| [`POST /prestamos/:id/condonaciones`](#post-prestamosidcondonaciones) | `CondonacionCuerpo` | `201 MovimientoDto` |

`:id` es el UUID del préstamo. Uno mal formado responde `400
ENTRADA_INVALIDA`; uno que no existe o es de otro usuario, `404
PRESTAMO_NO_ENCONTRADO`, en todas las rutas.

Corregir o deshacer un movimiento de préstamo (desembolso, abono, interés,
condonación) es `PUT`/`DELETE /movimientos/:id` con el id que trae el
historial (ver [`movimientos.md`](movimientos.md)).

---

## Conceptos

### Un préstamo es una cuenta

Cada préstamo es una cuenta de tipo `prestamo_otorgado` (activo) o
`deuda_contraida` (pasivo), con saldo inicial 0. Su **capital pendiente** es el
saldo de esa cuenta (RN-01): se recalcula en cada lectura. La **persona** es el
nombre del préstamo: único por usuario y sentido. «Mamá» puede tener un
otorgado y una contraída a la vez.

Los préstamos no salen como cuentas en `GET /cuentas` ni en `/cuentas/:id`,
pero su capital entra en el patrimonio (ver
[Efectos en otros módulos](#efectos-en-otros-módulos)).

### Movimientos de un préstamo

Todo es un movimiento normal, visible en `/movimientos`:

| Acción | Movimiento | Otorgado | Contraída |
|---|---|---|---|
| Desembolso | transferencia | cuenta propia → préstamo | préstamo → cuenta propia |
| Capital de un abono | transferencia | préstamo → cuenta propia | cuenta propia → préstamo |
| Interés | ingreso / gasto | ingreso en la cuenta propia | gasto desde la cuenta propia |
| Condonación | gasto | origen = préstamo | — |

Desembolso y capital no son ingreso ni gasto (RN-05, RN-08). El interés sí
(RN-09). La condonación es un gasto propio (RN-17).

Descripciones que fija la API: `Préstamo a <nombre>` / `Préstamo de
<nombre>`, `Abono de <nombre>` / `Abono a <nombre>`, `Intereses de <nombre>` /
`Intereses a <nombre>` y `Condonación a <nombre>`.

### Estado

| `estado` | Cuándo |
|---|---|
| `te_debe` | Otorgado con capital > 0. |
| `le_debes` | Contraída con capital > 0. |
| `saldado` | Capital 0. Abonar o condonar da `409 PRESTAMO_SALDADO`; un desembolso lo reabre. |

- `desde`: fecha del primer movimiento de capital después de la última vez que
  el capital quedó en 0. Tras reabrir, la del nuevo desembolso. `null` si está
  saldado.
- `cierre`: solo en `saldado`. Fecha del último movimiento de capital y su
  forma: `pago` (abono) o `condonacion`.
- `vencido`: `fechaAcordada` anterior a hoy y capital > 0.

### Tasa

`tasaMensual` es un porcentaje mensual sobre el saldo, como string decimal con
hasta dos decimales, entre `"0"` y `"100"`: `"1"`, `"1.5"`, `"0.25"`. `"0"` =
«Sin intereses». Queda fija desde el alta.

### Intereses causados

Interés simple, mes de 30 días, sobre los tramos de capital:

- Corren desde el último interés cobrado (o pagado). Sin ninguno, desde el
  primer desembolso.
- Por cada día: capital de ese día × tasa / 30. Se redondea al peso una sola
  vez, mitad hacia arriba.
- Un interés cobrado salda todo lo causado hasta su fecha, aunque su monto sea
  distinto del propuesto.
- Con capital 0 o tasa 0, son `"0"`. Saldar o condonar todo deja de causarlos
  sin registrar gasto.
- Una condonación parcial no los salda: siguen corriendo sobre el capital que
  queda.

Ejemplo: 600.000 prestados el 14 ago al 1 %; el 2 oct abona 100.000 de capital
y 12.000 de interés. Al 11 nov: 500.000 × 40 días × 1 % / 30 = **6.667**.

Los causados son informativos: no entran en el patrimonio.

---

## Tipos

```ts
type Ref = { id: string; nombre: string };
type TipoPrestamo = "prestamo_otorgado" | "deuda_contraida";
type EstadoPrestamo = "te_debe" | "le_debes" | "saldado";

type PrestamoResumenDto = {
  id: string;                     // id del préstamo (su cuenta)
  nombre: string;                 // la persona
  tipo: TipoPrestamo;
  estado: EstadoPrestamo;
  capitalPendiente: string;       // "0" si saldado; positivo también en le_debes
  desde: string | null;           // "YYYY-MM-DD"; null si saldado
  fechaAcordada: string | null;
  vencido: boolean;
  cierre: { fecha: string; forma: "pago" | "condonacion" } | null;
  interesesCausados: string;      // a hoy; "0" sin tasa o saldado
};

type PrestamosDto = {
  fechaHoy: string;
  teDeben: { total: string; personas: number; interesesCausados: string };
  debes: { total: string; personas: number; interesesCausados: string; conIntereses: boolean };
  posicionNeta: string;           // teDeben.total − debes.total; puede ser negativa
  prestamos: PrestamoResumenDto[];
};

type MovimientoPrestamoDto = {
  fecha: string;
  clase: "desembolso" | "abono" | "condonacion" | "interes";
  cuenta: Ref | null;             // la cuenta propia; null en condonación
  categoria: Ref | null;          // condonación: categoría del gasto
  capital: string;                // con signo: + desembolso, − abono y condonación; "0" en interes
  interes: string;                // "0" si no hay
  saldoCapital: string;           // capital tras la fila
  movimientoId: string | null;    // el de capital; null en clase interes
  movimientoInteresId: string | null;
};

type PrestamoDetalleDto = PrestamoResumenDto & {
  fechaHoy: string;
  tasaMensual: string;            // "0", "1", "1.5"
  totalPrestado: string;          // Σ desembolsos
  totalAbonado: string;           // abonos a capital + condonaciones
  totalCondonado: string;         // > 0 → rótulo «Abonos y condonación»
  interesesCobrados: string;      // pagados, en una contraída
  ultimoAbono: string | null;     // último abono o interés
  historial: MovimientoPrestamoDto[];
  creadoEn: string;               // ISO 8601
};
```

---

## `GET /prestamos`

Consolidado y lista de **todos** los préstamos, saldados incluidos. Sin
historiales: el detalle va en `GET /prestamos/:id`.

**200**

```json
{
  "fechaHoy": "2026-11-11",
  "teDeben": { "total": "500000", "personas": 1, "interesesCausados": "6667" },
  "debes": { "total": "500000", "personas": 1, "interesesCausados": "0", "conIntereses": false },
  "posicionNeta": "0",
  "prestamos": [
    {
      "id": "3b1d…",
      "nombre": "Camila Ortiz",
      "tipo": "prestamo_otorgado",
      "estado": "te_debe",
      "capitalPendiente": "500000",
      "desde": "2026-08-14",
      "fechaAcordada": "2026-10-15",
      "vencido": true,
      "cierre": null,
      "interesesCausados": "6667"
    },
    {
      "id": "9a7c…",
      "nombre": "Andrés Gil",
      "tipo": "prestamo_otorgado",
      "estado": "saldado",
      "capitalPendiente": "0",
      "desde": null,
      "fechaAcordada": null,
      "vencido": false,
      "cierre": { "fecha": "2026-09-20", "forma": "pago" },
      "interesesCausados": "0"
    }
  ]
}
```

- `personas`: préstamos no saldados del sentido.
- `debes.conIntereses`: alguna contraída no saldada tiene tasa > 0.
- **Orden:** grupos `te_debe`, `le_debes`, `saldado`. En los dos primeros, por
  capital desc y luego por nombre; los saldados, por fecha de cierre desc. El
  cliente agrupa por `estado` sin reordenar.
- Sin préstamos: totales `"0"`, `personas` 0, `posicionNeta` `"0"` y
  `prestamos: []`.
- Los nombres de la lista son las personas existentes: para sumar a alguien que
  ya tiene préstamo en ese sentido se usa `POST /prestamos/:id/desembolsos`.

Errores: solo los comunes.

---

## `GET /prestamos/:id`

**200** `PrestamoDetalleDto`.

```json
{
  "id": "3b1d…",
  "nombre": "Camila Ortiz",
  "tipo": "prestamo_otorgado",
  "estado": "te_debe",
  "capitalPendiente": "500000",
  "desde": "2026-08-14",
  "fechaAcordada": "2026-10-15",
  "vencido": true,
  "cierre": null,
  "interesesCausados": "6667",
  "fechaHoy": "2026-11-11",
  "tasaMensual": "1",
  "totalPrestado": "600000",
  "totalAbonado": "100000",
  "totalCondonado": "0",
  "interesesCobrados": "12000",
  "ultimoAbono": "2026-10-02",
  "historial": [
    {
      "fecha": "2026-08-14", "clase": "desembolso",
      "cuenta": { "id": "…", "nombre": "Nequi" }, "categoria": null,
      "capital": "600000", "interes": "0", "saldoCapital": "600000",
      "movimientoId": "…", "movimientoInteresId": null
    },
    {
      "fecha": "2026-10-02", "clase": "abono",
      "cuenta": { "id": "…", "nombre": "Nequi" }, "categoria": null,
      "capital": "-100000", "interes": "12000", "saldoCapital": "500000",
      "movimientoId": "…", "movimientoInteresId": "…"
    }
  ],
  "creadoEn": "2026-08-14T17:03:11.402Z"
}
```

- `historial`: una fila por movimiento de capital, por `fecha` y luego por
  registro. El interés de un abono va en la misma fila que su capital. Si el
  capital se borró (o el abono fue solo de interés), el interés sale como fila
  propia de `clase: "interes"`.
- «Ver movimientos» de un saldado usa `historial`: cada fila trae sus ids para
  abrir el movimiento.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 404 | `PRESTAMO_NO_ENCONTRADO` | No existe o es de otro usuario. |

---

## `POST /prestamos`

Préstamo nuevo con su primer desembolso, en una sola operación.

```ts
type PrestamoCuerpo = {
  tipo: TipoPrestamo;             // obligatorio
  nombre: string;                 // obligatorio; se recorta; 1–60 caracteres
  monto: string;                  // obligatorio; ^\d{1,19}$, > 0
  cuentaId: string;               // cuenta propia de donde sale (otorgado) o a donde llega (contraída)
  fecha?: string;                 // "YYYY-MM-DD"; por defecto hoy
  tasaMensual?: string;           // por defecto "0"
  fechaAcordada?: string | null;  // ≥ fecha; null o ausente = sin fecha
};
```

```json
{ "tipo": "prestamo_otorgado", "nombre": "Camila", "monto": "600000", "cuentaId": "…", "fecha": "2026-08-14", "tasaMensual": "1", "fechaAcordada": "2026-10-15" }
```

**201** `PrestamoDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `TIPO_INVALIDO` | `tipo` | Falta o no es uno de los dos tipos. |
| 400 | `NOMBRE_REQUERIDO` | `nombre` | Falta o queda vacío. |
| 400 | `NOMBRE_LARGO` | `nombre` | Más de 60 caracteres. |
| 400 | `MONTO_REQUERIDO` | `monto` | Falta o es `"0"`. |
| 400 | `MONTO_INVALIDO` | `monto` | No es un string de entero. |
| 400 | `FECHA_INVALIDA` | `fecha` o `fechaAcordada` | No es `YYYY-MM-DD` o no existe. |
| 400 | `TASA_INVALIDA` | `tasaMensual` | Fuera de 0–100 o con más de dos decimales (`"1.234"`). |
| 400 | `FECHA_ACORDADA_ANTERIOR` | `fechaAcordada` | Anterior a `fecha`. |
| 409 | `PRESTAMO_EXISTENTE` | `nombre` | Ya hay un préstamo con esa persona en ese sentido (sin distinguir mayúsculas). Usar `POST /prestamos/:id/desembolsos`. |
| 422 | `CUENTA_INVALIDA` | `cuentaId` | No existe, es de otro usuario o no es un UUID. |
| 422 | `CUENTA_DE_PRESTAMO` | `cuentaId` | La cuenta es otro préstamo. |
| 422 | `CUENTA_DE_INVERSION` | `cuentaId` | La cuenta es una inversión ([`inversiones.md`](inversiones.md)). |
| 409 | `CUENTA_ARCHIVADA` | `cuentaId` | La cuenta está archivada. No se crea nada. |

---

## `POST /prestamos/:id/desembolsos`

Suma al préstamo existente. Sobre uno saldado, lo **reabre**.

```ts
type DesembolsoCuerpo = { monto: string; cuentaId: string; fecha?: string }; // fecha: por defecto hoy
```

**201** `PrestamoDetalleDto`.

Errores: `MONTO_REQUERIDO`, `MONTO_INVALIDO`, `FECHA_INVALIDA`,
`CUENTA_INVALIDA`, `CUENTA_DE_PRESTAMO`, `CUENTA_DE_INVERSION`, `CUENTA_ARCHIVADA` (como en el alta) y
`404 PRESTAMO_NO_ENCONTRADO`.

---

## `PATCH /prestamos/:id`

Cambia el nombre o la fecha acordada. Cada cambio queda en el historial del
préstamo (RN-13).

```ts
type PrestamoCambio = {
  nombre?: string;                // como en el alta
  fechaAcordada?: string | null;  // null la quita; ausente no la toca
};
```

**200** `PrestamoDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `SIN_CAMBIOS` | — | Cuerpo sin campos. |
| 400 | `NOMBRE_REQUERIDO`, `NOMBRE_LARGO` | `nombre` | Como en el alta. |
| 409 | `PRESTAMO_EXISTENTE` | `nombre` | Otro préstamo del mismo sentido ya tiene ese nombre. |
| 400 | `FECHA_INVALIDA` | `fechaAcordada` | No es `YYYY-MM-DD` o no existe. |
| 404 | `PRESTAMO_NO_ENCONTRADO` | — | No existe o es de otro usuario. |

---

## `GET /prestamos/:id/propuesta-abono`

Reparte un monto entre intereses y capital para el formulario de abono:
primero los causados a la fecha, el resto a capital. El usuario puede ajustar
la propuesta antes de registrar.

| Consulta | |
|---|---|
| `fecha` | `"YYYY-MM-DD"`, obligatoria. |
| `monto` | Entero ≥ 0, obligatorio. |

```ts
type PropuestaAbonoDto = {
  fecha: string;
  monto: string;
  capital: string;            // monto − interes
  interes: string;            // min(monto, interesesCausados)
  interesesCausados: string;  // a la fecha
  capitalPendiente: string;
};
```

`GET /prestamos/:id/propuesta-abono?fecha=2026-09-03&monto=112000` → `interes`
`"4000"` y `capital` `"108000"` (600.000 × 20 días × 1 % / 30).

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `FECHA_INVALIDA` | `fecha` | Falta o no es válida. |
| 400 | `MONTO_REQUERIDO`, `MONTO_INVALIDO` | `monto` | Falta o no es entero. |
| 422 | `ABONO_EXCEDE_CAPITAL` | `capital` | El capital propuesto supera lo pendiente. |
| 404 | `PRESTAMO_NO_ENCONTRADO` | — | No existe o es de otro usuario. |

---

## `POST /prestamos/:id/abonos`

Registra un abono: el capital como transferencia y el interés como ingreso
(te deben) o gasto (debes), en una sola operación. Se valida contra el estado
actual del préstamo.

```ts
type AbonoCuerpo = {
  cuentaId: string;                    // cuenta propia
  fecha: string;                       // "YYYY-MM-DD"
  capital: string;                     // entero ≥ 0
  interes: string;                     // entero ≥ 0; capital + interes > 0
  categoriaInteresId?: string | null;  // ausente: «Intereses» del tipo; null: sin categoría
};
```

- Sin `categoriaInteresId`, el interés va a la categoría «Intereses» de ingreso
  (otorgado) o de gasto (contraída). Si el usuario ya no la tiene, va sin
  categoría.
- Con capital `"0"` es un abono solo de interés; con interés `"0"`, solo de
  capital.

**201** `PrestamoDetalleDto`.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 409 | `PRESTAMO_SALDADO` | — | El préstamo ya está saldado. |
| 400 | `ABONO_VACIO` | `capital` | Capital e interés en `"0"`. |
| 400 | `MONTO_INVALIDO` | `capital` o `interes` | Falta o no es un string de entero. |
| 400 | `FECHA_INVALIDA` | `fecha` | Falta o no es válida. |
| 400 | `FECHA_ANTERIOR_AL_PRESTAMO` | `fecha` | Anterior al primer desembolso. |
| 422 | `ABONO_EXCEDE_CAPITAL` | `capital` | El capital supera lo pendiente. |
| 422 | `CUENTA_INVALIDA` | `cuentaId` | No existe o es de otro usuario. |
| 422 | `CUENTA_DE_PRESTAMO` | `cuentaId` | La cuenta es un préstamo. |
| 422 | `CUENTA_DE_INVERSION` | `cuentaId` | La cuenta es una inversión. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaId` | La cuenta está archivada. No se crea nada. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaInteresId` | No existe, es de otro usuario o es de otro tipo. |
| 404 | `PRESTAMO_NO_ENCONTRADO` | — | No existe o es de otro usuario. |

---

## `POST /prestamos/:id/condonaciones`

Perdona una parte o todo lo que te deben. Registra un **gasto de hoy** con
origen el préstamo y la categoría elegida (RN-17). Solo en un otorgado.

```ts
type CondonacionCuerpo = {
  monto: string;        // > 0 y ≤ capitalPendiente; para condonar todo, capitalPendiente
  categoriaId: string;  // categoría de gasto del usuario
};
```

**201** `MovimientoDto` (ver [`movimientos.md`](movimientos.md)): el gasto
creado. Deshacer es `DELETE /movimientos/:id` con su `id`.

- La vista previa («Qué cambia») la arma el cliente con `patrimonioNeto` de
  `GET /cuentas` y el monto: el patrimonio baja en el monto condonado.
- Condonar todo deja el préstamo `saldado` con `cierre.forma: "condonacion"` y
  causados en `"0"`. No se registra gasto por los intereses.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 422 | `CONDONACION_NO_PERMITIDA` | — | Es una deuda contraída. |
| 409 | `PRESTAMO_SALDADO` | — | El préstamo ya está saldado. |
| 400 | `MONTO_REQUERIDO`, `MONTO_INVALIDO` | `monto` | Falta, es `"0"` o no es entero. |
| 422 | `CONDONACION_EXCEDE_CAPITAL` | `monto` | Supera lo pendiente. No se recorta. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaId` | No existe, no es UUID, es de otro usuario o no es de gasto. |
| 404 | `PRESTAMO_NO_ENCONTRADO` | — | No existe o es de otro usuario. |

---

## Efectos en otros módulos

- **`GET /cuentas`:** los préstamos no salen en `activos` ni en `pasivos`.
  Llega `prestamos: { teDeben, debes }` y `patrimonioNeto` los incluye. Ver
  [`cuentas.md`](cuentas.md).
- **`/cuentas/:id`:** el id de un préstamo es una cuenta inexistente (`404
  CUENTA_NO_ENCONTRADA`). Tampoco sirve como cuenta predeterminada de la
  captura.
- **`GET /resumen`:** el patrimonio y su serie incluyen los préstamos. El
  interés cuenta como ingreso o gasto y la condonación como gasto; desembolsos y
  abonos a capital no (RN-05). Ver [`resumen.md`](resumen.md).
- **`/movimientos`:** los movimientos de préstamo salen en la lista y se editan
  o borran ahí, sin cambiar de tipo ni de préstamo y sin dejar el capital
  negativo. `POST /movimientos` no acepta una cuenta de préstamo. Ver
  [`movimientos.md`](movimientos.md).
- **`/recurrentes`:** una plantilla no acepta una cuenta de préstamo. Ver
  [`recurrentes.md`](recurrentes.md).

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `PRESTAMO_NO_ENCONTRADO` | 404 | — | El préstamo no existe. |
| `PRESTAMO_EXISTENTE` | 409 | `nombre` | Ya tienes un préstamo con esa persona en ese sentido. Súmale un desembolso. |
| `TASA_INVALIDA` | 400 | `tasaMensual` | La tasa es un porcentaje entre 0 y 100, con hasta dos decimales. |
| `FECHA_ACORDADA_ANTERIOR` | 400 | `fechaAcordada` | La fecha acordada no puede ser anterior al préstamo. |
| `ABONO_VACIO` | 400 | `capital` | El abono tiene que ser mayor que cero. |
| `ABONO_EXCEDE_CAPITAL` | 422 | `capital` | El abono a capital supera lo pendiente. |
| `FECHA_ANTERIOR_AL_PRESTAMO` | 400 | `fecha` | La fecha no puede ser anterior al préstamo. |
| `PRESTAMO_SALDADO` | 409 | — | Este préstamo ya está saldado. |
| `CONDONACION_NO_PERMITIDA` | 422 | — | Solo se condona lo que te deben. |
| `CONDONACION_EXCEDE_CAPITAL` | 422 | `monto` | No puedes condonar más de lo pendiente. |
| `CUENTA_DE_PRESTAMO` | 422 | la cuenta | Esa cuenta es un préstamo. Regístralo desde Deudas. |
| `CUENTA_DE_INVERSION` | 422 | la cuenta | Esa cuenta es de inversión: solo admite transferencias y se maneja desde Inversiones. |
| `MOVIMIENTO_DE_PRESTAMO` | 422 | `tipo` | Este movimiento es de un préstamo: no cambia de tipo ni de préstamo. |
| `CAPITAL_NEGATIVO` | 422 | — | El cambio deja el préstamo con capital negativo. |

Se reutilizan `TIPO_INVALIDO`, `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`,
`MONTO_REQUERIDO`, `MONTO_INVALIDO`, `FECHA_INVALIDA`, `CUENTA_INVALIDA`,
`CUENTA_ARCHIVADA`, `CATEGORIA_INVALIDA`, `SIN_CAMBIOS` y `ENTRADA_INVALIDA`.
