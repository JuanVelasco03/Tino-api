# Avisos

> **Spec de origen:** SPEC 12 · **Necesidades:** `specs/necesidades/avisos.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Avisos dentro de la app: recurrentes por confirmar, cobros a quien te debe,
deudas por pagar y precios manuales sin actualizar. Cada tipo se activa o
apaga y tiene su antelación.

**Los avisos no se guardan.** La API los deriva en cada lectura desde las
fuentes vivas (plantillas y sus cierres, préstamos y sus movimientos, activos
manuales y sus precios). El detalle de un aviso refleja siempre el estado
actual de su fuente. Solo se guarda lo que decide el usuario: qué avisos marcó
como leídos o no leídos y la configuración de cada tipo.

**La API manda campos, no frases.** Cada aviso es una unión discriminada por
`tipo`. El cliente arma el título, el detalle (largo o corto), la acción, el
plazo y el grupo (ver [Qué arma el cliente](#qué-arma-el-cliente)).

**Todavía no:** avisos de pago y de corte de la tarjeta de crédito, metas,
push o correo (los avisos solo existen dentro de la app), hora de aviso
editable (son las 08:00 fijas), limpieza de marcas viejas, historial de
cambios de marcas y configuración, avisos de activos en inversiones
archivadas.

---

## Resumen de endpoints

| Método y ruta | Cuerpo / consulta | Éxito |
|---|---|---|
| [`GET /avisos`](#get-avisos) | — | `200 AvisosDto` |
| [`GET /avisos/conteo`](#get-avisosconteo) | — | `200 ConteoAvisosDto` |
| [`PATCH /avisos/:clave`](#patch-avisosclave) | `MarcaCuerpo` | `204` |
| [`POST /avisos/leer-todos`](#post-avisosleer-todos) | — | `204` |
| [`PATCH /avisos/config/:tipo`](#patch-avisosconfigtipo) | `ConfigCuerpo` | `200 AvisoConfigDto` |

Ninguna lectura llama a proveedores externos: los avisos no refrescan precios
ni la TRM.

---

## Conceptos

### Tipos y configuración

| `tipo` | Qué significa `dias` | `opciones` | Por defecto |
|---|---|---|---|
| `recurrente` | Días de antelación al vencimiento. | `1, 3, 5, 7` | activo, `3` |
| `cobro` | Cada cuántos días se repite desde la fecha acordada. `0` = nunca. | `0, 14, 30` | activo, `30` |
| `deuda` | Días de antelación a la fecha acordada. | `1, 3, 7` | activo, `7` |
| `precio_manual` | Días sin precio nuevo. | `3, 7, 14` | **inactivo**, `7` |

Un tipo inactivo no da avisos: desaparecen de la lista y del conteo, y
vuelven al activarlo.

### Cuándo aparece un aviso

Cada aviso tiene un día D y aparece a las **08:00** de ese día en la zona del
perfil (`horaAvisos`, `zonaHoraria`). Si la fuente se creó después (una
plantilla creada hoy que vence mañana), el aviso aparece en el instante de la
creación: un aviso nunca es anterior a su fuente. Ese momento es `instante`.

Se listan los avisos con `instante` ya pasado y de los **últimos 60 días**.
Antes de las 08:00 todavía no sale el aviso de hoy.

### Reglas por tipo

- **`recurrente`** (N-36): uno por cada ocurrencia de una plantilla **no
  pausada**, `dias` antes de su vencimiento. Queda resuelto cuando la
  ocurrencia se confirma u omite (`resolucion.forma` `"confirmada"` u
  `"omitida"`, con la fecha en que se cerró). El monto es el de la pantalla de
  recurrentes: el del movimiento si se confirmó; si no, el importe mostrado,
  con `estimado: true` en una variable.
- **`cobro`** (N-37, N-40): solo préstamos que te deben con **fecha
  acordada**. Hay un recordatorio en la fecha acordada y luego cada `dias`
  días exactos (14 o 30; con `0`, solo el primero), mientras al final de ese
  día quede capital. `proximoRecordatorio` es el siguiente, si se repite y hay
  capital hoy.
- **`deuda`** (N-38, N-40): solo deudas con **fecha acordada**. Un aviso
  `dias` antes de la fecha acordada, si a ese día quedaba capital.
- **`precio_manual`** (N-39): solo activos con cotización manual, con
  posición abierta y en una inversión no archivada. Un aviso por cada precio
  que se quedó más de `dias` días sin uno nuevo (en `precioFecha + dias`). Un
  precio nuevo lo resuelve (`resolucion.fecha`) y abre un plazo nuevo. Sin
  monto.

**Resolución de `cobro` y `deuda`:** un abono, una condonación o un interés
con fecha igual o posterior al día del aviso lo resuelve. `resolucion` cita el
primero: su forma (`"abono"` o `"condonacion"`), fecha, monto (capital más el
interés del mismo abono) y cuenta propia (`null` en una condonación). Un abono
parcial resuelve el aviso aunque quede capital; el siguiente recordatorio
vuelve a salir si queda capital.

**Fuentes que desaparecen:** pausar o eliminar una plantilla, eliminar un
préstamo, pasar un activo a automático, cerrar su posición o archivar su
inversión quita sus avisos, también del historial.

### Leído

- Sin marca, un aviso está **leído si está resuelto** (N-26): confirmar,
  abonar o registrar el precio lo deja leído sin tocar los avisos.
- `PATCH /avisos/:clave` guarda una marca explícita, que gana sobre la
  resolución: un aviso resuelto puede volver a «no leído».

### Clave

`clave` identifica el aviso: `<tipo>:<id de la fuente>:<YYYY-MM-DD>`.

| `tipo` | Fuente | Fecha |
|---|---|---|
| `recurrente` | id de la plantilla | vencimiento |
| `cobro` | id del préstamo | recordatorio |
| `deuda` | id del préstamo | fecha acordada |
| `precio_manual` | id del activo | fecha del precio que se quedó sin actualizar |

Es estable mientras la fuente no cambie. Si cambian la fecha acordada, el
calendario de la plantilla o los `dias` de los cobros, nacen claves nuevas: los
avisos nuevos llegan sin leer y las marcas viejas dejan de aplicar.

---

## Tipos

```ts
type Ref = { id: string; nombre: string };
type TipoAviso = "recurrente" | "cobro" | "deuda" | "precio_manual";

