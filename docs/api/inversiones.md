# Inversiones

> **Spec de origen:** SPEC 10, SPEC 11 (precios automáticos) · Convenciones comunes en [`README.md`](README.md).

Una inversión es una **cuenta** de tipo `inversion` (activo) con moneda `COP`
o `USD`, fija desde el alta. Tiene:

- **efectivo:** el saldo de la cuenta, calculado. Es el efectivo inicial, más
  y menos las transferencias, menos las compras y más las ventas;
- **posiciones:** una por activo con cantidad. Se derivan de las operaciones
  (`inicial`, `compra`, `venta`); nunca se guardan;
- **precios:** historial por activo. Automáticos si el proveedor cubre el
  activo, manuales si no (ver [Precios automáticos](#precios-automáticos)).

Nombre, detalle, orden y archivo se manejan con [`/cuentas`](cuentas.md). El
fondeo y el retiro son transferencias de [`/movimientos`](movimientos.md), con
`montoDestino` si las monedas difieren. Comprar y vender no son movimientos:
mueven valor dentro de la cuenta y nunca son ingreso ni gasto.

## Unidades

| Dato | En el contrato | Ejemplo |
|---|---|---|
| Monto (efectivo, operación, valor, costo) | string entero en unidades menores **de la moneda de la cuenta** (COP = pesos, USD = centavos) | `"100000"` = US$ 1.000,00 |
| Cantidad | string decimal con hasta 8 decimales, sin ceros finales | `"0.0125"`, `"6.25"`, `"1"` |
| Precio por unidad | string entero en unidades menores | `"56240"` = US$ 562,40 |
| Porcentaje de rendimiento | `number` entero en **centésimas** (excepción a las convenciones) | `1248` = 12,48 % |
| TRM | `TrmDto` de [`trm.md`](trm.md) | `"4120.00"` |

- Los porcentajes pueden ser negativos y son `null` sin base (costo 0).
- En una inversión `COP`, **todo campo `…Cop` es `null`**: el monto ya está
  en pesos.
- En una `USD`, los `…Cop` usan la TRM de hoy (`trm`). Sin TRM son `null`.
- El monto de una operación es el total real, con la comisión incluida. El
  precio unitario se deriva.

```ts
type Moneda = "COP" | "USD";
type TrmDto = { valor: string; vigenteDesde: string; vigenteHasta: string; fuente: string };
```

## `GET /inversiones`

Inversiones no archivadas, en el orden de Cuentas, valoradas a hoy. Trae la
TRM de hoy aunque no haya ninguna inversión.

**200** `InversionesDto`

```ts
type InversionesDto = {
  fechaHoy: string;                       // "YYYY-MM-DD" en la zona del usuario
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  inversiones: InversionResumenDto[];     // [] → estado vacío
};

type InversionResumenDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  valorMercado: string;                   // efectivo + posiciones, en su moneda
  valorMercadoCop: string | null;
  rendimiento: string;                    // no realizado, de las posiciones abiertas
  rendimientoPorcentaje: number | null;   // centésimas
};
```

## `POST /inversiones`

Crea la cuenta con su efectivo inicial y, opcionalmente, lo que ya se tenía.

```ts
type InversionCuerpo = {
  nombre: string;                         // 1 a 60 tras recortar
  moneda: "COP" | "USD";
  efectivoInicial?: string;               // entero ≥ 0, default "0"
  posiciones?: PosicionInicialCuerpo[];   // default []
};

type PosicionInicialCuerpo = {
  simbolo: string;                        // se recorta y pasa a mayúsculas
  nombre?: string;                        // 1 a 80; opcional si el símbolo está cubierto
  cantidad: string;
  costo: string;                          // total pagado, > 0
  fecha?: string;                         // default hoy; no futura
};
```

- Cada posición es una operación `inicial`. Suma a la posición y **no mueve
  efectivo**.
- El primer precio de cada activo es su costo unitario (`costo ÷ cantidad`).
- Cada activo nace `automatica` si el proveedor lo cubre en la moneda de la
  cuenta, o `manual` si no. Sin `nombre`, va el del proveedor; con él, gana el
  del usuario. Un activo no cubierto sin `nombre` da `NOMBRE_REQUERIDO` con
  `campo` `posiciones.<i>.nombre`. Cada posición gasta una búsqueda del
  proveedor.

**201** `InversionDetalleDto`.

## `GET /inversiones/:id`

Detalle valorado a hoy. También responde con una inversión archivada. Antes
trae del proveedor los precios automáticos vencidos.

**200** `InversionDetalleDto`

```ts
type InversionDetalleDto = {
  id: string;
  nombre: string;
  moneda: Moneda;
  naturaleza: "activo";
  fechaHoy: string;
  trm: TrmDto | null;
  trmDesactualizada: boolean;
  valorMercado: string;                   // efectivo + Σ valor de las posiciones
  valorMercadoCop: string | null;
  costo: string;                          // de las posiciones abiertas, sin el efectivo
  costoCop: string | null;
  rendimiento: string;                    // valor − costo de las posiciones abiertas
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;
  efectivo: string;
  efectivoCop: string | null;
  posiciones: PosicionDto[];              // solo abiertas (cantidad > 0)
  archivadaEn: string | null;
};

type PosicionDto = {
  activoId: string;                       // para registrar su precio
  simbolo: string;
  nombre: string;
  cantidad: string;
  costo: string;
  costoPromedio: string;                  // por unidad (costo promedio ponderado)
  precio: string;                         // vigente, por unidad
  precioFecha: string;                    // "YYYY-MM-DD"
  precioOrigen: "manual" | "cierre" | "intradia";
  precioCotizadoEn: string;               // ISO 8601 UTC
  precioVencido: boolean;                 // automático cuya última consulta no trajo precio
  precioAnterior: { precio: string; fecha: string } | null;
  cotizacion: "automatica" | "manual";
  clase: "accion" | "etf" | "cripto" | null; // la da el proveedor
  valor: string;                          // cantidad × precio
  valorCop: string | null;
  rendimiento: string;                    // valor − costo
  rendimientoCop: string | null;
  rendimientoPorcentaje: number | null;   // centésimas
};
```

- Las posiciones van por la fecha de su primera operación, luego por la
  creación del activo y luego por símbolo.
- Las posiciones cerradas no salen aquí. Su historia sigue en
  `GET …/operaciones`.
- El texto relativo («hace 4 días») lo arma el cliente con `precioFecha` y
  `fechaHoy`.
- La vista previa de un precio manual (valor nuevo y su equivalente) la
  calcula el cliente con `cantidad` y `trm`.
- La nota del precio («Cierre 10 nov», «Intradía 10:42», «Manual») la arma el
  cliente con `clase`, `precioOrigen`, `precioFecha` y `precioCotizadoEn`. La
  hora del intradía va en la zona del usuario.
- «Actualizar precio» se muestra solo con `cotizacion: "manual"`.

## `GET /inversiones/:id/operaciones`

`?activoId=` (opcional): solo las de ese activo.

**200** `{ operaciones: OperacionDto[] }`, por `fecha` desc y luego por
registro desc.

```ts
type OperacionDto = {
  id: string;
  activo: { id: string; simbolo: string; nombre: string };
  clase: "inicial" | "compra" | "venta";
  cantidad: string;
  monto: string;                          // total, comisión incluida
  precioUnitario: string;                 // monto ÷ cantidad, redondeado
  fecha: string;
  gananciaRealizada: string | null;       // solo en venta; puede ser negativa
  creadoEn: string;
  actualizadoEn: string;
};
```

La ganancia realizada es lo cobrado menos el costo promedio de lo vendido. No
es ingreso: queda en el efectivo y cuenta en la revaluación del resumen.

## `POST /inversiones/:id/operaciones`

```ts
type OperacionCuerpo = {
  clase: "inicial" | "compra" | "venta";
  simbolo: string;
  nombre?: string;                        // obligatorio si el activo es nuevo y no está cubierto
  cantidad: string;                       // > 0, hasta 8 decimales
  monto: string;                          // total, > 0
  fecha?: string;                         // default hoy; no futura
};
```

- `compra` resta `monto` del efectivo; `venta` lo suma; `inicial` no lo toca.
- Un símbolo nuevo crea el activo. Su primer precio es `monto ÷ cantidad`.
  Nace `automatica` o `manual` como en `POST /inversiones`, y gasta una
  búsqueda del proveedor. Un símbolo que ya está en la cuenta no la necesita.
- La línea de tiempo debe seguir válida (ver abajo).

**201** `InversionDetalleDto`.

## `PUT /inversiones/:id/operaciones/:operacionId`

```ts
type OperacionCambio = { cantidad?: string; monto?: string; fecha?: string }; // al menos uno
```

La clase y el activo no cambian: para eso se borra y se crea otra. Cada
cambio queda en el historial.

**200** `InversionDetalleDto`.

## `DELETE /inversiones/:id/operaciones/:operacionId`

**204**. La eliminación queda en el historial.

## `POST /inversiones/:id/activos/:activoId/precios`

```ts
type PrecioCuerpo = { precio: string };   // por unidad, entero > 0
```

Registra el precio con la fecha de hoy. No borra el anterior, que pasa a ser
`precioAnterior`. Solo en un activo `manual`: en uno automático da
`PRECIO_AUTOMATICO` (el siguiente refresco lo pisaría).

**201** `InversionDetalleDto`.

## `GET /inversiones/:id/activos/buscar`

`?simbolo=` (obligatorio): se recorta y pasa a mayúsculas.

**200** `BusquedaActivoDto`

```ts
type BusquedaActivoDto = {
  simbolo: string;                        // normalizado
  cubierto: boolean;
  nombre: string | null;                  // del proveedor, si cubre
  clase: "accion" | "etf" | "cripto" | null;
  proveedorDisponible: boolean;           // false: sin clave o la fuente falló; cubierto es false
};
```

- Gasta un crédito del proveedor. El cliente la llama al salir del campo de
  símbolo, no en cada tecla.
- Sirve para autocompletar el nombre antes de crear el activo. Al crear, la
  cobertura se resuelve sola: no hace falta llamarla.

## `PATCH /inversiones/:id/activos/:activoId`

```ts
type CotizacionCambio = { cotizacion: "automatica" | "manual" }; // ningún otro campo
```

- A `automatica`: el proveedor debe cubrir el símbolo en la moneda de la
  cuenta (`ACTIVO_NO_CUBIERTO`). Si el proveedor no responde,
  `PROVEEDOR_NO_DISPONIBLE`. La respuesta trae el precio todavía sin refrescar:
  la siguiente lectura lo trae.
- A `manual`: el precio vigente sigue siendo el último que hubo, ahora como
  base del modo manual. Conserva `clase`.
- Pedir el modo que ya tiene da `SIN_CAMBIOS`.
- Sirve para volver automáticos los activos de antes de SPEC 11 y para pasar a
  manual uno que el proveedor confundió.

**200** `InversionDetalleDto`.

## Precios automáticos

Proveedor: Twelve Data, plan gratis (bolsa de EE. UU. y cripto contra el
dólar).

- **Cobertura.** Un activo es automático solo si el proveedor lo encuentra en
  la moneda de la cuenta: una cripto `S/USD`, o una acción o un ETF con el
  mismo símbolo, en USD y en NASDAQ o NYSE. La cripto se prueba primero. Un
  activo de una inversión `COP` siempre queda manual.
- **Qué precio trae.** Acciones y ETF: el último cierre, con la fecha de la
  sesión (`precioOrigen: "cierre"`). Cripto: el último precio del día
  (`"intradia"`), uno por día, que se reemplaza en cada consulta.
- **Cuándo consulta.** Al leer, solo si el precio está vencido: 60 min desde
  la última consulta en acciones y ETF, 15 min en cripto. A lo sumo 8 activos
  por lectura, los de consulta más antigua primero; el resto, en la siguiente.
  Lo hacen `GET /inversiones`, `GET /inversiones/:id`, `GET /cuentas`,
  `GET /cuentas/archivadas` y `GET /resumen`. Su forma no cambia por eso.
- **Histórico.** `GET /resumen` además completa los cierres pasados de las
  fechas del patrimonio (cierres de la serie y del puente, y hoy) en que el
  activo tuvo cantidad y no hay precio en los 7 días anteriores. Una consulta
  por activo; después quedan guardados.
- **Si el proveedor falla.** La lectura responde igual, con el último precio y
  su fecha y `precioVencido: true`. La falla nunca es un error HTTP en las
  lecturas. La consulta queda marcada: no se repite hasta que venza otra vez.
- **Precio vigente.** El de mayor fecha. En un activo automático con precios
  del proveedor, solo entre ellos: el costo unitario con que nació no le gana
  al último cierre.
- Sin `TWELVE_DATA_API_KEY` en la API, todo activo nace manual, la búsqueda da
  `proveedorDisponible: false` y ninguna lectura consulta.

## Línea de tiempo

Al cierre de cada día, el efectivo corrido no puede quedar negativo
(`EFECTIVO_INSUFICIENTE`). La cantidad de ningún activo tampoco
(`CANTIDAD_INSUFICIENTE`). Se comprueba en estas escrituras:

- crear, editar y borrar operaciones;
- crear, editar y borrar transferencias que tocan la inversión;
- cambiar el saldo inicial con `PATCH /cuentas/:id`.

Ejemplos:

- comprar sin fondeo previo;
- vender antes de la compra;
- borrar una compra que tiene ventas posteriores;
- borrar el fondeo que pagó una compra.

## Errores

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `NOMBRE_REQUERIDO` | `nombre` | Nombre vacío; o activo nuevo no cubierto sin `nombre` (`posiciones.<i>.nombre` en el alta). |
| 400 | `NOMBRE_LARGO` | `nombre` | Más de 60 (cuenta) u 80 (activo) caracteres. |
| 400 | `MONEDA_INVALIDA` | `moneda` | Ni `COP` ni `USD`. |
| 400 | `SIMBOLO_INVALIDO` | `simbolo` | No es `A-Z`, `0-9`, `.` o `-`, hasta 12. |
| 400 | `CANTIDAD_INVALIDA` | `cantidad` | No es > 0 con hasta 8 decimales. |
| 400 | `MONTO_REQUERIDO` | `monto` / `costo` | Falta o es 0. |
| 400 | `MONTO_INVALIDO` | el del monto | No es un entero. |
| 400 | `FECHA_INVALIDA` | `fecha` | No es una fecha válida. |
| 400 | `FECHA_FUTURA` | `fecha` | Posterior a hoy. |
| 400 | `PRECIO_INVALIDO` | `precio` | No es > 0; o el costo unitario de un activo nuevo redondea a 0. |
| 400 | `ACTIVO_DUPLICADO` | `posiciones` | Símbolo repetido en el alta. |
| 400 | `SIN_CAMBIOS` | — | `PUT` sin campos; `PATCH` al modo que ya tiene. |
| 400 | `ENTRADA_INVALIDA` | `clase` / `cotizacion` | Clase o modo desconocido, o forma inválida (también un campo de más en el `PATCH`). |
| 404 | `INVERSION_NO_ENCONTRADA` | — | La cuenta no existe, es ajena o no es una inversión. |
| 404 | `ACTIVO_NO_ENCONTRADO` | `simbolo` | Venta de un símbolo que no está en la cuenta; precio o `PATCH` de un activo ajeno. |
| 404 | `OPERACION_NO_ENCONTRADA` | — | La operación no existe en esa cuenta. |
| 409 | `NOMBRE_DUPLICADO` | `nombre` | Otra cuenta activa con ese nombre. |
| 409 | `CUENTA_ARCHIVADA` | — | Operar, poner precio o cambiar el modo en una inversión archivada. |
| 422 | `EFECTIVO_INSUFICIENTE` | — | La línea de tiempo deja el efectivo negativo. |
| 422 | `CANTIDAD_INSUFICIENTE` | `cantidad` | La línea de tiempo deja una cantidad negativa. |
| 422 | `ACTIVO_NO_CUBIERTO` | `cotizacion` | `PATCH` a `automatica` de un activo que el proveedor no cubre. |
| 422 | `PRECIO_AUTOMATICO` | `precio` | Precio manual en un activo automático. |
| 503 | `PROVEEDOR_NO_DISPONIBLE` | — | `PATCH` a `automatica` con el proveedor caído o sin clave. Solo ahí: en las lecturas la falla no es un error. |
| 401 | `NO_AUTENTICADO` | — | Sin token válido. |

Errores de otros módulos con inversiones:

- `CUENTA_DE_INVERSION` (422): gasto o ingreso con una inversión. También al
  usarla en recurrentes, préstamos o como cuenta predeterminada.
- `MONTO_DESTINO_REQUERIDO` y `MONTO_DESTINO_NO_PERMITIDO` (400): en
  `/movimientos`.
- `TIPO_DE_INVERSION_FIJO` (422): cambiar el tipo con `PATCH /cuentas/:id`.
- `SALDO_NO_CERO` (409): archivar con efectivo o posiciones abiertas.
