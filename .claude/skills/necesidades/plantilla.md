# Plantilla del inventario de necesidades

Forma obligatoria de `specs/necesidades/<feature>.md`. No es texto para copiar literal: respeta secciones, columnas e IDs.

---

```markdown
# Necesidades — <Feature>

> **Diseño:** <ruta a la carpeta de diseño>
> **Fecha:** YYYY-MM-DD
> **Spec que la cubre:** (vacío hasta que exista el spec de la API, ej. SPEC 03)

## Pantalla: <data-screen-label>

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | La lista muestra el nombre de cada cuenta. | dato | explícita | |
| N-02 | Cada cuenta muestra su saldo actual. | dato | explícita | Calculado (ver choques). |
| N-03 | Botón "Nueva cuenta" abre el formulario de alta. | acción | explícita | |
| N-04 | Si no hay cuentas, se muestra un estado vacío con invitación a crear una. | estado | implícita | |
| N-05 | El nombre de la cuenta es obligatorio; si falta, se indica en el campo. | validación | implícita | |

## Pantalla: <siguiente data-screen-label>

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-06 | … | | | |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-02 | El saldo parece un valor fijo de la cuenta. | RN-01 | Se calcula a partir del saldo inicial y los movimientos. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-09 | Cupo disponible de la tarjeta. | REGLAS §7: tarjeta con ciclo, no construir todavía. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-10 | Nombre del usuario en el menú. | SPEC 02 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| N-03 | ¿La moneda de la cuenta se elige al crearla? | Sí, COP o USD. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
```

---

## Reglas del formato

- **Tipo:** `dato`, `acción`, `estado` o `validación`.
- **Origen:** `explícita` (se ve en el diseño) o `implícita` (hace falta aunque no se dibuje).
- IDs `N-NN` continuos en todo el documento, nunca por pantalla. Nunca se renumeran ni se reutilizan.
- Una necesidad que va a "Fuera de alcance", "Ya cubierto" o "Retiradas" conserva su ID.
- Secciones sin filas se dejan con la tabla vacía, no se borran.
- Nada de tablas de base de datos, columnas, tipos, endpoints ni DTOs.
