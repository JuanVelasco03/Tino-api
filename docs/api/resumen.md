# Resumen del mes

> **Spec de origen:** SPEC 06 (préstamos en el patrimonio: SPEC 08) · **Necesidades:** `specs/necesidades/resumen.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Cifras de un mes comparadas con el anterior: ingresos, gastos, resultado y
gasto por categoría. También el patrimonio de hoy, su serie de 12 meses y el
puente del patrimonio del mes. **Todo lo calcula la API.** El cliente muestra
las cifras, las variaciones y los porcentajes tal como llegan, sin
recalcularlos.

**Todavía no:** USD y TRM, revaluación de inversiones, ajustes de saldo, otros
informes (series por categoría, rangos libres, exportar).

---

## Resumen de endpoints

| Método y ruta | Consulta | Éxito |
|---|---|---|
| [`GET /resumen`](#get-resumen) | `?mes=YYYY-MM` (opcional) | `200 ResumenDto` |

---

## Porcentajes en décimas (excepción)

**Excepción a la convención común** (porcentajes enteros de 0 a 100): en este
módulo, todo porcentaje es un **entero en décimas**.

- `274` = 27,4 %. `-1190` = −119,0 %. Para mostrar: `n / 10` con una cifra
  decimal y coma (`27,4 %`).
- Puede ser negativo (`variacionPorcentaje`) o pasar de `1000` (una cifra que
  más que se duplica).
- Redondeo half-up, la mitad lejos de cero, calculado sin coma flotante.
- `null` cuando no hay base: el total es cero (`porcentaje`) o el valor
  anterior es cero (`variacionPorcentaje`). El cliente muestra «—» o lo omite.
- Por el redondeo, los porcentajes de las categorías pueden no sumar `1000`.
  El total se rotula «100 %» sin sumar filas.

---

## Tipos

```ts
type Ref = { id: string; nombre: string };

type ComparacionDto = {
  actual: string;                    // monto del mes
  anterior: string;                  // monto del mes anterior
  variacion: string;                 // actual − anterior; puede ser negativo
  variacionPorcentaje: number | null; // décimas; null si anterior es "0"
};

type CategoriaResumenDto = {
  categoria: Ref;
  monto: string;                     // gasto del mes en la categoría
  anterior: string;                  // gasto del mes anterior
  variacion: string;                 // monto − anterior
  porcentaje: number | null;         // décimas de gastos.actual; null si gastos.actual es "0"
};