type AvisoBaseDto = {
  clave: string;                  // "recurrente:<uuid>:2026-11-25"
  tipo: TipoAviso;
  instante: string;               // ISO UTC: 08:00 locales del día del aviso, o la creación de la fuente
  leido: boolean;
  resuelto: boolean;              // true → sin acción (N-24)
};

type AvisoRecurrenteDto = AvisoBaseDto & {
  tipo: "recurrente";
  recurrente: { id: string; concepto: string; tipo: "gasto" | "ingreso" | "transferencia"; variable: boolean };
  vencimiento: string;
  cuenta: Ref | null;             // origen, o destino en un ingreso
  monto: string;                  // confirmada: el del movimiento; si no, el importe mostrado
  estimado: boolean;              // variable y no confirmada → «≈»
  resolucion: { forma: "confirmada" | "omitida"; fecha: string } | null;
};

type ResolucionPrestamoDto = { forma: "abono" | "condonacion"; fecha: string; monto: string; cuenta: Ref | null };

type AvisoCobroDto = AvisoBaseDto & {
  tipo: "cobro";
  prestamo: Ref;                  // la persona
  fechaAcordada: string;
  recordatorio: string;           // = fechaAcordada en el primero
  monto: string;                  // resuelto: el de la resolución; si no, el capital pendiente de hoy
  capitalPendiente: string;       // hoy
  proximoRecordatorio: string | null;
  resolucion: ResolucionPrestamoDto | null;
};

type AvisoDeudaDto = AvisoBaseDto & {
  tipo: "deuda";
  prestamo: Ref;
  fechaAcordada: string;
  monto: string;                  // resuelto: el de la resolución; si no, el capital pendiente de hoy
  capitalPendiente: string;       // hoy («Quedan 500.000»)
  resolucion: ResolucionPrestamoDto | null;
};

type AvisoPrecioDto = AvisoBaseDto & {
  tipo: "precio_manual";
  activo: { id: string; simbolo: string; nombre: string };
  inversion: Ref;
  precioFecha: string;
  resolucion: { fecha: string } | null;
};

type AvisoDto = AvisoRecurrenteDto | AvisoCobroDto | AvisoDeudaDto | AvisoPrecioDto;

type AvisoConfigDto = { tipo: TipoAviso; activo: boolean; dias: number; opciones: number[] };

type AvisosDto = {
  fechaHoy: string;               // hoy en la zona del perfil
  zonaHoraria: string;            // IANA, la del perfil
  horaAvisos: "08:00";
  noLeidos: number;
  avisos: AvisoDto[];             // visibles, en orden
  config: AvisoConfigDto[];       // los cuatro tipos, en el orden de la tabla
};

