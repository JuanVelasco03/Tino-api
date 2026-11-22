# Captura rápida y sugerencias

> **Spec de origen:** SPEC 04 (predeterminada sin inversiones: SPEC 10) · **Necesidades:** `specs/necesidades/captura-rapida.md`
> · Convenciones comunes (auth, montos, errores) en [`README.md`](README.md).

Lo que necesita el formulario de registro: una llamada al abrir
(`GET /captura`) y otra mientras se escribe la descripción
(`GET /sugerencias`). El registro en sí es `POST /movimientos`
([`movimientos.md`](movimientos.md)); las cuentas para elegir salen de
`GET /cuentas` ([`cuentas.md`](cuentas.md)).

---

## Resumen de endpoints

| Método y ruta | Consulta | Éxito |
|---|---|---|
| [`GET /captura`](#get-captura) | — | `200 CapturaDto` |
| [`GET /sugerencias`](#get-sugerencias) | `?tipo=&texto=` | `200 SugerenciasDto` |

---

## Tipos

```ts
type CategoriaDto = { id: string; nombre: string; tipo: "gasto" | "ingreso" };

type CapturaDto = {
  fechaHoy: string;                        // "YYYY-MM-DD" en la zona del usuario: el defecto de la fecha
  cuentaPredeterminadaId: string | null;   // la elegida si está activa; si no, la primera activa; null sin cuentas
  categorias: { gasto: CategoriaDto[]; ingreso: CategoriaDto[] }; // en el orden en que se muestran
  gastosHoy: string;                       // suma de los gastos de hoy (sin ingresos ni transferencias)
  conceptosFrecuentes: {                   // hasta 6 por tipo, últimos 90 días, el más usado primero
    gasto: string[];
    ingreso: string[];
    transferencia: string[];
  };
};

type SugerenciasDto = {
  conceptos: { descripcion: string; categoria: CategoriaDto | null }[]; // hasta 2
  propuesta: {
    categoria: CategoriaDto;
    regla: { id: string; palabraClave: string };
  } | null;
};
```

---

## `GET /captura`

**200**

```json
{
  "fechaHoy": "2026-11-19",
  "cuentaPredeterminadaId": "8f0e…",
  "categorias": {
    "gasto": [
      { "id": "bb9f…", "nombre": "Comida", "tipo": "gasto" },
      { "id": "c1d2…", "nombre": "Transporte", "tipo": "gasto" }
    ],
    "ingreso": [
      { "id": "a7e3…", "nombre": "Salario", "tipo": "ingreso" }
    ]
  },
  "gastosHoy": "45000",
  "conceptosFrecuentes": {
    "gasto": ["Almuerzo", "Tinto", "Pasaje"],
    "ingreso": [],
    "transferencia": []
  }
}
```

- **Categorías:** todo usuario nace con 9 de gasto (Comida, Transporte,
  Celular, Mercado, Hogar, Salud, Ocio, Servicios, Otros gastos) y 4 de ingreso
  (Salario, Trabajo independiente, Reembolso, Otros ingresos). Hoy no se
  crean, renombran ni archivan. La transferencia no tiene categorías.
- **Cuenta predeterminada:** la que eligió el usuario con `PATCH /perfil`
  ([`perfil.md`](perfil.md)) si sigue activa; si no eligió o está archivada, la
  primera no archivada en el orden de `GET /cuentas` (activos antes que
  pasivos). Una cuenta de inversión nunca es la predeterminada (SPEC 10): no
  admite gastos ni ingresos.
- **Conceptos frecuentes:** sin distinguir mayúsculas; se muestra la grafía
  usada más recientemente. Un usuario sin movimientos recibe listas vacías.

Errores: solo los comunes.

---

## `GET /sugerencias`

Autocompletado de la descripción y categoría propuesta por regla (RN-11: la
API propone, el usuario dispone).

| Consulta | |
|---|---|
| `tipo` | `gasto`, `ingreso` o `transferencia`. Obligatorio. |
| `texto` | Lo escrito hasta ahora (≤ 80). Vacío o ausente → `{ conceptos: [], propuesta: null }`. |

**200**

```json
{
  "conceptos": [
    { "descripcion": "Almuerzo", "categoria": { "id": "bb9f…", "nombre": "Comida", "tipo": "gasto" } }
  ],
  "propuesta": {
    "categoria": { "id": "bb9f…", "nombre": "Comida", "tipo": "gasto" },
    "regla": { "id": "e4c1…", "palabraClave": "almuerzo" }
  }
}
```

- **`conceptos`:** descripciones ya usadas por el usuario en ese tipo que
  **empiezan** por `texto`, sin distinguir mayúsculas ni tildes («almu» →
  «Almuerzo», «cafe» → «Café»). Hasta 2, las más usadas primero. La
  `categoria` de cada uno es la que propone la regla para ese concepto (no la
  que tuvo antes); `null` si ninguna regla aplica. Al aceptar una sugerencia,
  el cliente completa la descripción y propone esa categoría.
- **`propuesta`:** la regla que coincide con `texto`. Una regla coincide si su
  palabra clave aparece como palabras completas y contiguas («barbería» no
  coincide con «bar»). Solo cuentan reglas cuya categoría es del `tipo` pedido.
  Si coinciden varias, gana la palabra clave más larga; en empate, la más
  reciente. Mostrarla como propuesta con su palabra clave («Sugerida por
  "almuerzo"»).
- **Transferencia:** nunca hay propuesta y los conceptos van con
  `categoria: null`.
- **Sin propuesta** (`null`) y el usuario elige una categoría: el cliente
  puede ofrecer crear la regla con `POST /reglas`. Si la propuesta fue
  corregida, puede ofrecer ajustarla con `PATCH /reglas/:id` usando
  `propuesta.regla.id`. Ver [`reglas.md`](reglas.md).

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `TIPO_MOVIMIENTO_INVALIDO` | `tipo` | Falta o no es válido. |
| 400 | `DESCRIPCION_LARGA` | `texto` | Más de 80 caracteres. |

---

## Necesidades → contrato

Las `N-xx` son de `specs/necesidades/captura-rapida.md`.

| N-xx | Dónde está |
|---|---|
| N-25 | `GET /sugerencias` → `conceptos`. |
| N-26 | `conceptos[].categoria`. |
| N-27 | `GET /captura` → `categorias.gasto`, `categorias.ingreso`. |
| N-28, N-58 | `GET /sugerencias` → `propuesta.categoria`, `propuesta.regla.palabraClave`. |
| N-32 | `GET /cuentas`. |
| N-33 | `GET /captura` → `cuentaPredeterminadaId`. |
| N-34 | `PATCH /perfil` ([`perfil.md`](perfil.md)). |
| N-47, N-48 | `POST /reglas`, `PATCH /reglas/:id` ([`reglas.md`](reglas.md)). |
| N-50, N-51 | Categorías y reglas sembradas al crear el usuario. |
| N-56 | `gastosHoy`. |
| N-57, N-59 | `conceptosFrecuentes`, listas vacías sin movimientos. |
| Fuera de alcance | N-01, N-02, N-03 (TRM, avisos, otros módulos), N-44 (persona), N-60 (indicador de sin clasificar). |
