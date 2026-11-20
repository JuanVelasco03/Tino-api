# Reglas de categorización

> **Spec de origen:** SPEC 04 · Convenciones comunes en [`README.md`](README.md).

Una regla asocia una palabra clave a una categoría. `GET /sugerencias` las usa
para proponer categoría mientras se escribe ([`captura.md`](captura.md)).
RN-11: la categorización propone, el usuario dispone; al corregir, el cliente
**ofrece** crear o ajustar la regla. Nada se crea solo al registrar un
movimiento.

Todo usuario nace con reglas sembradas («almuerzo» → Comida, «uber» →
Transporte, «nomina» → Salario…). Hoy no se listan ni se borran.

---

## Resumen de endpoints

| Método y ruta | Cuerpo | Éxito |
|---|---|---|
| [`POST /reglas`](#post-reglas) | `{ palabraClave, categoriaId }` | `201 ReglaDto` |
| [`PATCH /reglas/:id`](#patch-reglasid) | `{ categoriaId }` | `200 ReglaDto` |

```ts
type ReglaDto = {
  id: string;
  palabraClave: string;   // normalizada: minúsculas, sin tildes, espacios colapsados
  categoria: { id: string; nombre: string; tipo: "gasto" | "ingreso" };
};
```

---

## `POST /reglas`

Crea la regla que el cliente ofreció cuando no hubo propuesta
(`propuesta: null`) y el usuario eligió una categoría.

```json
{ "palabraClave": "Peluquería", "categoriaId": "d3a9…" }
```

**201**

```json
{ "id": "f0b2…", "palabraClave": "peluqueria", "categoria": { "id": "d3a9…", "nombre": "Hogar", "tipo": "gasto" } }
```

La palabra clave se guarda normalizada («Peluquería» → «peluqueria»). Puede
tener varias palabras; coincide cuando aparecen completas y seguidas en la
descripción.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `PALABRA_CLAVE_REQUERIDA` | `palabraClave` | Falta o queda vacía al normalizar. |
| 400 | `PALABRA_CLAVE_LARGA` | `palabraClave` | Más de 60 caracteres normalizada. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaId` | No es un UUID, no existe o es de otro usuario. |
| 409 | `PALABRA_CLAVE_DUPLICADA` | `palabraClave` | Ya hay una regla con esa palabra clave (tras normalizar). En ese caso, ajustarla con `PATCH`. |

---

## `PATCH /reglas/:id`

Cambia la categoría de una regla. El cliente lo ofrece cuando el usuario
corrige una propuesta: el `id` es `propuesta.regla.id` de `GET /sugerencias`.

```json
{ "categoriaId": "a1b2…" }
```

**200** `ReglaDto` con la categoría nueva. La siguiente sugerencia ya la usa.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | — | `:id` no es un UUID. |
| 422 | `CATEGORIA_INVALIDA` | `categoriaId` | No es un UUID, no existe o es de otro usuario. |
| 404 | `REGLA_NO_ENCONTRADA` | — | La regla no existe o es de otro usuario. |

---

## Catálogo de errores del módulo

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `PALABRA_CLAVE_REQUERIDA` | 400 | `palabraClave` | Escribe una palabra clave. |
| `PALABRA_CLAVE_LARGA` | 400 | `palabraClave` | La palabra clave admite hasta 60 caracteres. |
| `PALABRA_CLAVE_DUPLICADA` | 409 | `palabraClave` | Ya tienes una regla con esa palabra clave. |
| `CATEGORIA_INVALIDA` | 422 | `categoriaId` | La categoría no existe o no corresponde al tipo. |
| `REGLA_NO_ENCONTRADA` | 404 | — | La regla no existe. |

Más los comunes: `NO_AUTENTICADO`, `ENTRADA_INVALIDA`, `ERROR_INTERNO`.