type ConteoAvisosDto = { noLeidos: number };
type MarcaCuerpo = { leido: boolean };
type ConfigCuerpo = { activo?: boolean; dias?: number };
```

Todos los montos de avisos son COP: recurrentes y préstamos no admiten USD.

---

## `GET /avisos`

La pantalla completa: lista, conteo y configuración en una lectura.

- `avisos`: los visibles de los tipos activos, por `instante` descendente;
  empate por tipo (en el orden de la tabla de tipos) y luego por `clave`.
- `noLeidos`: cuántos de ellos tienen `leido: false`.
- Sin avisos: `avisos: []` y `noLeidos: 0` (N-28).

```json
{
  "fechaHoy": "2026-11-22",
  "zonaHoraria": "America/Bogota",
  "horaAvisos": "08:00",
  "noLeidos": 1,
  "avisos": [
    {
      "clave": "recurrente:9b1c…:2026-11-25",
      "tipo": "recurrente",
      "instante": "2026-11-22T13:00:00.000Z",
      "leido": false,
      "resuelto": false,
      "recurrente": { "id": "9b1c…", "concepto": "Gas Vanti", "tipo": "gasto", "variable": true },
      "vencimiento": "2026-11-25",
      "cuenta": { "id": "…", "nombre": "Nequi" },
      "monto": "32400",
      "estimado": true,
      "resolucion": null
    }
  ],
  "config": [
    { "tipo": "recurrente", "activo": true, "dias": 3, "opciones": [1, 3, 5, 7] },
    { "tipo": "cobro", "activo": true, "dias": 30, "opciones": [0, 14, 30] },
    { "tipo": "deuda", "activo": true, "dias": 7, "opciones": [1, 3, 7] },
    { "tipo": "precio_manual", "activo": false, "dias": 7, "opciones": [3, 7, 14] }
  ]
}
```

## `GET /avisos/conteo`

Solo `{ "noLeidos": n }`, para el punto del menú (N-02). Hace el mismo cálculo
que `GET /avisos`. El cliente lo vuelve a pedir después de una acción o de un
`PATCH`.

## `PATCH /avisos/:clave`

Marca un aviso como leído o no leído (N-25). `204` sin cuerpo.

```json
{ "leido": false }
```

- La clave debe ser de un aviso **visible ahora**; si no (no existe, su fuente
  desapareció, su tipo está inactivo, salió del historial o la fuente es de
  otro usuario): `404 AVISO_NO_ENCONTRADO`.
- Clave mal formada o `leido` que no es booleano: `400 ENTRADA_INVALIDA`.

## `POST /avisos/leer-todos`

Marca como leídos todos los avisos visibles no leídos, en una sola escritura
(N-07). Sin cuerpo; `204`. Sin pendientes, responde `204` sin escribir.

## `PATCH /avisos/config/:tipo`

Cambia la configuración de un tipo (N-32, N-33). Responde el tipo con su
configuración nueva.

```json
{ "dias": 14 }
```

```json
{ "tipo": "precio_manual", "activo": true, "dias": 14, "opciones": [3, 7, 14] }
```

- `activo` enciende o apaga el tipo.
- `dias` debe estar en las `opciones` del tipo. **Si viene `dias` sin
  `activo`, el tipo queda activo** (elegir una antelación lo enciende).
- Un cuerpo sin campos: `400 SIN_CAMBIOS`.
- `:tipo` fuera de los cuatro: `400 ENTRADA_INVALIDA`.

---

## Qué arma el cliente

- **Título y detalle**, largo (web) o corto (móvil), con los campos de cada
  tipo: `recurrente.concepto`, `prestamo.nombre`, `activo`, `vencimiento`,
  `fechaAcordada`, `cuenta`, `monto` (con «≈» si `estimado`),
  `capitalPendiente`, `proximoRecordatorio`, `precioFecha` y `resolucion`.
  Entra o sale: `recurrente.tipo` (gasto y transferencia salen; ingreso
  entra); `cobro` entra y `deuda` sale.
- **Plazo:** `diasEntre(fechaLocal(instante), vencimiento | fechaAcordada)`.
- **Grupo** (Hoy, Ayer, Esta semana, Antes) y la hora, con `instante`,
  `zonaHoraria` y `fechaHoy`.
- **Acción**, solo si `resuelto` es `false`, con endpoints existentes:

| Aviso | Acción | Endpoint |
|---|---|---|
| `recurrente`, `variable: false` | Confirmar | `POST /recurrentes/:id/confirmar` con `vencimiento` ([recurrentes](recurrentes.md)) |
| `recurrente`, `variable: true` | Ajustar | el mismo, con `monto` |
| `cobro` | Registrar abono | `POST /prestamos/:id/abonos` ([préstamos](prestamos.md)) |
| `precio_manual` | Registrar precio | `POST /inversiones/:id/activos/:activoId/precios` ([inversiones](inversiones.md)) |

`deuda` no lleva acción propia en el diseño; el abono se registra desde Deudas.

Después de una acción o de un `PATCH`, el cliente vuelve a pedir
`GET /avisos/conteo` para el menú.

---

## Errores

| `codigo` | Estado | `campo` | Cuándo |
|---|---|---|---|
| `AVISO_NO_ENCONTRADO` | 404 | — | `PATCH /avisos/:clave` sobre una clave que no es de un aviso visible. |
| `ANTELACION_INVALIDA` | 400 | `dias` | `dias` fuera de las opciones del tipo, o no entero. |
| `SIN_CAMBIOS` | 400 | — | `PATCH /avisos/config/:tipo` sin campos. |
| `ENTRADA_INVALIDA` | 400 | — | Clave mal formada, `:tipo` desconocido o cuerpo con la forma equivocada. |

Además, los comunes: `NO_AUTENTICADO` y `ERROR_INTERNO` (ver
[`README.md`](README.md)).