type ResumenDto = {
  mes: string;                       // "YYYY-MM"
  mesAnterior: string;               // "YYYY-MM"
  desde: string;                     // primer día del mes, "YYYY-MM-DD"
  hasta: string;                     // último día del mes
  fechaHoy: string;                  // hoy en la zona del usuario
  inicio: string | null;             // día de creación de la cuenta más antigua; null sin cuentas
  tieneMovimientos: boolean;         // false → estado de día uno (todo el historial, no solo el mes)
  cuentasActivas: number;            // no archivadas, sin préstamos
  cantidadMovimientos: number;       // del mes, de cualquier tipo (= GET /movimientos?mes=)
  ingresos: ComparacionDto;
  gastos: ComparacionDto;
  resultado: ComparacionDto;         // ingresos − gastos
  categorias: CategoriaResumenDto[];
  sinCategoria: {
    monto: string;
    anterior: string;
    variacion: string;
    porcentaje: number | null;       // décimas de gastos.actual
    cantidad: number;                // gastos sin clasificar del mes
  };
  patrimonio: {
    hoy: string;                     // activos − pasivos a hoy; puede ser negativo
    serie: { fecha: string; patrimonio: string }[]; // ascendente; último = hoy; 1 a 12 puntos ([] sin cuentas)
    variacionSerie: string;          // último − primero; "0" con menos de dos puntos
  };
  cambioDelMes: {
    fechaAnterior: string;           // último día de M−1
    fechaCierre: string;             // último día de M
    patrimonioAnterior: string;
    resultado: string;               // = resultado.actual
    otrosCambios: string;            // cierre − anterior − resultado
    patrimonioCierre: string;
  };
};
```

---

## `GET /resumen`

| Consulta | |
|---|---|
| `mes` | `"YYYY-MM"`. Opcional: sin él, el mes actual en la zona del usuario. |

**200**

```json
{
  "mes": "2026-11",
  "mesAnterior": "2026-10",
  "desde": "2026-11-01",
  "hasta": "2026-11-30",
  "fechaHoy": "2026-11-21",
  "inicio": "2026-10-01",
  "tieneMovimientos": true,
  "cuentasActivas": 2,
  "cantidadMovimientos": 3,
  "ingresos": { "actual": "0", "anterior": "2000000", "variacion": "-2000000", "variacionPorcentaje": -1000 },
  "gastos": { "actual": "300000", "anterior": "420000", "variacion": "-120000", "variacionPorcentaje": -286 },
  "resultado": { "actual": "-300000", "anterior": "1580000", "variacion": "-1880000", "variacionPorcentaje": -1190 },
  "categorias": [
    { "categoria": { "id": "bb9f…", "nombre": "Comida" }, "monto": "260000", "anterior": "300000", "variacion": "-40000", "porcentaje": 867 },
    { "categoria": { "id": "bb4e…", "nombre": "Mercado" }, "monto": "30000", "anterior": "0", "variacion": "30000", "porcentaje": 100 },
    { "categoria": { "id": "bb2c…", "nombre": "Transporte" }, "monto": "0", "anterior": "20000", "variacion": "-20000", "porcentaje": 0 }
  ],
  "sinCategoria": { "monto": "10000", "anterior": "100000", "variacion": "-90000", "porcentaje": 33, "cantidad": 1 },
  "patrimonio": {
    "hoy": "2280000",
    "serie": [
      { "fecha": "2026-10-31", "patrimonio": "2580000" },
      { "fecha": "2026-11-21", "patrimonio": "2280000" }
    ],
    "variacionSerie": "-300000"
  },
  "cambioDelMes": {
    "fechaAnterior": "2026-10-31",
    "fechaCierre": "2026-11-30",
    "patrimonioAnterior": "2580000",
    "resultado": "-300000",
    "otrosCambios": "0",
    "patrimonioCierre": "2280000"
  }
}
```

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `MES_INVALIDO` | `mes` | No es `YYYY-MM` o el mes no existe (`2026-13`). |
| 400 | `MES_FUTURO` | `mes` | El mes es posterior al actual en la zona del usuario. «Ese mes todavía no llega.» |

### Cifras del mes

- **Ingresos / gastos:** suma de los movimientos `ingreso` / `gasto` con fecha
  en el mes, de todas las cuentas (archivadas incluidas). Las transferencias no
  cuentan (pago de tarjeta, compra de inversión, préstamo: RN-05 a RN-08).
- **Préstamos** (SPEC 08): el desembolso y el capital de un abono son
  transferencias y no cuentan. El interés cobrado es un ingreso y el pagado un
  gasto (RN-09). Una condonación es un gasto con la categoría elegida (RN-17).
- **Gasto por categoría:** un gasto con categoría suma a ella. Un gasto
  dividido suma cada parte a la categoría de la parte. Un gasto sin categoría
  ni partes suma a `sinCategoria`.
- `categorias`: las que tienen gasto en el mes **o** en el anterior (una con
  gasto solo el mes anterior llega con `monto: "0"`). Nunca incluye «sin
  categoría». Orden: `monto` desc, luego `anterior` desc, luego el orden de la
  categoría.
- `sinCategoria` llega siempre, aunque sea con ceros. El cliente decide si
  mostrarla.

### Patrimonio

El patrimonio a una fecha se **calcula en cada consulta**, nunca se guarda
(RN-01):

- Cuenta cada cuenta creada hasta ese día (día local de su creación),
  **archivadas incluidas**. Una cuenta eliminada (nunca tuvo movimientos) no
  cuenta en ninguna fecha.
- Cada cuenta aporta el saldo inicial **vigente en esa fecha** más el efecto de
  sus movimientos con fecha ≤ ese día. Editar el saldo inicial hoy no cambia
  los cierres pasados.
- Los activos suman y los pasivos (tarjeta) restan.
- **Préstamos** (SPEC 08): cada préstamo es una cuenta y entra igual. Lo que te
  deben suma y lo que debes resta. Los intereses causados no se suman (ver
  [`prestamos.md`](prestamos.md)).

`serie`: el patrimonio al último día de cada uno de los 11 meses anteriores al
**mes actual** (no al mes consultado), más el de hoy. Se omiten los puntos
anteriores a `inicio`. Es la misma sea cual sea `mes`.

**Diferencia con `GET /cuentas`:** `patrimonio.hoy` y los cierres cuentan
movimientos con fecha ≤ el día. `patrimonioNeto` de `GET /cuentas` incluye
también los de fecha futura. Con movimientos futuros, las dos cifras difieren.

### Puente del mes (`cambioDelMes`)

`patrimonioAnterior + resultado + otrosCambios = patrimonioCierre`, siempre.

- `patrimonioAnterior`: patrimonio al último día del mes anterior.
- `patrimonioCierre`: patrimonio al último día del mes consultado. En el mes
  actual coincide con hoy, salvo movimientos con fecha futura dentro del mes.
  El cliente lo rotula «a hoy».
- `otrosCambios` es el residuo. Recoge los saldos iniciales de cuentas creadas
  en el mes, las ediciones de saldo inicial del mes y los movimientos fechados
  antes de crear su cuenta. Los saldos iniciales no son movimientos: nunca
  entran en ingresos ni gastos.

### Estado de día uno y navegación

- `tieneMovimientos: false`: el usuario no tiene ningún movimiento. Las tres
  cifras llegan en `"0"` con `variacionPorcentaje: null`, `categorias: []` y,
  con una cuenta creada hoy, una serie de un solo punto (hoy).
- Un mes anterior a `inicio` responde `200` con ceros, sin error. El cliente
  oculta «‹» cuando `desde` ≤ `inicio`, y «›» en el mes actual (el siguiente
  daría `MES_FUTURO`).

### Clasificar los gastos sin categoría

No hay endpoint propio. El cliente pide `GET /movimientos?mes=` (ver
[`movimientos.md`](movimientos.md)), filtra `tipo = "gasto"`,
`categoria = null` y `partes = []`, y edita cada uno con
`PUT /movimientos/:id`.

### Zona horaria

Los días de creación de cuenta y de edición de saldo inicial se calculan con la
zona **actual** del perfil. Si el usuario cambia de zona, una cuenta creada
cerca de medianoche puede pasar al día vecino.
